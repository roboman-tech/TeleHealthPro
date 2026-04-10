from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db_base import Base


class UserNotification(Base):
    """In-app notification row; WebSocket pushes mirror these for live clients."""

    __tablename__ = "user_notifications"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(80), index=True)
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    appointment_id: Mapped[int | None] = mapped_column(
        ForeignKey("appointments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    session_id: Mapped[int | None] = mapped_column(
        ForeignKey("telehealth_sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Observability for best-effort WS push; inbox remains the guaranteed source.
    ws_push_status: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    ws_push_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ws_push_socket_count: Mapped[int | None] = mapped_column(Integer(), nullable=True)
