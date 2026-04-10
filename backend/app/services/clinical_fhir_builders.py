from __future__ import annotations

from datetime import UTC, datetime
from typing import Any


def _now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def fhir_patient(*, fhir_patient_id: str, app_user_id: int, full_name: str | None, email: str) -> dict[str, Any]:
    name_parts = [p for p in (full_name or "").split(" ") if p]
    family = name_parts[-1] if name_parts else ""
    given = name_parts[:-1] if len(name_parts) > 1 else ([name_parts[0]] if name_parts else [])
    return {
        "resourceType": "Patient",
        "id": fhir_patient_id,
        "active": True,
        "identifier": [
            {"system": "urn:telehealthpro:patient-app-user-id", "value": str(app_user_id)},
            {"system": "urn:telehealthpro:patient-email", "value": email},
        ],
        "name": [{"use": "official", "family": family, "given": given}] if (family or given) else [],
        "meta": {"versionId": "1", "lastUpdated": _now_iso()},
    }


def fhir_composition_history(*, fhir_patient_id: str, narrative: str) -> dict[str, Any]:
    rid = f"hist-{fhir_patient_id}"
    return {
        "resourceType": "Composition",
        "id": rid,
        "status": "final",
        "type": {"text": "Patient Medical History"},
        "subject": {"reference": f"Patient/{fhir_patient_id}"},
        "title": "Patient Medical History",
        "date": _now_iso(),
        "section": [
            {
                "title": "History",
                "text": {
                    "status": "generated",
                    "div": f"<div xmlns=\"http://www.w3.org/1999/xhtml\">{_escape_html(narrative)}</div>",
                },
            },
        ],
        "meta": {"versionId": "1", "lastUpdated": _now_iso()},
    }


def fhir_observation_labs(*, fhir_patient_id: str, narrative: str) -> dict[str, Any]:
    rid = f"labs-{fhir_patient_id}"
    return {
        "resourceType": "Observation",
        "id": rid,
        "status": "final",
        "code": {"text": "Patient Reported Lab Results"},
        "subject": {"reference": f"Patient/{fhir_patient_id}"},
        "effectiveDateTime": _now_iso(),
        "valueString": narrative,
        "meta": {"versionId": "1", "lastUpdated": _now_iso()},
    }


def fhir_bundle(*, entries: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "resourceType": "Bundle",
        "type": "collection",
        "timestamp": _now_iso(),
        "entry": [{"resource": r} for r in entries],
    }


def _escape_html(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&#39;")
        .replace("\n", "<br/>")
    )

