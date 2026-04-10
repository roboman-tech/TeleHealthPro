# TeleHealthPro

TeleHealthPro is a demo telehealth platform: patients book visits, providers run a clinical workspace, and admins manage users. The stack is a **FastAPI** backend, **React (Vite)** frontend, **PostgreSQL** for core app data, and a local **SQLite** store that **emulates FHIR** for medical history and lab narratives (no external FHIR server required for local development).

## Features

| Area | Highlights |
|------|------------|
| **Patient** | Profile / demographics, **Health record** (plain-text medical history & labs saved to the clinical store), scheduling, telehealth join links, notifications |
| **Provider** | **Patients** workspace (3-panel layout: roster + chart + actions), schedule filters, explicit **Load clinical data**, structured **Past medical history** sections when narratives use headers (Allergies, Conditions, Medications, Surgeries, Relevant history), telehealth sessions |
| **Admin** | User list, activate/deactivate accounts, provider approval; deactivated patients are hidden from provider appointment and clinical lists |
| **Telehealth** | Jitsi-based rooms; approving a visit creates a telehealth session row so it appears under Telehealth |

## Architecture

- **PostgreSQL**: users, sessions, appointments, availability, notifications, patient profile records, telehealth metadata.
- **SQLite** (`CLINICAL_SQLITE_PATH`, default `data/clinical.sqlite3`): FHIR-shaped JSON for `Patient`, `Composition` (history), `Observation` (labs), and `Bundle` views; exposed via `/clinical/*` and a compatibility route under `/integrations/fhir/...`.
- **Auth**: HttpOnly session cookies (`SameSite=Lax`); JWT used for WebSockets and as a client fallback in development.

## Prerequisites

- Docker (for Postgres) **or** a running PostgreSQL instance matching `DATABASE_URL`
- Python 3.11+ recommended
- Node.js 20+ recommended

## Quick start

### 1. Database

From the repository root:

```bash
docker compose up -d
```

This starts Postgres on port **5432** with database `telehealthpro` (see `docker-compose.yml`).

### 2. Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env: set JWT_SECRET_KEY, confirm DATABASE_URL and CORS_ORIGINS / FRONTEND_BASE_URL
alembic upgrade head
```

Create the first admin (set password via env or `backend/.env`):

```bash
# PowerShell example:
#   $env:ADMIN_PASSWORD = 'YourSecurePassword'
#   python scripts/create_admin.py
python scripts/create_admin.py
```

Run the API (typical dev port **8000**):

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

On startup, the clinical SQLite schema is initialized automatically.

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
```

**Development:** leave `VITE_API_URL` **unset** in `.env.local` so the Vite dev server **proxies** API routes. That keeps the SPA and API on the same site so session cookies work with `SameSite=Lax` (avoid mismatched `localhost` vs `127.0.0.1` unless you align browser URL, API host, and CORS).

```bash
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Sign in as admin, approve providers, then exercise patient and provider flows.

### 4. Optional: migrate legacy clinical SQLite data

If you have data in an older schema, see `backend/scripts/migrate_clinical_sqlite.py` (run from `backend` with appropriate paths).

## Configuration

| File | Purpose |
|------|---------|
| `backend/.env` | `DATABASE_URL`, `JWT_SECRET_KEY`, `CORS_ORIGINS`, `FRONTEND_BASE_URL`, `JITSI_BASE_URL`, `CLINICAL_SQLITE_PATH`, admin bootstrap vars for `create_admin.py` |
| `frontend/.env.local` | Optional `VITE_API_URL`; dev proxy target `VITE_DEV_PROXY_TARGET` if needed |

## Project layout

```
TeleHealthPro/
├── backend/           # FastAPI app (app/, alembic/, scripts/)
├── frontend/          # React + Vite + Tailwind
├── docker-compose.yml # Postgres service
└── docker/            # Postgres init hooks (if any)
```

Key frontend routes: `/patient/*`, `/provider/*` (including `/provider/patients` clinical workspace), `/admin/*`, `/meeting` for video.

## Scripts (backend)

| Script | Use |
|--------|-----|
| `scripts/create_admin.py` | Bootstrap or reset admin user |
| `scripts/migrate_clinical_sqlite.py` | Migrate old clinical rows into FHIR-shaped SQLite |

## Build & quality

```bash
cd frontend && npm run build && npm run lint
```

```bash
cd backend && python -m compileall app
```

## Security notes

This project is intended for **development and demos**. For production, harden secrets, HTTPS, cookie flags, rate limits, audit requirements, and real clinical compliance (HIPAA, BAAs, encryption at rest, etc.) before handling real PHI.

## License

Use and modify according to your organization’s policies; add a `LICENSE` file if you distribute the project.
