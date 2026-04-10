import secrets
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.patient_record import PatientRecord
from app.models.user_session import UserSession
from app.models.user import ProviderReadiness, User, UserRole
from app.schemas.auth import Token, UserCreate, UserLogin, UserOut
from app.security import create_access_token, hash_password, hash_session_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])
SESSION_COOKIE_NAME = "telehealthpro_session"


@router.get("/me", response_model=UserOut)
async def me(current: User = Depends(get_current_user)) -> User:
    return current


@router.post("/register", response_model=UserOut)
async def register(body: UserCreate, db: AsyncSession = Depends(get_db)) -> User:
    if body.role == UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot self-register as admin")
    if body.role == UserRole.patient:
        if not body.date_of_birth or not body.pronouns:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Patients must provide date_of_birth and pronouns during sign-up",
            )
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
        is_provider_approved=(body.role != UserRole.provider),
        provider_readiness=(
            ProviderReadiness.registered if body.role == UserRole.provider else None
        ),
    )
    db.add(user)
    await db.flush()

    if body.role == UserRole.patient:
        record = PatientRecord(
            patient_id=user.id,
            demographics={
                "date_of_birth": body.date_of_birth,
                "pronouns": body.pronouns,
                "note": body.note or "",
            },
            medical_history={},
            lab_results={},
        )
        db.add(record)
        await db.flush()
    await db.refresh(user)
    return user


@router.post("/login", response_model=Token)
async def login(body: UserLogin, response: Response, db: AsyncSession = Depends(get_db)) -> Token:
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")
    if user.role == UserRole.provider and not user.is_provider_approved:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Provider account pending approval")

    session_token = secrets.token_urlsafe(32)
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_session_token(session_token),
        ),
    )
    await db.flush()
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_token,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
        max_age=60 * 60 * 24 * 7,
    )
    # Commit before the response is finalized so the next /auth/me (cookie or race) sees this row.
    await db.commit()
    token = create_access_token(
        str(user.id),
        extra_claims={"role": user.role.value},
    )
    return Token(access_token=token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    current: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    del current
    # Best-effort revoke for current cookie session.
    cookie = request.cookies.get(SESSION_COOKIE_NAME)
    # FastAPI Response doesn't expose request; use an explicit cookie delete only.
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    if not cookie:
        return
    token_hash = hash_session_token(cookie)
    sess = await db.scalar(
        select(UserSession).where(UserSession.token_hash == token_hash, UserSession.revoked_at.is_(None)),
    )
    if sess is not None:
        sess.revoked_at = datetime.now(UTC)
        await db.flush()


@router.get("/token", response_model=Token)
async def token_for_session(current: User = Depends(get_current_user)) -> Token:
    """Issue a short-lived JWT for WebSocket auth, backed by cookie session."""
    token = create_access_token(str(current.id), extra_claims={"role": current.role.value})
    return Token(access_token=token)
