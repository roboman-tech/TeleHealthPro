from __future__ import annotations

import secrets
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.appointment import Appointment
from app.models.user import User, UserRole
from app.services import clinical_repository as repo
from app.services.clinical_fhir_builders import (
    fhir_bundle,
    fhir_composition_history,
    fhir_observation_labs,
    fhir_patient,
)


def _new_fhir_patient_id() -> str:
    # Human-ish short ID that still feels like a FHIR id.
    return "pat-" + secrets.token_hex(6)


def _parse_history_text(resources: list[repo.ClinicalResourceRow]) -> str:
    for r in resources:
        if r.resource_type == "Composition":
            # Our builder puts text in section[0].text.div; UI uses narrative string, so keep a parallel field below.
            # If migrated from older versions, allow "telehealthpro.narrative".
            x = r.resource_json
            ext = x.get("telehealthpro") if isinstance(x.get("telehealthpro"), dict) else None
            if ext and isinstance(ext.get("narrative"), str):
                return ext["narrative"]
    return ""


def _parse_labs_text(resources: list[repo.ClinicalResourceRow]) -> str:
    for r in resources:
        if r.resource_type == "Observation":
            x = r.resource_json
            if isinstance(x.get("valueString"), str):
                return x["valueString"]
            ext = x.get("telehealthpro") if isinstance(x.get("telehealthpro"), dict) else None
            if ext and isinstance(ext.get("narrative"), str):
                return ext["narrative"]
    return ""


async def resolve_or_create_patient_fhir_id(
    *,
    db: AsyncSession,
    app_user_id: int,
    requested_fhir_patient_id: str | None,
) -> str:
    existing = await repo.get_index_by_user(app_user_id)
    if existing is not None:
        if requested_fhir_patient_id:
            idx = await repo.upsert_index(app_user_id, requested_fhir_patient_id)
            return idx.fhir_patient_id
        return existing.fhir_patient_id

    # First time: if user supplied an id, try to use it (must be unique).
    if requested_fhir_patient_id:
        taken = await repo.get_index_by_fhir(requested_fhir_patient_id)
        if taken is None:
            idx = await repo.upsert_index(app_user_id, requested_fhir_patient_id)
            return idx.fhir_patient_id

    idx = await repo.upsert_index(app_user_id, _new_fhir_patient_id())
    return idx.fhir_patient_id


async def patient_put_my_clinical(
    *,
    db: AsyncSession,
    patient: User,
    history_text: str,
    labs_text: str,
    requested_fhir_patient_id: str | None,
) -> dict[str, Any]:
    fhir_id = await resolve_or_create_patient_fhir_id(
        db=db,
        app_user_id=patient.id,
        requested_fhir_patient_id=(requested_fhir_patient_id.strip() if requested_fhir_patient_id else None),
    )

    # Build FHIR-like resources.
    pat = fhir_patient(
        fhir_patient_id=fhir_id,
        app_user_id=patient.id,
        full_name=patient.full_name,
        email=patient.email,
    )
    hist = fhir_composition_history(fhir_patient_id=fhir_id, narrative=history_text)
    labs = fhir_observation_labs(fhir_patient_id=fhir_id, narrative=labs_text)

    # Store raw narrative in a non-FHIR extension key we control (still inside resource JSON).
    hist["telehealthpro"] = {"narrative": history_text}
    labs["telehealthpro"] = {"narrative": labs_text}

    await repo.upsert_resource("Patient", fhir_id, fhir_id, pat)
    await repo.upsert_resource("Composition", f"hist-{fhir_id}", fhir_id, hist)
    await repo.upsert_resource("Observation", f"labs-{fhir_id}", fhir_id, labs)

    bundle = fhir_bundle(entries=[pat, hist, labs])
    return {
        "ok": True,
        "fhir_patient_id": fhir_id,
        "history_text": history_text,
        "labs_text": labs_text,
        "raw_fhir_bundle": bundle,
    }


async def patient_get_my_clinical(*, patient: User) -> dict[str, Any]:
    idx = await repo.get_index_by_user(patient.id)
    if idx is None:
        return {
            "fhir_patient_id": None,
            "history_text": None,
            "labs_text": None,
            "raw_fhir_bundle": None,
        }
    resources = await repo.get_latest_resources_for_patient(idx.fhir_patient_id)
    history = _parse_history_text(resources)
    labs = _parse_labs_text(resources)
    raw_entries = [r.resource_json for r in resources if isinstance(r.resource_json, dict)]
    return {
        "fhir_patient_id": idx.fhir_patient_id,
        "history_text": history,
        "labs_text": labs,
        "raw_fhir_bundle": fhir_bundle(entries=raw_entries) if raw_entries else None,
    }


async def _provider_can_access_patient(*, db: AsyncSession, provider_id: int, patient_user_id: int) -> bool:
    row = await db.scalar(
        select(Appointment.id).where(Appointment.provider_id == provider_id, Appointment.patient_id == patient_user_id).limit(1),
    )
    return row is not None


async def provider_fetch_by_patient_user_id(
    *,
    db: AsyncSession,
    provider: User,
    patient_user_id: int,
) -> dict[str, Any]:
    if provider.role != UserRole.provider:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    if not await _provider_can_access_patient(db=db, provider_id=provider.id, patient_user_id=patient_user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    idx = await repo.get_index_by_user(patient_user_id)
    if idx is None:
        return {
            "patient_user_id": patient_user_id,
            "fhir_patient_id": None,
            "history_text": None,
            "labs_text": None,
            "raw_fhir_bundle": None,
        }
    resources = await repo.get_latest_resources_for_patient(idx.fhir_patient_id)
    history = _parse_history_text(resources)
    labs = _parse_labs_text(resources)
    raw_entries = [r.resource_json for r in resources if isinstance(r.resource_json, dict)]
    return {
        "patient_user_id": patient_user_id,
        "fhir_patient_id": idx.fhir_patient_id,
        "history_text": history,
        "labs_text": labs,
        "raw_fhir_bundle": fhir_bundle(entries=raw_entries) if raw_entries else None,
    }


async def provider_fetch_by_appointment_id(
    *,
    db: AsyncSession,
    provider: User,
    appointment_id: int,
) -> dict[str, Any]:
    appt = await db.get(Appointment, appointment_id)
    if appt is None or appt.provider_id != provider.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    return await provider_fetch_by_patient_user_id(db=db, provider=provider, patient_user_id=appt.patient_id)


async def provider_fetch_by_fhir_patient_id(
    *,
    db: AsyncSession,
    provider: User,
    fhir_patient_id: str,
) -> dict[str, Any]:
    idx = await repo.get_index_by_fhir(fhir_patient_id)
    if idx is None:
        # No mapping == no access.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    if not await _provider_can_access_patient(db=db, provider_id=provider.id, patient_user_id=idx.app_user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    return await provider_fetch_by_patient_user_id(db=db, provider=provider, patient_user_id=idx.app_user_id)


async def provider_list_my_patients(*, db: AsyncSession, provider: User) -> dict[str, Any]:
    rows = await db.execute(
        select(Appointment.patient_id)
        .join(User, User.id == Appointment.patient_id)
        .where(
            Appointment.provider_id == provider.id,
            User.role == UserRole.patient,
            User.is_active.is_(True),
        )
        .distinct(),
    )
    ids = [int(x) for x in rows.scalars().all()]
    payload = []
    for pid in ids:
        idx = await repo.get_index_by_user(pid)
        payload.append(
            {
                "patient_user_id": pid,
                "fhir_patient_id": None if idx is None else idx.fhir_patient_id,
                "has_clinical_data": idx is not None,
            },
        )
    return {"patients": payload}

