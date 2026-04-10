from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    title: str
    body: str | None = None
    appointment_id: int | None = None
    session_id: int | None = None
    read_at: datetime | None = None
    created_at: datetime
    ws_push_status: str | None = None
    ws_push_at: datetime | None = None
    ws_push_socket_count: int | None = None


class UnreadCountOut(BaseModel):
    count: int
