"""Push notifications via WebSocket and persist rows for inbox/history."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.appointment import Appointment, AppointmentStatus
from app.models.user import User, UserRole
from app.models.user_notification import UserNotification
from app.schemas.appointment import AppointmentUpdate
from app.realtime.manager import notification_hub

logger = logging.getLogger(__name__)


async def _persist_and_push(
    db: AsyncSession,
    user_id: int,
    *,
    notif_type: str,
    title: str,
    body: str | None = None,
    appointment_id: int | None = None,
    session_id: int | None = None,
) -> None:
    row = UserNotification(
        user_id=user_id,
        type=notif_type,
        title=title,
        body=body,
        appointment_id=appointment_id,
        session_id=session_id,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    payload: dict[str, Any] = {
        "type": notif_type,
        "title": title,
        "notification_id": row.id,
    }
    if body is not None:
        payload["body"] = body
    if appointment_id is not None:
        payload["appointment_id"] = appointment_id
    if session_id is not None:
        payload["session_id"] = session_id
    now = datetime.now(UTC)
    try:
        outcome = await notification_hub.send_to_user(user_id, payload)
        delivered = outcome.get("delivered", 0)
        attempted = outcome.get("attempted", 0)
        row.ws_push_at = now
        row.ws_push_socket_count = attempted
        row.ws_push_status = "sent" if delivered > 0 else "skipped_no_subscribers"
    except Exception:
        row.ws_push_at = now
        row.ws_push_status = "failed"
    await db.flush()


async def notify_provider_new_booking(db: AsyncSession, appointment_id: int, provider_id: int) -> None:
    logger.info(
        "notify_provider_new_booking",
        extra={"appointment_id": appointment_id, "provider_id": provider_id},
    )
    await _persist_and_push(
        db,
        provider_id,
        notif_type="appointment.booked",
        title="New appointment request",
        body=f"Appointment #{appointment_id} is waiting for your review.",
        appointment_id=appointment_id,
    )


async def notify_patient_appointment_approved(
    db: AsyncSession,
    patient_id: int,
    appointment_id: int,
) -> None:
    await _persist_and_push(
        db,
        patient_id,
        notif_type="appointment.approved",
        title="Visit confirmed",
        body=f"Your appointment #{appointment_id} has been approved.",
        appointment_id=appointment_id,
    )


async def notify_patient_appointment_completed(
    db: AsyncSession,
    patient_id: int,
    appointment_id: int,
) -> None:
    await _persist_and_push(
        db,
        patient_id,
        notif_type="appointment.completed",
        title="Visit completed",
        body=f"Your appointment #{appointment_id} has been marked completed.",
        appointment_id=appointment_id,
    )


async def notify_patient_telehealth_ready(
    db: AsyncSession,
    patient_id: int,
    appointment_id: int,
    session_id: int,
) -> None:
    await _persist_and_push(
        db,
        patient_id,
        notif_type="telehealth.session_ready",
        title="Telehealth session ready",
        body="Your provider started a virtual visit. Open Telehealth to join.",
        appointment_id=appointment_id,
        session_id=session_id,
    )


async def notify_provider_reschedule_requested(
    db: AsyncSession,
    provider_id: int,
    appointment_id: int,
) -> None:
    await _persist_and_push(
        db,
        provider_id,
        notif_type="appointment.reschedule_requested",
        title="Reschedule requested",
        body=f"Patient asked to move appointment #{appointment_id}. Review and propose a new time if needed.",
        appointment_id=appointment_id,
    )


async def notify_provider_patient_revised_times(
    db: AsyncSession,
    provider_id: int,
    appointment_id: int,
) -> None:
    await _persist_and_push(
        db,
        provider_id,
        notif_type="appointment.patient_revised_times",
        title="Patient updated proposed times",
        body=f"Appointment #{appointment_id}: the patient submitted different suggested start/end times.",
        appointment_id=appointment_id,
    )


def should_notify_approval(old: AppointmentStatus, new: AppointmentStatus) -> bool:
    return new == AppointmentStatus.approved and old != AppointmentStatus.approved


def should_notify_completed(old: AppointmentStatus, new: AppointmentStatus) -> bool:
    return new == AppointmentStatus.completed and old != AppointmentStatus.completed


def should_notify_reschedule_requested(old: AppointmentStatus, new: AppointmentStatus) -> bool:
    return new == AppointmentStatus.reschedule_requested and old != AppointmentStatus.reschedule_requested


async def dispatch_appointment_patch_notifications(
    db: AsyncSession,
    *,
    current: User,
    body: AppointmentUpdate,
    appt: Appointment,
    old_status: AppointmentStatus,
    old_start: datetime,
    old_end: datetime,
) -> None:
    """Side effects after a successful appointment PATCH (patient + provider inbox)."""
    if body.status is not None and should_notify_approval(old_status, body.status):
        await notify_patient_appointment_approved(db, appt.patient_id, appt.id)
    if body.status is not None and should_notify_completed(old_status, body.status):
        await notify_patient_appointment_completed(db, appt.patient_id, appt.id)

    if current.role == UserRole.patient:
        if body.status is not None and should_notify_reschedule_requested(old_status, body.status):
            await notify_provider_reschedule_requested(db, appt.provider_id, appt.id)
        elif (
            old_status == AppointmentStatus.reschedule_requested
            and (old_start != appt.start_at or old_end != appt.end_at)
            and body.status is None
        ):
            await notify_provider_patient_revised_times(db, appt.provider_id, appt.id)
