"""
Central workflow layer for appointments + telehealth.

All meaningful state changes for booking, approval, telehealth start/end, completion,
cancel/reject/no-show should go through this module so routers stay thin and rules stay consistent.
See app.domain.lifecycle for canonical state meanings.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.models.appointment import Appointment, AppointmentStatus
from app.models.provider_availability import ProviderAvailability
from app.models.telehealth import TelehealthSession, TelehealthSessionStatus
from app.models.user import User, UserRole
from app.schemas.appointment import (
    AppointmentCreate,
    AppointmentDocumentationOut,
    AppointmentDocumentationUpdate,
    AppointmentUpdate,
)
from app.services.notifications import notify_patient_telehealth_ready, notify_provider_new_booking
from app.services.audit import record_audit_event

@dataclass(frozen=True)
class AppointmentPatchOutcome:
    """Result of PATCH /appointments/{id}; includes pre-mutation state for notifications."""

    appointment: Appointment
    previous_status: AppointmentStatus
    previous_start_at: datetime
    previous_end_at: datetime


# Edges allowed via PATCH (never in_progress — only start_telehealth sets that).
_PATCH_GRAPH: frozenset[tuple[AppointmentStatus, AppointmentStatus]] = frozenset(
    {
        (AppointmentStatus.pending, AppointmentStatus.approved),
        (AppointmentStatus.pending, AppointmentStatus.rejected),
        (AppointmentStatus.pending, AppointmentStatus.cancelled),
        (AppointmentStatus.pending, AppointmentStatus.reschedule_requested),
        (AppointmentStatus.pending, AppointmentStatus.no_show),
        (AppointmentStatus.approved, AppointmentStatus.cancelled),
        (AppointmentStatus.approved, AppointmentStatus.completed),
        (AppointmentStatus.approved, AppointmentStatus.no_show),
        (AppointmentStatus.approved, AppointmentStatus.reschedule_requested),
        (AppointmentStatus.approved, AppointmentStatus.rejected),
        (AppointmentStatus.in_progress, AppointmentStatus.cancelled),
        (AppointmentStatus.in_progress, AppointmentStatus.completed),
        (AppointmentStatus.in_progress, AppointmentStatus.no_show),
        (AppointmentStatus.reschedule_requested, AppointmentStatus.approved),
        (AppointmentStatus.reschedule_requested, AppointmentStatus.rejected),
        (AppointmentStatus.reschedule_requested, AppointmentStatus.cancelled),
        (AppointmentStatus.reschedule_requested, AppointmentStatus.completed),
    },
)

_PATIENT_PATCH: frozenset[tuple[AppointmentStatus, AppointmentStatus]] = frozenset(
    {
        (AppointmentStatus.pending, AppointmentStatus.cancelled),
        (AppointmentStatus.approved, AppointmentStatus.cancelled),
        (AppointmentStatus.in_progress, AppointmentStatus.cancelled),
        (AppointmentStatus.reschedule_requested, AppointmentStatus.cancelled),
        (AppointmentStatus.pending, AppointmentStatus.reschedule_requested),
        (AppointmentStatus.approved, AppointmentStatus.reschedule_requested),
    },
)

_PROVIDER_PATCH: frozenset[tuple[AppointmentStatus, AppointmentStatus]] = frozenset(
    {
        (AppointmentStatus.pending, AppointmentStatus.approved),
        (AppointmentStatus.pending, AppointmentStatus.rejected),
        (AppointmentStatus.pending, AppointmentStatus.no_show),
        (AppointmentStatus.pending, AppointmentStatus.cancelled),
        (AppointmentStatus.approved, AppointmentStatus.completed),
        (AppointmentStatus.approved, AppointmentStatus.no_show),
        (AppointmentStatus.approved, AppointmentStatus.rejected),
        (AppointmentStatus.approved, AppointmentStatus.cancelled),
        (AppointmentStatus.in_progress, AppointmentStatus.completed),
        (AppointmentStatus.in_progress, AppointmentStatus.no_show),
        (AppointmentStatus.in_progress, AppointmentStatus.cancelled),
        (AppointmentStatus.reschedule_requested, AppointmentStatus.approved),
        (AppointmentStatus.reschedule_requested, AppointmentStatus.rejected),
        (AppointmentStatus.reschedule_requested, AppointmentStatus.completed),
        (AppointmentStatus.reschedule_requested, AppointmentStatus.cancelled),
    },
)


def _validate_patch_transition(role: UserRole, old: AppointmentStatus, new: AppointmentStatus) -> None:
    if new == AppointmentStatus.in_progress:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="in_progress is set only when telehealth is started via the workflow",
        )
    if old == new:
        return
    edge = (old, new)
    if edge not in _PATCH_GRAPH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot change appointment from {old.value} to {new.value}",
        )
    if role == UserRole.admin:
        return
    if role == UserRole.patient:
        if edge not in _PATIENT_PATCH:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
        return
    if role == UserRole.provider:
        if edge not in _PROVIDER_PATCH:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")


async def expire_telehealth_for_appointment(db: AsyncSession, appointment_id: int) -> None:
    r = await db.execute(select(TelehealthSession).where(TelehealthSession.appointment_id == appointment_id))
    sess = r.scalar_one_or_none()
    if sess is None:
        return
    if sess.status in (TelehealthSessionStatus.ended, TelehealthSessionStatus.expired):
        return
    sess.status = TelehealthSessionStatus.expired
    if sess.ended_at is None:
        sess.ended_at = datetime.now(UTC)


async def appointment_fits_declared_availability(
    db: AsyncSession,
    provider_id: int,
    start_at: datetime,
    end_at: datetime,
) -> bool:
    """Return true only when the visit fits entirely inside a published availability window."""
    win = await db.scalar(
        select(ProviderAvailability.id).where(
            ProviderAvailability.provider_id == provider_id,
            ProviderAvailability.start_at <= start_at,
            ProviderAvailability.end_at >= end_at,
        ).limit(1),
    )
    return win is not None


async def provider_has_published_availability(db: AsyncSession, provider_id: int) -> bool:
    exists_id = await db.scalar(
        select(ProviderAvailability.id)
        .where(ProviderAvailability.provider_id == provider_id)
        .limit(1),
    )
    return exists_id is not None


async def slot_available(
    db: AsyncSession,
    provider_id: int,
    start_at: datetime,
    end_at: datetime,
    exclude_id: int | None = None,
) -> bool:
    q = select(Appointment.id).where(
        Appointment.provider_id == provider_id,
        Appointment.status.notin_(
            [
                AppointmentStatus.cancelled,
                AppointmentStatus.rejected,
                AppointmentStatus.completed,
                AppointmentStatus.no_show,
            ],
        ),
        Appointment.start_at < end_at,
        Appointment.end_at > start_at,
    )
    if exclude_id is not None:
        q = q.where(Appointment.id != exclude_id)
    conflict = await db.execute(q.limit(1))
    return conflict.scalar_one_or_none() is None


async def load_appointment_for_response(db: AsyncSession, appointment_id: int) -> Appointment:
    result = await db.execute(
        select(Appointment)
        .where(Appointment.id == appointment_id)
        .options(selectinload(Appointment.patient), selectinload(Appointment.provider)),
    )
    return result.scalar_one()


async def book_appointment(db: AsyncSession, patient: User, body: AppointmentCreate) -> Appointment:
    if body.end_at <= body.start_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="end_at must be after start_at")
    prov = await db.get(User, body.provider_id)
    if (
        prov is None
        or prov.role != UserRole.provider
        or not prov.is_active
        or not prov.is_provider_approved
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid provider")
    if not await slot_available(db, body.provider_id, body.start_at, body.end_at):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slot not available")
    if not await provider_has_published_availability(db, body.provider_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provider has not published hours yet",
        )
    if not await appointment_fits_declared_availability(db, body.provider_id, body.start_at, body.end_at):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Requested time is outside this provider's published availability",
        )
    appt = Appointment(
        patient_id=patient.id,
        provider_id=body.provider_id,
        start_at=body.start_at,
        end_at=body.end_at,
        status=AppointmentStatus.pending,
        notes=body.notes,
    )
    db.add(appt)
    await db.flush()
    await db.refresh(appt)
    await notify_provider_new_booking(db, appt.id, body.provider_id)
    return await load_appointment_for_response(db, appt.id)


def _validate_time_change_permission(current: User, appt: Appointment, body: AppointmentUpdate) -> None:
    if current.role == UserRole.admin:
        return
    if current.role == UserRole.provider:
        if appt.provider_id != current.id or not current.is_provider_approved:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
        if appt.status not in (
            AppointmentStatus.pending,
            AppointmentStatus.approved,
            AppointmentStatus.reschedule_requested,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Visit times cannot be changed in the current state",
            )
        return
    if current.role == UserRole.patient:
        if appt.patient_id != current.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
        if appt.status == AppointmentStatus.pending:
            return
        if appt.status == AppointmentStatus.reschedule_requested:
            return
        if body.status == AppointmentStatus.reschedule_requested and appt.status in (
            AppointmentStatus.approved,
            AppointmentStatus.pending,
        ):
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You may change times only when requesting a reschedule, while one is pending, or to fix a pending request",
        )
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")


def _ensure_appointment_access(current: User, appt: Appointment) -> None:
    if current.role == UserRole.admin:
        return
    if current.role == UserRole.patient:
        if appt.patient_id != current.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
        return
    if current.role == UserRole.provider:
        if appt.provider_id != current.id or not current.is_provider_approved:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")


async def _deny_provider_if_patient_inactive(db: AsyncSession, current: User, appt: Appointment) -> None:
    if current.role != UserRole.provider:
        return
    patient = await db.get(User, appt.patient_id)
    if patient is None or not patient.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")


async def apply_appointment_update(
    db: AsyncSession,
    current: User,
    appointment_id: int,
    body: AppointmentUpdate,
) -> AppointmentPatchOutcome:
    appt = await db.get(Appointment, appointment_id)
    if appt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    _ensure_appointment_access(current, appt)
    await _deny_provider_if_patient_inactive(db, current, appt)

    previous_status = appt.status
    previous_start_at = appt.start_at
    previous_end_at = appt.end_at

    payload = body.model_dump(exclude_unset=True)
    wants_times = "start_at" in payload or "end_at" in payload
    if wants_times:
        if "start_at" not in payload or "end_at" not in payload:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="start_at and end_at must be provided together",
            )
        assert body.start_at is not None and body.end_at is not None
        if body.start_at == appt.start_at and body.end_at == appt.end_at:
            wants_times = False
        else:
            if body.end_at <= body.start_at:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="end_at must be after start_at",
                )
            _validate_time_change_permission(current, appt, body)
            if not await slot_available(db, appt.provider_id, body.start_at, body.end_at, exclude_id=appt.id):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slot not available")
            if not await provider_has_published_availability(db, appt.provider_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Provider has not published hours yet",
                )
            if not await appointment_fits_declared_availability(
                db,
                appt.provider_id,
                body.start_at,
                body.end_at,
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Requested time is outside this provider's published availability",
                )

    if body.status is not None:
        if body.status == AppointmentStatus.completed and current.role not in (
            UserRole.provider,
            UserRole.admin,
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only a provider or administrator can mark a visit completed",
            )
        if body.status == AppointmentStatus.completed and current.role in (
            UserRole.provider,
            UserRole.admin,
        ):
            if appt.status not in (
                AppointmentStatus.approved,
                AppointmentStatus.pending,
                AppointmentStatus.in_progress,
                AppointmentStatus.reschedule_requested,
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Visit cannot be marked completed from this state",
                )
        _validate_patch_transition(current.role, appt.status, body.status)
        appt.status = body.status

    if body.notes is not None:
        appt.notes = body.notes

    if wants_times:
        assert body.start_at is not None and body.end_at is not None
        appt.start_at = body.start_at
        appt.end_at = body.end_at

    await db.flush()

    if body.status is not None and body.status in (
        AppointmentStatus.cancelled,
        AppointmentStatus.rejected,
        AppointmentStatus.no_show,
    ):
        await expire_telehealth_for_appointment(db, appointment_id)
        await db.flush()
    elif (
        body.status is not None
        and body.status == AppointmentStatus.approved
        and previous_status != AppointmentStatus.approved
    ):
        # When a visit is approved, create a telehealth room row immediately so it appears
        # under Telehealth without a separate "Start telehealth" click (that action still
        # marks the visit in_progress and opens the room).
        prov = await _provider_for_telehealth_bootstrap(db, current, appt)
        if prov is not None:
            await _create_or_get_telehealth_session(db, prov, appt)
            await db.flush()

    loaded = await load_appointment_for_response(db, appointment_id)
    return AppointmentPatchOutcome(
        appointment=loaded,
        previous_status=previous_status,
        previous_start_at=previous_start_at,
        previous_end_at=previous_end_at,
    )


def _mark_visit_in_progress_if_needed(appt: Appointment) -> None:
    if appt.status in (AppointmentStatus.approved, AppointmentStatus.pending):
        appt.status = AppointmentStatus.in_progress


async def _provider_for_telehealth_bootstrap(db: AsyncSession, current: User, appt: Appointment) -> User | None:
    """Provider user who owns the telehealth room for this appointment (or admin acting on their behalf)."""
    if current.role == UserRole.provider:
        if current.id != appt.provider_id or not current.is_provider_approved:
            return None
        return current
    if current.role == UserRole.admin:
        u = await db.get(User, appt.provider_id)
        if u is None or u.role != UserRole.provider or not u.is_provider_approved:
            return None
        return u
    return None


async def _create_or_get_telehealth_session(
    db: AsyncSession,
    provider: User,
    appt: Appointment,
) -> tuple[TelehealthSession | None, bool]:
    """Returns (session, created_new). None if the visit slot has ended and no room exists yet."""
    existing = await db.execute(select(TelehealthSession).where(TelehealthSession.appointment_id == appt.id))
    existing_sess = existing.scalar_one_or_none()
    if existing_sess is not None:
        return existing_sess, False
    now = datetime.now(UTC)
    if appt.end_at < now:
        return None, False
    token = secrets.token_urlsafe(32)
    settings = get_settings()
    base = settings.frontend_base_url.rstrip("/")
    secure_join_url = f"{base}/session?t={token}"
    session = TelehealthSession(
        appointment_id=appt.id,
        provider_id=provider.id,
        status=TelehealthSessionStatus.ready,
        secure_join_url=secure_join_url,
        session_metadata={"token": token, "created_by": provider.id},
        activity_log=[],
    )
    db.add(session)
    await db.flush()
    await db.refresh(session)
    await notify_patient_telehealth_ready(db, appt.patient_id, appt.id, session.id)
    return session, True


@dataclass(frozen=True)
class StartTelehealthResult:
    session: TelehealthSession
    created: bool


async def start_telehealth(
    db: AsyncSession,
    provider: User,
    appointment_id: int,
) -> StartTelehealthResult:
    if not provider.is_provider_approved:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Provider not approved")
    appt = await db.get(Appointment, appointment_id)
    if appt is None or appt.provider_id != provider.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    patient = await db.get(User, appt.patient_id)
    if patient is None or not patient.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    if appt.status not in (
        AppointmentStatus.approved,
        AppointmentStatus.pending,
        AppointmentStatus.in_progress,
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid appointment state")

    sess, created = await _create_or_get_telehealth_session(db, provider, appt)
    if sess is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Scheduled visit has ended. Open Telehealth if a room already exists, or book a new appointment.",
        )
    _mark_visit_in_progress_if_needed(appt)
    await db.flush()
    return StartTelehealthResult(session=sess, created=created)


async def end_telehealth_session(
    db: AsyncSession,
    actor: User,
    sess: TelehealthSession,
) -> TelehealthSession:
    if actor.role == UserRole.provider and sess.provider_id != actor.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    if actor.role not in (UserRole.provider, UserRole.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    if sess.status in (TelehealthSessionStatus.ended, TelehealthSessionStatus.expired):
        return sess
    now = datetime.now(UTC)
    sess.status = TelehealthSessionStatus.ended
    sess.ended_at = now
    log = list(sess.activity_log or [])
    log.append({"at": now.isoformat(), "user_id": actor.id, "event": {"action": "session_ended"}})
    sess.activity_log = log
    await db.flush()
    await db.refresh(sess)
    return sess


def _documentation_for_role(appt: Appointment, role: UserRole) -> AppointmentDocumentationOut:
    if role == UserRole.patient:
        return AppointmentDocumentationOut(
            visit_notes=None,
            diagnosis_summary=None,
            care_plan=None,
            internal_provider_note=None,
            follow_up_instructions=appt.follow_up_instructions,
            patient_after_visit_summary=appt.patient_after_visit_summary,
        )
    return AppointmentDocumentationOut(
        visit_notes=appt.visit_notes,
        diagnosis_summary=appt.diagnosis_summary,
        care_plan=appt.care_plan,
        follow_up_instructions=appt.follow_up_instructions,
        internal_provider_note=appt.internal_provider_note,
        patient_after_visit_summary=appt.patient_after_visit_summary,
    )


def _ensure_documentation_read_access(current: User, appt: Appointment) -> None:
    if current.role == UserRole.admin:
        return
    if current.role == UserRole.patient and appt.patient_id == current.id:
        return
    if (
        current.role == UserRole.provider
        and appt.provider_id == current.id
        and current.is_provider_approved
    ):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")


async def get_appointment_documentation(
    db: AsyncSession,
    current: User,
    appointment_id: int,
) -> AppointmentDocumentationOut:
    appt = await db.get(Appointment, appointment_id)
    if appt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    _ensure_documentation_read_access(current, appt)
    await _deny_provider_if_patient_inactive(db, current, appt)
    return _documentation_for_role(appt, current.role)


async def patch_appointment_documentation(
    db: AsyncSession,
    current: User,
    appointment_id: int,
    body: AppointmentDocumentationUpdate,
) -> AppointmentDocumentationOut:
    if current.role not in (UserRole.provider, UserRole.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    appt = await db.get(Appointment, appointment_id)
    if appt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    if current.role == UserRole.provider and (
        appt.provider_id != current.id or not current.is_provider_approved
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    await _deny_provider_if_patient_inactive(db, current, appt)
    changed = list(body.model_dump(exclude_unset=True).keys())
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(appt, key, value)
    await db.flush()
    await record_audit_event(
        db,
        actor=current,
        action="documentation.updated",
        resource_type="appointment",
        resource_id=appointment_id,
        metadata={"changed_fields": changed},
    )
    return _documentation_for_role(appt, current.role)
