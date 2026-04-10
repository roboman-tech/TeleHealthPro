from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import require_roles
from app.models.user import User, UserRole
from app.services.clinical_repository import get_index_by_fhir, get_latest_resources_for_patient
from app.services.clinical_fhir_builders import fhir_bundle

router = APIRouter(prefix="/integrations/fhir", tags=["fhir"])


@router.get("/Patient/{patient_fhir_id}")
async def proxy_fhir_patient(
    patient_fhir_id: str,
    _: User = Depends(require_roles(UserRole.provider, UserRole.admin)),
) -> dict:
    patient_fhir_id = patient_fhir_id.strip()
    idx = await get_index_by_fhir(patient_fhir_id)
    if idx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    resources = await get_latest_resources_for_patient(patient_fhir_id)
    entries = [r.resource_json for r in resources]
    # Return a Bundle to emulate a FHIR server response.
    return fhir_bundle(entries=entries)


@router.get("/me/patient-export")
async def my_fhir_export(
    current: User = Depends(require_roles(UserRole.patient)),
) -> dict:
    """Placeholder: map local record to FHIR Patient bundle when integration exists."""
    return {"message": "Map local PatientRecord to FHIR Patient resource in integration layer", "user_id": current.id}
