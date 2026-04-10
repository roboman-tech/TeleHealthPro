from datetime import UTC, datetime, timedelta

from typing import Any



from fastapi import APIRouter, Depends, HTTPException, Response, status

from sqlalchemy import select

from sqlalchemy.ext.asyncio import AsyncSession



from app.config import get_settings

from app.database import get_db

from app.dependencies import get_current_user, require_roles

from app.models.appointment import Appointment, AppointmentStatus

from app.models.telehealth import TelehealthSession, TelehealthSessionStatus

from app.models.user import User, UserRole

from app.schemas.telehealth import MeetingInfoOut, TelehealthSessionOut

from app.services.meeting_room import meeting_room_name

from app.services.telehealth_access import get_telehealth_session_for_user

from app.services.telehealth_lifecycle import advance_presence, maybe_auto_expire_session

from app.services.visit_workflow import end_telehealth_session, start_telehealth



router = APIRouter(prefix="/telehealth", tags=["telehealth"])





def _sessions_list_filter():

    """Hide telehealth rows tied to appointments that should not surface a joinable visit."""

    return Appointment.status.notin_(

        [

            AppointmentStatus.cancelled,

            AppointmentStatus.rejected,

            AppointmentStatus.no_show,

        ],

    )





@router.get("/sessions", response_model=list[TelehealthSessionOut])

async def list_sessions(

    current: User = Depends(get_current_user),

    db: AsyncSession = Depends(get_db),

) -> list[TelehealthSession]:

    if current.role == UserRole.admin:

        admin_stmt = (

            select(TelehealthSession)

            .join(Appointment, TelehealthSession.appointment_id == Appointment.id)

            .order_by(TelehealthSession.created_at.desc())

        )

        result = await db.execute(admin_stmt)

        return list(result.scalars().all())



    stmt = (

        select(TelehealthSession)

        .join(Appointment, TelehealthSession.appointment_id == Appointment.id)

        .where(_sessions_list_filter())

        .order_by(TelehealthSession.created_at.desc())

    )

    if current.role == UserRole.provider:

        provider_stmt = (

            select(TelehealthSession)

            .join(Appointment, TelehealthSession.appointment_id == Appointment.id)

            .join(User, User.id == Appointment.patient_id)

            .where(

                _sessions_list_filter(),

                TelehealthSession.provider_id == current.id,

                User.is_active.is_(True),

            )

            .order_by(TelehealthSession.created_at.desc())

        )

        result = await db.execute(provider_stmt)

        return list(result.scalars().all())

    result = await db.execute(stmt.where(Appointment.patient_id == current.id))

    return list(result.scalars().all())





@router.get("/sessions/resolve", response_model=TelehealthSessionOut)

async def resolve_session_by_token(

    t: str,

    current: User = Depends(get_current_user),

    db: AsyncSession = Depends(get_db),

) -> TelehealthSession:

    result = await db.execute(

        select(TelehealthSession).where(TelehealthSession.session_metadata.contains({"token": t})),

    )

    sess = result.scalar_one_or_none()

    if sess is None:

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    # Resolve must enforce the same lifecycle + access rules as normal session fetch.
    return await get_telehealth_session_for_user(db, current, sess.id)





@router.post("/sessions/{appointment_id}", response_model=TelehealthSessionOut)

async def create_session(

    appointment_id: int,

    response: Response,

    current: User = Depends(require_roles(UserRole.provider)),

    db: AsyncSession = Depends(get_db),

) -> TelehealthSession:

    result = await start_telehealth(db, current, appointment_id)

    response.status_code = status.HTTP_201_CREATED if result.created else status.HTTP_200_OK

    return result.session





@router.get("/sessions/{session_id}/meeting", response_model=MeetingInfoOut)

async def meeting_info(

    session_id: int,

    current: User = Depends(get_current_user),

    db: AsyncSession = Depends(get_db),

) -> MeetingInfoOut:

    sess = await get_telehealth_session_for_user(db, current, session_id)

    appt = await db.get(Appointment, sess.appointment_id)

    if appt is None:

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment missing")

    now = datetime.now(UTC)
    settings = get_settings()
    maybe_auto_expire_session(
        sess,
        appt,
        now=now,
        no_join_timeout_minutes=settings.telehealth_no_join_expire_minutes,
        after_end_timeout_minutes=settings.telehealth_after_end_expire_minutes,
    )
    await db.flush()
    await db.refresh(sess)

    if current.role == UserRole.patient:

        lead = timedelta(minutes=10)

        window_start = appt.start_at - lead

        window_end = appt.end_at

        if now < window_start or now > window_end:

            raise HTTPException(

                status_code=status.HTTP_409_CONFLICT,

                detail=(

                    "Meeting is not available at this time. "

                    f"Allowed window: {window_start.isoformat()} to {window_end.isoformat()}."

                ),

            )



    advance_presence(sess, current.role)

    await db.flush()

    await db.refresh(sess)



    meta = sess.session_metadata if isinstance(sess.session_metadata, dict) else {}

    join_token = meta.get("token")

    if not join_token or not isinstance(join_token, str):

        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Session token missing")

    room = meeting_room_name(session_id, join_token, settings.jwt_secret_key)

    base = settings.jitsi_base_url.rstrip("/")

    can_join = sess.status not in (TelehealthSessionStatus.ended, TelehealthSessionStatus.expired)

    return MeetingInfoOut(

        jitsi_base_url=base,

        room_name=room,

        appointment_start_at=appt.start_at,

        appointment_end_at=appt.end_at,

        session_status=sess.status,

        ended_at=sess.ended_at,

        can_join_video=can_join,

    )





@router.post("/sessions/{session_id}/activity", response_model=TelehealthSessionOut)

async def log_activity(

    session_id: int,

    payload: dict[str, Any],

    current: User = Depends(get_current_user),

    db: AsyncSession = Depends(get_db),

) -> TelehealthSession:

    sess = await get_telehealth_session_for_user(db, current, session_id)

    entry = {"at": datetime.now(UTC).isoformat(), "user_id": current.id, "event": payload}

    log = list(sess.activity_log or [])

    log.append(entry)

    sess.activity_log = log

    await db.flush()

    await db.refresh(sess)

    return sess





@router.get("/sessions/{session_id}", response_model=TelehealthSessionOut)

async def get_session(

    session_id: int,

    current: User = Depends(get_current_user),

    db: AsyncSession = Depends(get_db),

) -> TelehealthSession:

    return await get_telehealth_session_for_user(db, current, session_id)





@router.post("/sessions/{session_id}/end", response_model=TelehealthSessionOut)

async def end_session(

    session_id: int,

    current: User = Depends(require_roles(UserRole.provider, UserRole.admin)),

    db: AsyncSession = Depends(get_db),

) -> TelehealthSession:

    sess = await get_telehealth_session_for_user(db, current, session_id)

    return await end_telehealth_session(db, current, sess)


