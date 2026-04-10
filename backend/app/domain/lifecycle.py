"""
TeleHealthPro — canonical care lifecycle (single source of truth for semantics).

Import status enums from SQLAlchemy models only; this module documents product rules.

---------------------------------------------------------------------------
APPOINTMENT (scheduled care event)
---------------------------------------------------------------------------
States: pending, approved, in_progress, completed, cancelled, rejected,
        reschedule_requested, no_show

Meaning:
  pending                 Patient requested a slot; provider has not decided.
  approved                Provider accepted the scheduled time.
  in_progress             Visit is underway (telehealth room opened or equivalent).
  completed               Clinical visit is finished and closed administratively.
  cancelled               Patient or system cancelled before completion.
  rejected                Provider declined the request.
  reschedule_requested    Patient asked to move the visit (awaiting provider).
  no_show                 Visit did not occur as scheduled (operational terminal).

Rules (high level):
  • Booking creates pending.
  • Only the workflow service should move appointments between states (routers delegate).
  • Starting telehealth moves approved/pending → in_progress and creates session ready.
  • Ending telehealth sets session ended; appointment stays in_progress until completed.
  • Completing visit sets appointment completed (session may already be ended).
  • Cancel or reject expires an active telehealth session (expired).
  • no_show expires/hides active telehealth the same way as cancel for scheduling.

---------------------------------------------------------------------------
TELEHEALTH SESSION (video/chat room lifecycle)
---------------------------------------------------------------------------
States: ready, patient_joined, provider_joined, live, ended, expired

Meaning:
  ready            Room exists; nobody has opened the meeting UI yet.
  patient_joined   Patient opened meeting (presence).
  provider_joined  Provider opened meeting (presence).
  live             Both sides have joined (or equivalent “both present”).
  ended            Provider (or admin) ended the session deliberately.
  expired          Appointment was cancelled/rejected/no-show; room is closed.

Rules:
  • At most one session row per appointment.
  • Presence advances on meeting load (see telehealth_lifecycle.advance_presence).
  • Patient video/chat may be time-gated; ended/expired blocks join.

---------------------------------------------------------------------------
TERMINOLOGY MAP (align UI copy with this over time)
---------------------------------------------------------------------------
  appointment      = scheduled care event (states above)
  telehealth session = video/chat room lifecycle (states above)
  visit            = colloquial; usually means appointment + session together
  meeting          = the in-browser meeting page (Jitsi + chat)
  record / chart   = patient health record (separate from appointment row)

Visit documentation (same appointment row, provider-authored):
  visit_notes, diagnosis_summary, care_plan, follow_up_instructions,
  internal_provider_note (not shown to patient), patient_after_visit_summary (patient-visible).

Notifications:
  Appointment/telehealth events are stored per user (user_notifications) and pushed on WebSocket when online.

Scheduling (Phase 3):
  Providers publish availability windows (provider_availability). When a provider has at least one window,
  new patient bookings must fall entirely inside one window; if they have none, legacy “any time” booking applies.
  Bookings require an approved, active provider account.

Reschedule (Phase 4):
  Patients may request reschedule (status) and optionally propose new start/end; while reschedule_requested they
  may revise proposed times. Providers may change start/end for pending, approved, or reschedule_requested visits
  (slot + availability rules apply). Approving from reschedule_requested confirms the visit.
"""

from app.models.appointment import AppointmentStatus
from app.models.telehealth import TelehealthSessionStatus

__all__ = [
    "AppointmentStatus",
    "TelehealthSessionStatus",
    "APPOINTMENT_STATUSES",
    "TELEHEALTH_SESSION_STATUSES",
]

APPOINTMENT_STATUSES: tuple[str, ...] = tuple(s.value for s in AppointmentStatus)
TELEHEALTH_SESSION_STATUSES: tuple[str, ...] = tuple(s.value for s in TelehealthSessionStatus)
