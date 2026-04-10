from typing import Any

from pydantic import BaseModel, Field


class PatientRecordCreate(BaseModel):
    demographics: dict[str, Any] = Field(default_factory=dict)
    medical_history: dict[str, Any] = Field(default_factory=dict)
    lab_results: dict[str, Any] = Field(default_factory=dict)


class PatientRecordUpdate(BaseModel):
    demographics: dict[str, Any] | None = None
    medical_history: dict[str, Any] | None = None
    lab_results: dict[str, Any] | None = None


class PatientRecordOut(BaseModel):
    id: int
    patient_id: int
    demographics: dict[str, Any]
    medical_history: dict[str, Any]
    lab_results: dict[str, Any]
    fhir_resource_refs: dict[str, Any] | None

    model_config = {"from_attributes": True}
