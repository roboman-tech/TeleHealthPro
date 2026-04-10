from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.appointment import Appointment, AppointmentStatus
from app.models.telehealth import TelehealthSession
from app.models.user import User, UserRole


async def get_telehealth_session_for_user(
    db: AsyncSession,
    current: User,
    session_id: int,
) -> TelehealthSession:
    sess = await db.get(TelehealthSession, session_id)
    if sess is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    appt = await db.get(Appointment, sess.appointment_id)
    if appt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment missing")
    if appt.status in (
        AppointmentStatus.cancelled,
        AppointmentStatus.rejected,
        AppointmentStatus.no_show,
    ):
        if current.role != UserRole.admin:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This visit is no longer available for telehealth",
            )
    if current.role == UserRole.admin:
        return sess
    if current.role == UserRole.patient and appt.patient_id == current.id:
        return sess
    if current.role == UserRole.provider and sess.provider_id == current.id:
        patient = await db.get(User, appt.patient_id)
        if patient is None or not patient.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        return sess
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
