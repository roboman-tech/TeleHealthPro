from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.models.appointment import Appointment
from app.models.user import User, UserRole
from app.schemas.appointment import (
    AppointmentCreate,
    AppointmentDocumentationOut,
    AppointmentDocumentationUpdate,
    AppointmentOut,
    AppointmentUpdate,
)
from app.services.notifications import dispatch_appointment_patch_notifications
from app.services.visit_workflow import (
    apply_appointment_update,
    book_appointment,
    get_appointment_documentation,
    patch_appointment_documentation,
)

router = APIRouter(prefix="/appointments", tags=["appointments"])


def _appointment_out(appt: Appointment) -> AppointmentOut:
    return AppointmentOut(
        id=appt.id,
        patient_id=appt.patient_id,
        provider_id=appt.provider_id,
        start_at=appt.start_at,
        end_at=appt.end_at,
        status=appt.status,
        notes=appt.notes,
        patient_name=appt.patient.full_name if appt.patient else None,
        provider_name=appt.provider.full_name if appt.provider else None,
    )


@router.post("", response_model=AppointmentOut, status_code=status.HTTP_201_CREATED)
async def book_appointment_route(
    body: AppointmentCreate,
    current: User = Depends(require_roles(UserRole.patient)),
    db: AsyncSession = Depends(get_db),
) -> AppointmentOut:
    appt = await book_appointment(db, current, body)
    return _appointment_out(appt)


@router.get("/mine", response_model=list[AppointmentOut])
async def list_my_appointments(
    current: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AppointmentOut]:
    if current.role == UserRole.patient:
        q = select(Appointment).where(Appointment.patient_id == current.id)
    elif current.role == UserRole.provider:
        # Hide visits for deactivated patients so the clinical workspace matches admin account state.
        q = (
            select(Appointment)
            .join(User, User.id == Appointment.patient_id)
            .where(
                Appointment.provider_id == current.id,
                User.role == UserRole.patient,
                User.is_active.is_(True),
            )
        )
    else:
        q = select(Appointment)
    q = q.options(selectinload(Appointment.patient), selectinload(Appointment.provider)).order_by(
        Appointment.start_at.desc(),
    )
    result = await db.execute(q)
    rows = list(result.scalars().all())
    return [_appointment_out(a) for a in rows]


@router.get("/{appointment_id}/documentation", response_model=AppointmentDocumentationOut)
async def get_visit_documentation(
    appointment_id: int,
    current: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AppointmentDocumentationOut:
    return await get_appointment_documentation(db, current, appointment_id)


@router.patch("/{appointment_id}/documentation", response_model=AppointmentDocumentationOut)
async def patch_visit_documentation(
    appointment_id: int,
    body: AppointmentDocumentationUpdate,
    current: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AppointmentDocumentationOut:
    return await patch_appointment_documentation(db, current, appointment_id, body)


@router.patch("/{appointment_id}", response_model=AppointmentOut)
async def update_appointment(
    appointment_id: int,
    body: AppointmentUpdate,
    current: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AppointmentOut:
    outcome = await apply_appointment_update(db, current, appointment_id, body)
    await dispatch_appointment_patch_notifications(
        db,
        current=current,
        body=body,
        appt=outcome.appointment,
        old_status=outcome.previous_status,
        old_start=outcome.previous_start_at,
        old_end=outcome.previous_end_at,
    )
    return _appointment_out(outcome.appointment)
