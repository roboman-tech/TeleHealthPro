from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db_base import Base

if TYPE_CHECKING:
    from app.models.user import User


class PatientRecord(Base):
    """Demographics, medical history, lab snapshots; FHIR sync can populate JSON fields."""

    __tablename__ = "patient_records"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    demographics: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    medical_history: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    lab_results: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    fhir_resource_refs: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    patient_user: Mapped["User"] = relationship(back_populates="patient_records")
