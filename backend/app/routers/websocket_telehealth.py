import json
import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Query, WebSocket
from starlette.websockets import WebSocketDisconnect

from app.database import async_session_factory
from app.models.appointment import Appointment
from app.models.telehealth import TelehealthSessionStatus
from app.models.user import User
from app.realtime.telehealth_chat import telehealth_chat_hub
from app.config import get_settings
from app.security import safe_decode_token
from app.services.telehealth_access import get_telehealth_session_for_user
from app.services.telehealth_lifecycle import maybe_auto_expire_session

logger = logging.getLogger(__name__)

router = APIRouter(tags=["realtime"])

MAX_CHAT_LEN = 2000


@router.websocket("/ws/telehealth/{session_id}/chat")
async def telehealth_chat_stream(
    websocket: WebSocket,
    session_id: int,
    token: str = Query(..., description="JWT access token"),
) -> None:
    payload = safe_decode_token(token)
    if not payload or "sub" not in payload:
        await websocket.close(code=4401)
        return
    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError):
        await websocket.close(code=4401)
        return

    async with async_session_factory() as db:
        user = await db.get(User, user_id)
        if user is None or not user.is_active:
            await websocket.close(code=4401)
            return
        try:
            sess = await get_telehealth_session_for_user(db, user, session_id)
        except Exception:
            await websocket.close(code=4403)
            return
        appt = await db.get(Appointment, sess.appointment_id)
        if appt is None:
            await websocket.close(code=4404)
            return

        settings = get_settings()
        expired = maybe_auto_expire_session(
            sess,
            appt,
            now=datetime.now(UTC),
            no_join_timeout_minutes=settings.telehealth_no_join_expire_minutes,
            after_end_timeout_minutes=settings.telehealth_after_end_expire_minutes,
        )
        if expired:
            await db.flush()
            await websocket.close(code=4410)
            return

        if sess.status in (TelehealthSessionStatus.ended, TelehealthSessionStatus.expired):
            await websocket.close(code=4410)
            return

        # Time access policy:
        # - provider/admin: can chat anytime
        # - patient: can chat a little early, but cannot chat after end time
        if user.role.value == "patient":
            now = datetime.now(UTC)
            lead = timedelta(minutes=10)
            window_start = appt.start_at - lead
            window_end = appt.end_at
            if now < window_start or now > window_end:
                await websocket.close(code=4409)
                return

        join_token = sess.session_metadata.get("token") if isinstance(sess.session_metadata, dict) else None
        if not join_token:
            await websocket.close(code=4500)
            return
        display_name = user.full_name or user.email or f"User #{user_id}"

    await telehealth_chat_hub.connect(session_id, websocket)
    logger.info("telehealth_chat_connected", extra={"session_id": session_id, "user_id": user_id})
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue
            text = data.get("text") if isinstance(data, dict) else None
            if not isinstance(text, str):
                continue
            text = text.strip()
            if not text:
                continue
            if len(text) > MAX_CHAT_LEN:
                text = text[:MAX_CHAT_LEN]
            msg = {
                "type": "chat",
                "from_user_id": user_id,
                "from_name": display_name,
                "text": text,
                "at": datetime.now(UTC).isoformat(),
            }
            await telehealth_chat_hub.broadcast(session_id, msg)
    except WebSocketDisconnect:
        pass
    finally:
        telehealth_chat_hub.disconnect(session_id, websocket)
        logger.info("telehealth_chat_disconnected", extra={"session_id": session_id, "user_id": user_id})
