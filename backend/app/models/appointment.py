import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db_base import Base

if TYPE_CHECKING:
    from app.models.telehealth import TelehealthSession
    from app.models.user import User


class AppointmentStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    in_progress = "in_progress"
    rejected = "rejected"
    completed = "completed"
    cancelled = "cancelled"
    reschedule_requested = "reschedule_requested"
    no_show = "no_show"


class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[AppointmentStatus] = mapped_column(Enum(AppointmentStatus), default=AppointmentStatus.pending)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    visit_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    diagnosis_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    care_plan: Mapped[str | None] = mapped_column(Text, nullable=True)
    follow_up_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    internal_provider_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    patient_after_visit_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    patient: Mapped["User"] = relationship(foreign_keys=[patient_id], back_populates="appointments_as_patient")
    provider: Mapped["User"] = relationship(foreign_keys=[provider_id], back_populates="appointments_as_provider")
    telehealth_session: Mapped["TelehealthSession | None"] = relationship(
        back_populates="appointment",
        uselist=False,
    )
