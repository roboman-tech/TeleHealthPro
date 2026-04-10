import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db_base import Base

if TYPE_CHECKING:
    from app.models.appointment import Appointment
    from app.models.patient_record import PatientRecord
    from app.models.telehealth import TelehealthSession


class UserRole(str, enum.Enum):
    patient = "patient"
    provider = "provider"
    admin = "admin"


class ProviderReadiness(str, enum.Enum):
    registered = "registered"
    profile_completed = "profile_completed"
    credentials_reviewed = "credentials_reviewed"
    approved = "approved"
    bookable = "bookable"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_provider_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    provider_readiness: Mapped[ProviderReadiness | None] = mapped_column(
        Enum(ProviderReadiness, name="providerreadiness"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    patient_records: Mapped[list["PatientRecord"]] = relationship(back_populates="patient_user")
    appointments_as_patient: Mapped[list["Appointment"]] = relationship(
        foreign_keys="Appointment.patient_id",
        back_populates="patient",
    )
    appointments_as_provider: Mapped[list["Appointment"]] = relationship(
        foreign_keys="Appointment.provider_id",
        back_populates="provider",
    )
    telehealth_sessions_led: Mapped[list["TelehealthSession"]] = relationship(
        foreign_keys="TelehealthSession.provider_id",
        back_populates="provider",
    )
