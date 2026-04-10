"""Domain documentation and shared lifecycle semantics."""

from app.domain.lifecycle import (
    APPOINTMENT_STATUSES,
    TELEHEALTH_SESSION_STATUSES,
    AppointmentStatus,
    TelehealthSessionStatus,
)

__all__ = [
    "APPOINTMENT_STATUSES",
    "TELEHEALTH_SESSION_STATUSES",
    "AppointmentStatus",
    "TelehealthSessionStatus",
]
