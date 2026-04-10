"""In-process WebSocket fan-out. For multi-worker deployments, back with Redis pub/sub."""

from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class NotificationHub:
    def __init__(self) -> None:
        self._by_user: dict[int, set[WebSocket]] = defaultdict(set)

    async def connect(self, user_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self._by_user[user_id].add(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        if user_id in self._by_user:
            self._by_user[user_id].discard(websocket)
            if not self._by_user[user_id]:
                del self._by_user[user_id]

    async def send_to_user(self, user_id: int, message: dict[str, Any]) -> dict[str, int]:
        sockets = list(self._by_user.get(user_id, ()))
        delivered = 0
        for ws in sockets:
            try:
                await ws.send_json(message)
                delivered += 1
            except Exception:
                self.disconnect(user_id, ws)
        return {"attempted": len(sockets), "delivered": delivered}


notification_hub = NotificationHub()
