from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.models.user import User, UserRole
from app.services.clinical_service import (
    patient_get_my_clinical,
    patient_put_my_clinical,
    provider_fetch_by_appointment_id,
    provider_fetch_by_fhir_patient_id,
    provider_fetch_by_patient_user_id,
    provider_list_my_patients,
)

router = APIRouter(prefix="/clinical", tags=["clinical"])


@router.get("/me")
async def get_my_clinical(
    current: User = Depends(require_roles(UserRole.patient)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    # SQLite acts like local FHIR repository; return both parsed fields and raw Bundle.
    return await patient_get_my_clinical(patient=current)


@router.put("/me")
async def put_my_clinical(
    body: dict[str, Any],
    current: User = Depends(require_roles(UserRole.patient)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    medical_history = body.get("medical_history")
    lab_results = body.get("lab_results")
    fhir_patient_id = body.get("fhir_patient_id")
    if not isinstance(medical_history, dict) or not isinstance(lab_results, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="medical_history and lab_results must be JSON objects")
    if fhir_patient_id is not None and not isinstance(fhir_patient_id, str):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="fhir_patient_id must be a string")
    history_text = str(medical_history.get("narrative") or "")
    labs_text = str(lab_results.get("narrative") or "")
    return await patient_put_my_clinical(
        db=db,
        patient=current,
        history_text=history_text,
        labs_text=labs_text,
        requested_fhir_patient_id=fhir_patient_id,
    )


@router.get("/by-fhir/{fhir_patient_id}")
async def get_by_fhir_patient_id(
    fhir_patient_id: str,
    current: User = Depends(require_roles(UserRole.provider, UserRole.admin)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    fhir_patient_id = fhir_patient_id.strip()
    if not fhir_patient_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="FHIR patient id is required")
    if current.role == UserRole.admin:
        # Admin demo path: allow fetch by FHIR id without assignment checks.
        # Reuse provider path by temporarily using provider role logic isn't appropriate; keep minimal:
        return await provider_fetch_by_fhir_patient_id(db=db, provider=current, fhir_patient_id=fhir_patient_id)  # type: ignore[arg-type]
    return await provider_fetch_by_fhir_patient_id(db=db, provider=current, fhir_patient_id=fhir_patient_id)


@router.get("/my-patients")
async def fetch_all_my_patients(
    current: User = Depends(require_roles(UserRole.provider)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    # Lightweight list: assigned patients + fhir id mapping + availability flag.
    return await provider_list_my_patients(db=db, provider=current)


@router.get("/patient/{patient_user_id}")
async def get_by_patient_user_id(
    patient_user_id: int,
    current: User = Depends(require_roles(UserRole.provider)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    return await provider_fetch_by_patient_user_id(db=db, provider=current, patient_user_id=patient_user_id)


@router.get("/by-appointment/{appointment_id}")
async def get_by_appointment_id(
    appointment_id: int,
    current: User = Depends(require_roles(UserRole.provider)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    return await provider_fetch_by_appointment_id(db=db, provider=current, appointment_id=appointment_id)

