"""In-process fan-out for telehealth text chat. Scale-out: Redis pub/sub per session."""

from collections import defaultdict

from fastapi import WebSocket


class TelehealthChatHub:
    def __init__(self) -> None:
        self._by_session: dict[int, set[WebSocket]] = defaultdict(set)

    async def connect(self, session_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self._by_session[session_id].add(websocket)

    def disconnect(self, session_id: int, websocket: WebSocket) -> None:
        if session_id in self._by_session:
            self._by_session[session_id].discard(websocket)
            if not self._by_session[session_id]:
                del self._by_session[session_id]

    async def broadcast(self, session_id: int, message: dict) -> None:
        sockets = list(self._by_session.get(session_id, ()))
        for ws in sockets:
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(session_id, ws)


telehealth_chat_hub = TelehealthChatHub()
