from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.models.appointment import Appointment, AppointmentStatus
from app.models.audit_event import AuditEvent
from app.models.telehealth import TelehealthSession, TelehealthSessionStatus
from app.models.user_notification import UserNotification
from app.models.provider_availability import ProviderAvailability
from app.models.user import ProviderReadiness, User, UserRole
from app.schemas.admin import UserAdminUpdate
from app.schemas.auth import UserOut

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/metrics/summary")
async def metrics_summary(
    _: User = Depends(require_roles(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """High-level counts for dashboard; extend with per-day/week aggregates and caching."""
    patients = await db.execute(
        select(func.count()).select_from(User).where(
            User.role == UserRole.patient,
            User.is_active.is_(True),
        ),
    )
    # Match admin user directory: approved accounts, not only bookable (availability) state.
    providers = await db.execute(
        select(func.count()).select_from(User).where(
            User.role == UserRole.provider,
            User.is_active.is_(True),
            User.is_provider_approved.is_(True),
        ),
    )
    appts = await db.execute(select(func.count()).select_from(Appointment))
    sessions = await db.execute(select(func.count()).select_from(TelehealthSession))
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    start_dt = datetime.combine(week_start, datetime.min.time(), tzinfo=timezone.utc)
    appts_week = await db.execute(
        select(func.count()).select_from(Appointment).where(Appointment.start_at >= start_dt),
    )
    return {
        "active_patients": patients.scalar_one(),
        "active_providers": providers.scalar_one(),
        "appointments_total": appts.scalar_one(),
        "appointments_this_week": appts_week.scalar_one(),
        "telehealth_sessions_total": sessions.scalar_one(),
    }


@router.get("/users", response_model=list[UserOut])
async def list_users(
    _: User = Depends(require_roles(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
    role: UserRole | None = None,
) -> list[User]:
    q = select(User)
    if role is not None:
        q = q.where(User.role == role)
    q = q.order_by(User.id)
    result = await db.execute(q)
    return list(result.scalars().all())


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    body: UserAdminUpdate,
    _: User = Depends(require_roles(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    data = body.model_dump(exclude_unset=True)
    if "is_active" in data:
        user.is_active = data["is_active"]
    if "is_provider_approved" in data and user.role == UserRole.provider:
        user.is_provider_approved = data["is_provider_approved"]
        if not user.is_provider_approved:
            user.provider_readiness = ProviderReadiness.registered
        elif user.provider_readiness in (None, ProviderReadiness.registered):
            user.provider_readiness = ProviderReadiness.approved
    if "provider_readiness" in data and user.role == UserRole.provider:
        user.provider_readiness = data["provider_readiness"]
    await db.flush()
    await db.refresh(user)
    return user


@router.get("/logs")
async def audit_logs_stub(
    _: User = Depends(require_roles(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
) -> dict:
    rows = await db.execute(select(AuditEvent).order_by(AuditEvent.occurred_at.desc()).limit(200))
    entries = []
    for e in rows.scalars().all():
        entries.append(
            {
                "id": e.id,
                "occurred_at": e.occurred_at,
                "actor_user_id": e.actor_user_id,
                "action": e.action,
                "resource_type": e.resource_type,
                "resource_id": e.resource_id,
                "outcome": e.outcome,
                "metadata": e.meta,
            },
        )
    return {
        "message": "Audit events (append-only). Use as ops source of truth; wire to SIEM in production.",
        "entries": entries,
    }


@router.get("/ops/summary")
async def ops_summary(
    _: User = Depends(require_roles(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Actionable operational counters (stuck flows, failures, backlogs)."""
    now = datetime.now(timezone.utc)
    stuck_in_progress = await db.execute(
        select(func.count()).select_from(Appointment).where(
            Appointment.status == AppointmentStatus.in_progress,
            Appointment.start_at < (now - timedelta(hours=6)),
        )
    )
    stuck_ready_sessions = await db.execute(
        select(func.count()).select_from(TelehealthSession).where(
            TelehealthSession.status == TelehealthSessionStatus.ready,
            TelehealthSession.created_at < (now - timedelta(hours=2)),
        )
    )
    failed_notifs = await db.execute(
        select(func.count()).select_from(UserNotification).where(UserNotification.ws_push_status == "failed")
    )
    provider_backlog = await db.execute(
        select(func.count()).select_from(User).where(
            User.role == UserRole.provider,
            User.is_active.is_(True),
            User.provider_readiness != ProviderReadiness.bookable,
        )
    )
    return {
        "stuck_appointments_in_progress": stuck_in_progress.scalar_one(),
        "stuck_sessions_ready": stuck_ready_sessions.scalar_one(),
        "failed_notification_pushes": failed_notifs.scalar_one(),
        "providers_not_bookable": provider_backlog.scalar_one(),
    }


@router.post("/providers/{user_id}/approve")
async def approve_provider(
    user_id: int,
    current: User = Depends(require_roles(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
) -> dict:
    del current
    user = await db.get(User, user_id)
    if user is None or user.role != UserRole.provider:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
    user.is_provider_approved = True
    has_hours = await db.scalar(
        select(ProviderAvailability.id).where(ProviderAvailability.provider_id == user.id).limit(1),
    )
    user.provider_readiness = ProviderReadiness.bookable if has_hours is not None else ProviderReadiness.approved
    await db.flush()
    return {"ok": True, "user_id": user_id}