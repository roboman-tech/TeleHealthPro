from __future__ import annotations

import json
import os
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

import anyio

from app.config import get_settings


ResourceType = Literal["Patient", "Composition", "Observation"]


@dataclass(frozen=True)
class ClinicalPatientIndex:
    app_user_id: int
    fhir_patient_id: str
    created_at: str
    updated_at: str


@dataclass(frozen=True)
class ClinicalResourceRow:
    resource_type: str
    resource_id: str
    patient_fhir_id: str
    version: int
    resource_json: dict[str, Any]
    created_at: str
    updated_at: str


def _db_path() -> Path:
    settings = get_settings()
    p = Path(settings.clinical_sqlite_path)
    if not p.is_absolute():
        p = Path(os.getcwd()) / p
    return p


def _now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def _connect() -> sqlite3.Connection:
    p = _db_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(p.as_posix())
    con.row_factory = sqlite3.Row
    return con


def _init_schema_sync() -> None:
    con = _connect()
    try:
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS clinical_patient_index (
              app_user_id INTEGER PRIMARY KEY,
              fhir_patient_id TEXT NOT NULL UNIQUE,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """,
        )
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS clinical_resources (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              resource_type TEXT NOT NULL,
              resource_id TEXT NOT NULL,
              patient_fhir_id TEXT NOT NULL,
              version INTEGER NOT NULL,
              resource_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              UNIQUE(resource_type, resource_id)
            )
            """,
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_clinical_resources_patient ON clinical_resources(patient_fhir_id)",
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_clinical_resources_type ON clinical_resources(resource_type)",
        )
        con.commit()
    finally:
        con.close()


async def init_schema() -> None:
    await anyio.to_thread.run_sync(_init_schema_sync)


def _get_index_by_user_sync(app_user_id: int) -> ClinicalPatientIndex | None:
    con = _connect()
    try:
        row = con.execute(
            "SELECT app_user_id, fhir_patient_id, created_at, updated_at FROM clinical_patient_index WHERE app_user_id=?",
            (int(app_user_id),),
        ).fetchone()
        if row is None:
            return None
        return ClinicalPatientIndex(
            app_user_id=int(row["app_user_id"]),
            fhir_patient_id=str(row["fhir_patient_id"]),
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
        )
    finally:
        con.close()


async def get_index_by_user(app_user_id: int) -> ClinicalPatientIndex | None:
    return await anyio.to_thread.run_sync(_get_index_by_user_sync, app_user_id)


def _get_index_by_fhir_sync(fhir_patient_id: str) -> ClinicalPatientIndex | None:
    con = _connect()
    try:
        row = con.execute(
            "SELECT app_user_id, fhir_patient_id, created_at, updated_at FROM clinical_patient_index WHERE fhir_patient_id=?",
            (fhir_patient_id,),
        ).fetchone()
        if row is None:
            return None
        return ClinicalPatientIndex(
            app_user_id=int(row["app_user_id"]),
            fhir_patient_id=str(row["fhir_patient_id"]),
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
        )
    finally:
        con.close()


async def get_index_by_fhir(fhir_patient_id: str) -> ClinicalPatientIndex | None:
    return await anyio.to_thread.run_sync(_get_index_by_fhir_sync, fhir_patient_id)


def _upsert_index_sync(app_user_id: int, fhir_patient_id: str) -> ClinicalPatientIndex:
    con = _connect()
    try:
        now = _now_iso()
        existing = con.execute(
            "SELECT app_user_id, fhir_patient_id, created_at, updated_at FROM clinical_patient_index WHERE app_user_id=?",
            (int(app_user_id),),
        ).fetchone()
        if existing is None:
            con.execute(
                "INSERT INTO clinical_patient_index(app_user_id, fhir_patient_id, created_at, updated_at) VALUES(?,?,?,?)",
                (int(app_user_id), fhir_patient_id, now, now),
            )
            con.commit()
            return ClinicalPatientIndex(app_user_id=app_user_id, fhir_patient_id=fhir_patient_id, created_at=now, updated_at=now)
        # If already mapped, keep existing fhir id unless explicitly changing to a new unique one.
        current_fhir = str(existing["fhir_patient_id"])
        if current_fhir != fhir_patient_id:
            # Ensure new id isn't taken.
            taken = con.execute(
                "SELECT 1 FROM clinical_patient_index WHERE fhir_patient_id=? AND app_user_id<>?",
                (fhir_patient_id, int(app_user_id)),
            ).fetchone()
            if taken is not None:
                # Keep current mapping.
                fhir_patient_id = current_fhir
            else:
                con.execute(
                    "UPDATE clinical_patient_index SET fhir_patient_id=?, updated_at=? WHERE app_user_id=?",
                    (fhir_patient_id, now, int(app_user_id)),
                )
                con.commit()
        return ClinicalPatientIndex(
            app_user_id=int(existing["app_user_id"]),
            fhir_patient_id=fhir_patient_id,
            created_at=str(existing["created_at"]),
            updated_at=now,
        )
    finally:
        con.close()


async def upsert_index(app_user_id: int, fhir_patient_id: str) -> ClinicalPatientIndex:
    return await anyio.to_thread.run_sync(_upsert_index_sync, app_user_id, fhir_patient_id)


def _next_version(resource: dict[str, Any], prev_version: int | None) -> tuple[int, dict[str, Any]]:
    v = 1 if prev_version is None else int(prev_version) + 1
    r = dict(resource)
    meta = dict(r.get("meta") or {})
    meta["versionId"] = str(v)
    meta["lastUpdated"] = _now_iso()
    r["meta"] = meta
    return v, r


def _upsert_resource_sync(resource_type: str, resource_id: str, patient_fhir_id: str, resource: dict[str, Any]) -> ClinicalResourceRow:
    con = _connect()
    try:
        now = _now_iso()
        existing = con.execute(
            "SELECT version, created_at FROM clinical_resources WHERE resource_type=? AND resource_id=?",
            (resource_type, resource_id),
        ).fetchone()
        prev_v = int(existing["version"]) if existing else None
        created_at = str(existing["created_at"]) if existing else now
        v, r2 = _next_version(resource, prev_v)
        con.execute(
            """
            INSERT INTO clinical_resources(resource_type, resource_id, patient_fhir_id, version, resource_json, created_at, updated_at)
            VALUES(?,?,?,?,?,?,?)
            ON CONFLICT(resource_type, resource_id) DO UPDATE SET
              patient_fhir_id=excluded.patient_fhir_id,
              version=excluded.version,
              resource_json=excluded.resource_json,
              updated_at=excluded.updated_at
            """,
            (resource_type, resource_id, patient_fhir_id, v, json.dumps(r2), created_at, now),
        )
        con.commit()
        return ClinicalResourceRow(
            resource_type=resource_type,
            resource_id=resource_id,
            patient_fhir_id=patient_fhir_id,
            version=v,
            resource_json=r2,
            created_at=created_at,
            updated_at=now,
        )
    finally:
        con.close()


async def upsert_resource(resource_type: ResourceType, resource_id: str, patient_fhir_id: str, resource: dict[str, Any]) -> ClinicalResourceRow:
    return await anyio.to_thread.run_sync(_upsert_resource_sync, resource_type, resource_id, patient_fhir_id, resource)


def _get_latest_resources_for_patient_sync(patient_fhir_id: str) -> list[ClinicalResourceRow]:
    con = _connect()
    try:
        rows = con.execute(
            """
            SELECT resource_type, resource_id, patient_fhir_id, version, resource_json, created_at, updated_at
            FROM clinical_resources
            WHERE patient_fhir_id=?
            ORDER BY updated_at DESC
            """,
            (patient_fhir_id,),
        ).fetchall()
        out: list[ClinicalResourceRow] = []
        for r in rows:
            out.append(
                ClinicalResourceRow(
                    resource_type=str(r["resource_type"]),
                    resource_id=str(r["resource_id"]),
                    patient_fhir_id=str(r["patient_fhir_id"]),
                    version=int(r["version"]),
                    resource_json=json.loads(str(r["resource_json"])),
                    created_at=str(r["created_at"]),
                    updated_at=str(r["updated_at"]),
                ),
            )
        return out
    finally:
        con.close()


async def get_latest_resources_for_patient(patient_fhir_id: str) -> list[ClinicalResourceRow]:
    return await anyio.to_thread.run_sync(_get_latest_resources_for_patient_sync, patient_fhir_id)

