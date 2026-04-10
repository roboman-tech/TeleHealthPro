import json
import sqlite3
from pathlib import Path


def main() -> int:
    db_path = Path(__file__).resolve().parents[1] / "data" / "clinical.sqlite3"
    if not db_path.exists():
        print(f"No sqlite db found at {db_path}")
        return 0

    con = sqlite3.connect(db_path.as_posix())
    con.row_factory = sqlite3.Row
    try:
        # If old table doesn't exist, nothing to do.
        has_old = con.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='patient_clinical_data'",
        ).fetchone()
        if has_old is None:
            print("No legacy patient_clinical_data table; nothing to migrate.")
            return 0

        # Ensure new schema exists (minimal).
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

        rows = con.execute(
            "SELECT patient_id, fhir_patient_id, medical_history_json, lab_results_json, updated_at FROM patient_clinical_data",
        ).fetchall()
        if not rows:
            print("Legacy table exists but empty.")
            return 0

        migrated = 0
        for r in rows:
            app_user_id = int(r["patient_id"])
            fhir_id = str(r["fhir_patient_id"] or f"pat-migrated-{app_user_id}")
            updated_at = str(r["updated_at"] or "")
            try:
                mh = json.loads(str(r["medical_history_json"] or "{}"))
            except Exception:
                mh = {}
            try:
                labs = json.loads(str(r["lab_results_json"] or "{}"))
            except Exception:
                labs = {}

            history_text = mh.get("narrative") if isinstance(mh, dict) else None
            if not isinstance(history_text, str):
                history_text = ""
            labs_text = labs.get("narrative") if isinstance(labs, dict) else None
            if not isinstance(labs_text, str):
                labs_text = ""

            # Upsert index
            con.execute(
                """
                INSERT INTO clinical_patient_index(app_user_id, fhir_patient_id, created_at, updated_at)
                VALUES(?,?,?,?)
                ON CONFLICT(app_user_id) DO UPDATE SET
                  fhir_patient_id=excluded.fhir_patient_id,
                  updated_at=excluded.updated_at
                """,
                (app_user_id, fhir_id, updated_at or "1970-01-01T00:00:00+00:00", updated_at or "1970-01-01T00:00:00+00:00"),
            )

            # Create minimal FHIR-like resources; store narrative under telehealthpro extension keys.
            patient_res = {
                "resourceType": "Patient",
                "id": fhir_id,
                "active": True,
                "identifier": [{"system": "urn:telehealthpro:patient-app-user-id", "value": str(app_user_id)}],
                "meta": {"versionId": "1", "lastUpdated": updated_at or "1970-01-01T00:00:00+00:00"},
            }
            comp_res = {
                "resourceType": "Composition",
                "id": f"hist-{fhir_id}",
                "status": "final",
                "subject": {"reference": f"Patient/{fhir_id}"},
                "title": "Patient Medical History",
                "meta": {"versionId": "1", "lastUpdated": updated_at or "1970-01-01T00:00:00+00:00"},
                "telehealthpro": {"narrative": history_text},
            }
            obs_res = {
                "resourceType": "Observation",
                "id": f"labs-{fhir_id}",
                "status": "final",
                "subject": {"reference": f"Patient/{fhir_id}"},
                "code": {"text": "Patient Reported Lab Results"},
                "valueString": labs_text,
                "meta": {"versionId": "1", "lastUpdated": updated_at or "1970-01-01T00:00:00+00:00"},
                "telehealthpro": {"narrative": labs_text},
            }

            for (rtype, rid, payload) in [
                ("Patient", fhir_id, patient_res),
                ("Composition", f"hist-{fhir_id}", comp_res),
                ("Observation", f"labs-{fhir_id}", obs_res),
            ]:
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
                    (rtype, rid, fhir_id, 1, json.dumps(payload), updated_at or "1970-01-01T00:00:00+00:00", updated_at or "1970-01-01T00:00:00+00:00"),
                )

            migrated += 1

        con.commit()
        print(f"Migrated {migrated} patient rows from patient_clinical_data → clinical_resources.")
        print("You can keep the legacy table for reference or drop it manually.")
        return 0
    finally:
        con.close()


if __name__ == "__main__":
    raise SystemExit(main())

