import logging

from fastapi import APIRouter, Query, WebSocket
from starlette.websockets import WebSocketDisconnect

from app.realtime.manager import notification_hub
from app.security import safe_decode_token

logger = logging.getLogger(__name__)

router = APIRouter(tags=["realtime"])


@router.websocket("/ws/notifications")
async def notifications_stream(
    websocket: WebSocket,
    token: str = Query(..., description="JWT access token"),
) -> None:
    """Browser WebSocket; sends JSON payloads like `{type, title, body, ...}`."""
    payload = safe_decode_token(token)
    if not payload or "sub" not in payload:
        await websocket.close(code=4401)
        return
    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError):
        await websocket.close(code=4401)
        return

    await notification_hub.connect(user_id, websocket)
    logger.info("ws_notifications_connected", extra={"user_id": user_id})
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        notification_hub.disconnect(user_id, websocket)
        logger.info("ws_notifications_disconnected", extra={"user_id": user_id})
