from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.telehealth import TelehealthSessionStatus


class MeetingInfoOut(BaseModel):
    jitsi_base_url: str
    room_name: str
    appointment_start_at: datetime
    appointment_end_at: datetime
    session_status: TelehealthSessionStatus
    ended_at: datetime | None
    can_join_video: bool


class TelehealthSessionOut(BaseModel):
    id: int
    appointment_id: int
    provider_id: int
    status: TelehealthSessionStatus
    ended_at: datetime | None
    secure_join_url: str
    session_metadata: dict[str, Any]
    activity_log: list[dict[str, Any]]
    created_at: datetime

    model_config = {"from_attributes": True}
