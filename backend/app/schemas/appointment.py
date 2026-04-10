from datetime import datetime

from pydantic import BaseModel

from app.models.appointment import AppointmentStatus


class AppointmentCreate(BaseModel):
    provider_id: int
    start_at: datetime
    end_at: datetime
    notes: str | None = None


class AppointmentUpdate(BaseModel):
    status: AppointmentStatus | None = None
    notes: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None


class AppointmentOut(BaseModel):
    id: int
    patient_id: int
    provider_id: int
    start_at: datetime
    end_at: datetime
    status: AppointmentStatus
    notes: str | None
    patient_name: str | None = None
    provider_name: str | None = None

    model_config = {"from_attributes": True}


class AppointmentDocumentationOut(BaseModel):
    """Clinical documentation for a visit. Patient role receives only patient-safe fields (others null)."""

    visit_notes: str | None = None
    diagnosis_summary: str | None = None
    care_plan: str | None = None
    follow_up_instructions: str | None = None
    internal_provider_note: str | None = None
    patient_after_visit_summary: str | None = None


class AppointmentDocumentationUpdate(BaseModel):
    visit_notes: str | None = None
    diagnosis_summary: str | None = None
    care_plan: str | None = None
    follow_up_instructions: str | None = None
    internal_provider_note: str | None = None
    patient_after_visit_summary: str | None = None
