import json
import os
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.config import get_settings


@dataclass(frozen=True)
class ClinicalSnapshot:
    patient_id: int
    medical_history: dict[str, Any]
    lab_results: dict[str, Any]
    updated_at: str


def _db_path() -> Path:
    settings = get_settings()
    p = Path(settings.clinical_sqlite_path)
    if not p.is_absolute():
        # Resolve relative to backend/ working directory.
        p = Path(os.getcwd()) / p
    return p


async def init_clinical_store() -> None:
    """Create SQLite table if needed."""
    p = _db_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(p.as_posix())
    try:
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS patient_clinical_data (
              patient_id INTEGER PRIMARY KEY,
              fhir_patient_id TEXT NULL,
              medical_history_json TEXT NOT NULL,
              lab_results_json TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """,
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_patient_clinical_fhir ON patient_clinical_data(fhir_patient_id)",
        )
        con.commit()
    finally:
        con.close()


async def get_clinical_snapshot(patient_id: int) -> ClinicalSnapshot | None:
    p = _db_path()
    if not p.exists():
        return None
    con = sqlite3.connect(p.as_posix())
    try:
        cur = con.execute(
            "SELECT patient_id, medical_history_json, lab_results_json, updated_at FROM patient_clinical_data WHERE patient_id = ?",
            (patient_id,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        pid, mh, labs, updated = row
        return ClinicalSnapshot(
            patient_id=int(pid),
            medical_history=json.loads(mh) if mh else {},
            lab_results=json.loads(labs) if labs else {},
            updated_at=str(updated),
        )
    finally:
        con.close()


async def upsert_clinical_snapshot(
    *,
    patient_id: int,
    medical_history: dict[str, Any],
    lab_results: dict[str, Any],
    fhir_patient_id: str | None = None,
) -> ClinicalSnapshot:
    p = _db_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    updated_at = datetime.now(UTC).isoformat()
    con = sqlite3.connect(p.as_posix())
    try:
        con.execute(
            """
            INSERT INTO patient_clinical_data (patient_id, fhir_patient_id, medical_history_json, lab_results_json, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(patient_id) DO UPDATE SET
              fhir_patient_id=excluded.fhir_patient_id,
              medical_history_json=excluded.medical_history_json,
              lab_results_json=excluded.lab_results_json,
              updated_at=excluded.updated_at
            """,
            (
                int(patient_id),
                fhir_patient_id,
                json.dumps(medical_history),
                json.dumps(lab_results),
                updated_at,
            ),
        )
        con.commit()
    finally:
        con.close()
    return ClinicalSnapshot(
        patient_id=patient_id,
        medical_history=medical_history,
        lab_results=lab_results,
        updated_at=updated_at,
    )


async def get_clinical_by_fhir_patient_id(fhir_patient_id: str) -> ClinicalSnapshot | None:
    p = _db_path()
    if not p.exists():
        return None
    con = sqlite3.connect(p.as_posix())
    try:
        cur = con.execute(
            "SELECT patient_id, medical_history_json, lab_results_json, updated_at FROM patient_clinical_data WHERE fhir_patient_id = ?",
            (fhir_patient_id,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        pid, mh, labs, updated = row
        return ClinicalSnapshot(
            patient_id=int(pid),
            medical_history=json.loads(mh) if mh else {},
            lab_results=json.loads(labs) if labs else {},
            updated_at=str(updated),
        )
    finally:
        con.close()

