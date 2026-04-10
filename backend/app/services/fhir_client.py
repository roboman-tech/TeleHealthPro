"""Async FHIR R4 client; extend with auth, pagination, and resource-specific mappers."""

from typing import Any

import httpx

from app.config import get_settings


async def fetch_patient_raw(patient_fhir_id: str) -> dict[str, Any] | None:
    settings = get_settings()
    if not settings.fhir_base_url:
        return None
    url = f"{settings.fhir_base_url.rstrip('/')}/Patient/{patient_fhir_id}"
    headers: dict[str, str] = {"Accept": "application/fhir+json"}
    if settings.fhir_token:
        headers["Authorization"] = f"Bearer {settings.fhir_token}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(url, headers=headers)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()
