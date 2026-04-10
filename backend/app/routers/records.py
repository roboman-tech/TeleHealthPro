from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.models.patient_record import PatientRecord
from app.models.user import User, UserRole
from app.schemas.patient_record import PatientRecordCreate, PatientRecordOut, PatientRecordUpdate

router = APIRouter(prefix="/records", tags=["patient-records"])


def _can_access_patient(actor: User, patient_id: int) -> bool:
    if actor.role == UserRole.admin:
        return True
    if actor.role == UserRole.patient and actor.id == patient_id:
        return True
    if actor.role == UserRole.provider and actor.is_provider_approved:
        return True
    return False


def _can_modify_patient_record(actor: User, patient_id: int) -> bool:
    """Providers can read charts but cannot edit them."""
    if actor.role == UserRole.admin:
        return True
    if actor.role == UserRole.patient and actor.id == patient_id:
        return True
    return False


@router.get("/me", response_model=PatientRecordOut)
async def get_my_record(
    current: User = Depends(require_roles(UserRole.patient)),
    db: AsyncSession = Depends(get_db),
) -> PatientRecord:
    result = await db.execute(select(PatientRecord).where(PatientRecord.patient_id == current.id))
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No record yet")
    return record


@router.post("/me", response_model=PatientRecordOut, status_code=status.HTTP_201_CREATED)
async def create_my_record(
    body: PatientRecordCreate,
    current: User = Depends(require_roles(UserRole.patient)),
    db: AsyncSession = Depends(get_db),
) -> PatientRecord:
    existing = await db.execute(select(PatientRecord).where(PatientRecord.patient_id == current.id))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Record already exists")
    record = PatientRecord(
        patient_id=current.id,
        demographics=body.demographics,
        medical_history=body.medical_history,
        lab_results=body.lab_results,
    )
    db.add(record)
    await db.flush()
    await db.refresh(record)
    return record


@router.patch("/{patient_id}", response_model=PatientRecordOut)
async def update_record(
    patient_id: int,
    body: PatientRecordUpdate,
    current: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PatientRecord:
    if not _can_modify_patient_record(current, patient_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    result = await db.execute(select(PatientRecord).where(PatientRecord.patient_id == patient_id))
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(record, k, v)
    await db.flush()
    await db.refresh(record)
    return record


@router.get("/{patient_id}", response_model=PatientRecordOut)
async def get_patient_record(
    patient_id: int,
    current: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PatientRecord:
    if not _can_access_patient(current, patient_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    if current.role == UserRole.provider:
        subject = await db.get(User, patient_id)
        if subject is None or not subject.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
    result = await db.execute(select(PatientRecord).where(PatientRecord.patient_id == patient_id))
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
    return record
