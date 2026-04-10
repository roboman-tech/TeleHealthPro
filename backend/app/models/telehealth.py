import enum
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db_base import Base

if TYPE_CHECKING:
    from app.models.appointment import Appointment
    from app.models.user import User


class TelehealthSessionStatus(str, enum.Enum):
    ready = "ready"
    patient_joined = "patient_joined"
    provider_joined = "provider_joined"
    live = "live"
    ended = "ended"
    expired = "expired"


class TelehealthSession(Base):
    __tablename__ = "telehealth_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    appointment_id: Mapped[int] = mapped_column(
        ForeignKey("appointments.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )
    provider_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[TelehealthSessionStatus] = mapped_column(
        Enum(TelehealthSessionStatus, name="telehealthsessionstatus"),
        default=TelehealthSessionStatus.ready,
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    secure_join_url: Mapped[str] = mapped_column(String(2048))
    session_metadata: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    activity_log: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    appointment: Mapped["Appointment"] = relationship(back_populates="telehealth_session")
    provider: Mapped["User"] = relationship(
        foreign_keys=[provider_id],
        back_populates="telehealth_sessions_led",
    )
