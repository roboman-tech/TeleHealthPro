import hashlib
import hmac


def meeting_room_name(session_id: int, join_token: str, secret: str) -> str:
    """Opaque Jitsi room id derived from session + server secret (not guessable)."""
    digest = hmac.new(
        secret.encode("utf-8"),
        f"{session_id}:{join_token}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:28]
    return f"thp{digest}"
