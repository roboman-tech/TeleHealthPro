"""Public list of approved providers; availability windows for scheduling."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.models.provider_availability import ProviderAvailability
from app.models.user import ProviderReadiness, User, UserRole
from app.schemas.auth import UserOut
from app.schemas.provider_availability import ProviderAvailabilityCreate, ProviderAvailabilityOut

router = APIRouter(prefix="/providers", tags=["providers"])


@router.get("", response_model=list[UserOut])
async def list_approved_providers(db: AsyncSession = Depends(get_db)) -> list[User]:
    """Patients need to pick a provider here before booking; include approved accounts even if hours are not published yet."""
    result = await db.execute(
        select(User)
        .where(
            User.role == UserRole.provider,
            User.is_active.is_(True),
            User.is_provider_approved.is_(True),
        )
        .order_by(User.full_name),
    )
    return list(result.scalars().all())


async def _refresh_provider_bookable_state(db: AsyncSession, provider: User) -> None:
    """Keep `provider_readiness` aligned with approval + published hours."""
    if provider.role != UserRole.provider:
        return
    if not provider.is_provider_approved:
        provider.provider_readiness = ProviderReadiness.registered
        return
    has_hours = await db.scalar(
        select(ProviderAvailability.id).where(ProviderAvailability.provider_id == provider.id).limit(1),
    )
    provider.provider_readiness = (
        ProviderReadiness.bookable if has_hours is not None else ProviderReadiness.approved
    )


@router.get("/me/availability", response_model=list[ProviderAvailabilityOut])
async def list_my_availability(
    current: User = Depends(require_roles(UserRole.provider)),
    db: AsyncSession = Depends(get_db),
) -> list[ProviderAvailability]:
    if not current.is_provider_approved:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Provider not approved")
    result = await db.execute(
        select(ProviderAvailability)
        .where(ProviderAvailability.provider_id == current.id)
        .order_by(ProviderAvailability.start_at),
    )
    return list(result.scalars().all())


@router.post("/me/availability", response_model=ProviderAvailabilityOut, status_code=status.HTTP_201_CREATED)
async def create_my_availability(
    body: ProviderAvailabilityCreate,
    current: User = Depends(require_roles(UserRole.provider)),
    db: AsyncSession = Depends(get_db),
) -> ProviderAvailability:
    if not current.is_provider_approved:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Provider not approved")
    if body.end_at <= body.start_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="end_at must be after start_at")
    row = ProviderAvailability(
        provider_id=current.id,
        start_at=body.start_at,
        end_at=body.end_at,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    await _refresh_provider_bookable_state(db, current)
    return row


@router.delete("/me/availability/{slot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_availability(
    slot_id: int,
    current: User = Depends(require_roles(UserRole.provider)),
    db: AsyncSession = Depends(get_db),
) -> None:
    row = await db.get(ProviderAvailability, slot_id)
    if row is None or row.provider_id != current.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await db.execute(delete(ProviderAvailability).where(ProviderAvailability.id == slot_id))
    await db.flush()
    await _refresh_provider_bookable_state(db, current)


@router.get("/{provider_id}/availability", response_model=list[ProviderAvailabilityOut])
async def list_provider_availability_public(
    provider_id: int,
    db: AsyncSession = Depends(get_db),
) -> list[ProviderAvailability]:
    prov = await db.get(User, provider_id)
    if (
        prov is None
        or prov.role != UserRole.provider
        or not prov.is_active
        or not prov.is_provider_approved
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
    result = await db.execute(
        select(ProviderAvailability)
        .where(ProviderAvailability.provider_id == provider_id)
        .order_by(ProviderAvailability.start_at),
    )
    return list(result.scalars().all())
