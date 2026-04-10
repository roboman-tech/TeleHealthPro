from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_event import AuditEvent
from app.models.user import User


async def record_audit_event(
    db: AsyncSession,
    *,
    actor: User | None,
    action: str,
    resource_type: str,
    resource_id: int | None,
    metadata: dict | None = None,
    outcome: str = "success",
) -> AuditEvent:
    row = AuditEvent(
        actor_user_id=actor.id if actor is not None else None,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        outcome=outcome,
        meta=metadata,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row

