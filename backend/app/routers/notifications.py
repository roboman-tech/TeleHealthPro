from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.user_notification import UserNotification
from app.schemas.notification import NotificationOut, UnreadCountOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    unread_only: bool = False,
    limit: int = Query(50, ge=1, le=200),
    current: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[NotificationOut]:
    q = select(UserNotification).where(UserNotification.user_id == current.id)
    if unread_only:
        q = q.where(UserNotification.read_at.is_(None))
    q = q.order_by(UserNotification.created_at.desc()).limit(limit)
    result = await db.execute(q)
    rows = list(result.scalars().all())
    return [NotificationOut.model_validate(n) for n in rows]


@router.get("/unread-count", response_model=UnreadCountOut)
async def unread_count(
    current: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UnreadCountOut:
    r = await db.execute(
        select(func.count())
        .select_from(UserNotification)
        .where(
            UserNotification.user_id == current.id,
            UserNotification.read_at.is_(None),
        ),
    )
    return UnreadCountOut(count=int(r.scalar_one()))


@router.patch("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_notification_read(
    notification_id: int,
    current: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    n = await db.get(UserNotification, notification_id)
    if n is None or n.user_id != current.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if n.read_at is None:
        n.read_at = datetime.now(UTC)
        await db.flush()


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_notifications_read(
    current: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    now = datetime.now(UTC)
    await db.execute(
        update(UserNotification)
        .where(
            UserNotification.user_id == current.id,
            UserNotification.read_at.is_(None),
        )
        .values(read_at=now),
    )
    await db.flush()
