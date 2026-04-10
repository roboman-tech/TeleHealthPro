from datetime import datetime, timedelta

from app.models.appointment import Appointment
from app.models.telehealth import TelehealthSession, TelehealthSessionStatus
from app.models.user import UserRole


def advance_presence(sess: TelehealthSession, role: UserRole) -> None:
    """Move session status when a participant opens the meeting (idempotent-ish)."""
    if sess.status in (TelehealthSessionStatus.ended, TelehealthSessionStatus.expired):
        return
    if role == UserRole.admin:
        return
    if role == UserRole.provider:
        if sess.status == TelehealthSessionStatus.ready:
            sess.status = TelehealthSessionStatus.provider_joined
        elif sess.status == TelehealthSessionStatus.patient_joined:
            sess.status = TelehealthSessionStatus.live
        return
    if role == UserRole.patient:
        if sess.status == TelehealthSessionStatus.ready:
            sess.status = TelehealthSessionStatus.patient_joined
        elif sess.status == TelehealthSessionStatus.provider_joined:
            sess.status = TelehealthSessionStatus.live
        return


def maybe_auto_expire_session(
    sess: TelehealthSession,
    appt: Appointment,
    *,
    now: datetime,
    no_join_timeout_minutes: int,
    after_end_timeout_minutes: int,
) -> bool:
    """
    Delivery-level guardrails so old rooms don’t remain joinable forever.

    This does not change the appointment business state; it only expires the session delivery state.
    """
    if sess.status in (TelehealthSessionStatus.ended, TelehealthSessionStatus.expired):
        return False

    # If nobody joined for too long after the appointment start, expire the room.
    if sess.status == TelehealthSessionStatus.ready:
        if now >= appt.start_at + timedelta(minutes=no_join_timeout_minutes):
            sess.status = TelehealthSessionStatus.expired
            if sess.ended_at is None:
                sess.ended_at = now
            return True

    # After appointment end + grace, expire any still-open room.
    if now >= appt.end_at + timedelta(minutes=after_end_timeout_minutes):
        sess.status = TelehealthSessionStatus.expired
        if sess.ended_at is None:
            sess.ended_at = now
        return True

    return False
