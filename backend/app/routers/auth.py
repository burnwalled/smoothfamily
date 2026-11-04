"""First-run setup, login/logout and current user."""
import io
import secrets

from fastapi import APIRouter, File, HTTPException, Request, Response, UploadFile, status, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select

from app.services import holidays
from app.services import security_policy
from app.services.families import delete_family
from app.config import get_settings
from app.deps import DB, CurrentUser
from app.models import Family, User
from app.schemas import LoginRequest, MeOut, MfaChallengeOut, PasswordChange, PreferencesUpdate, SetupRequest, SetupStatus
from app.services import login_throttle, mfa, security_log
from app.services.images import open_image
from app.services.uploads import read_upload
from app.services.storage import get_storage
from app.security import clear_session_cookie, create_mfa_token, create_token, hash_password, read_session, set_session_cookie, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/setup", response_model=SetupStatus)
async def setup_status(db: DB) -> SetupStatus:
    # A demo tried before the real setup doesn't count as set up.
    count = (await db.execute(select(func.count(Family.id)).where(Family.kind != "demo"))).scalar_one()
    passkeys = (await db.execute(select(Family.id).where(Family.passkeys_enabled.is_(True)).limit(1))).first()
    return SetupStatus(
        needs_setup=count == 0,
        requires_code=count == 0 and bool(get_settings().setup_code),
        passkeys_enabled=passkeys is not None,
        password_min=(await security_policy.get_policy(db))["password_min_adult"],
    )


@router.post("/setup", response_model=MeOut, status_code=status.HTTP_201_CREATED)
async def first_run_setup(payload: SetupRequest, request: Request, response: Response, db: DB) -> MeOut:
    """Create the family that owns the server and its admin (the server admin). Only allowed
    once; further families come through invitations."""
    count = (await db.execute(select(func.count(Family.id)).where(Family.kind != "demo"))).scalar_one()
    if count > 0:
        raise HTTPException(status_code=409, detail="Setup has already been completed")
    expected = get_settings().setup_code
    ip = login_throttle.client_ip(request)
    if login_throttle.ip_retry_after(ip):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    if expected and not secrets.compare_digest((payload.setup_code or "").encode(), expected.encode()):
        login_throttle.record_ip_failure(ip)
        await security_log.record(db, "setup_code", ip=ip)
        raise HTTPException(status_code=403, detail="Wrong setup code")
    if (await db.execute(select(User.id).where(User.username == payload.username.lower()))).first():
        raise HTTPException(status_code=409, detail="Username is already taken")
    await security_policy.check_password(db, payload.password, "admin")
    # A demo tried before setting up is removed now.
    for demo in (await db.execute(select(Family.id).where(Family.kind == "demo", Family.invitation_id.is_(None)))).scalars().all():
        await delete_family(db, demo)

    family = Family(
        name=payload.family_name,
        passkeys_enabled=payload.passkeys_enabled,
        totp_policy=payload.totp_policy,
        kind="owner",
        holiday_country=holidays.BY_LANGUAGE.get(payload.language or ""),
    )
    db.add(family)
    await db.flush()
    user = User(
        family_id=family.id,
        username=payload.username.lower(),
        display_name=payload.display_name,
        email=payload.email.strip(),
        password_hash=hash_password(payload.password),
        role="admin",
        is_server_admin=True,
        language=payload.language or "en",
    )
    db.add(user)
    await db.commit()
    await security_policy.set_policy(db, {"passkeys_enabled": payload.passkeys_enabled, "totp_policy": payload.totp_policy})

    set_session_cookie(response, create_token(user.id, user.session_version))
    return _me(user, family)


@router.post("/login", response_model=MeOut | MfaChallengeOut)
async def login(payload: LoginRequest, request: Request, response: Response, db: DB) -> MeOut | MfaChallengeOut:
    username = payload.username.strip().lower()
    ip = login_throttle.client_ip(request)
    wait = login_throttle.retry_after(username, ip)
    if wait:
        await security_log.throttled(db, ip, username)
        raise HTTPException(
            status_code=429,
            detail="Too many failed attempts. Try again later.",
            headers={"Retry-After": str(wait)},
        )
    user = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    # An unknown name takes as long as a wrong password, so the answer's timing says nothing.
    if user is None or not verify_password(payload.password, user.password_hash if user else _NOBODY):
        login_throttle.record_failure(username, ip)
        await security_log.record(db, "login_failed", ip=ip, user=user, username=username)
        raise HTTPException(status_code=401, detail="Wrong username or password")
    family = await db.get(Family, user.family_id)
    if family.status != "active":
        raise HTTPException(status_code=403, detail="This family's access is paused – contact the server's admin")

    # Second factor: an enrolled authenticator, or forced enrolment when the
    # family requires one. No session cookie until that step is done.
    if mfa.totp_active(user, family):
        return MfaChallengeOut(mfa_token=create_mfa_token(user.id))
    if mfa.totp_required(user, family):
        return MfaChallengeOut(totp_setup_required=True, mfa_token=create_mfa_token(user.id))

    login_throttle.record_success(username)
    set_session_cookie(response, create_token(user.id, user.session_version))
    return _me(user, family)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response, db: DB, everywhere: bool = Query(default=False)) -> None:
    """This browser's session ends; with ?everywhere=true every other session of the account too."""
    if everywhere:
        try:
            user_id, _ = read_session(request)
        except HTTPException:
            user_id = None
        user = await db.get(User, user_id) if user_id else None
        if user is not None:
            user.session_version = (user.session_version or 1) + 1
            await db.commit()
            await security_log.record(db, "sessions_ended", ip=login_throttle.client_ip(request), user=user)
    clear_session_cookie(response)


@router.get("/me", response_model=MeOut)
async def me(user: CurrentUser, db: DB) -> MeOut:
    family = await db.get(Family, user.family_id)
    out = _me(user, family)
    if out.smarthome_gateway_only:
        from app.services.smarthome_conn import hosted_allowed

        out.smarthome_available = await hosted_allowed(db)
    if out.family_kind != "owner":
        from sqlalchemy import select as _select

        host = (await db.execute(_select(Family).where(Family.kind == "owner").order_by(Family.created_at).limit(1))).scalar_one_or_none()
        out.host_family_name = host.name if host else None
    return out


@router.patch("/me", response_model=MeOut)
async def update_preferences(payload: PreferencesUpdate, user: CurrentUser, db: DB) -> MeOut:
    """Update the current user's display language and/or theme."""
    if payload.display_name is not None:
        user.display_name = payload.display_name
    if payload.email is not None:
        user.email = payload.email.strip() or None
    if payload.language is not None:
        user.language = payload.language
    if payload.theme is not None:
        user.theme = payload.theme
    if payload.notification_prefs is not None:
        user.notification_prefs = payload.notification_prefs.model_dump()
    if payload.nav_order is not None:
        user.nav_order = payload.nav_order
    if payload.nav_hidden is not None:
        user.nav_hidden = payload.nav_hidden
    if payload.nav_group_mobile is not None:
        user.nav_group_mobile = payload.nav_group_mobile
    if payload.nav_group_desktop is not None:
        user.nav_group_desktop = payload.nav_group_desktop
    if payload.morning_summary is not None:
        user.morning_summary = payload.morning_summary
    if payload.morning_time is not None:
        user.morning_time = payload.morning_time
    if payload.morning_days is not None:
        user.morning_days = payload.morning_days
    await db.commit()
    await db.refresh(user)
    family = await db.get(Family, user.family_id)
    return _me(user, family)


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(payload: PasswordChange, request: Request, response: Response, user: CurrentUser, db: DB) -> None:
    """Change your own password; requires the current one."""
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is wrong")
    await security_policy.check_password(db, payload.new_password, user.role)
    user.password_hash = hash_password(payload.new_password)
    # Every other session ends; this one goes on with a fresh cookie.
    user.session_version = (user.session_version or 1) + 1
    await db.commit()
    set_session_cookie(response, create_token(user.id, user.session_version))
    await security_log.password_changed(db, user, login_throttle.client_ip(request))


# What an unknown username's password is checked against – so that the time taken is the same.
_NOBODY = hash_password(secrets.token_hex(16))
AVATAR_MAX_BYTES = 10 * 1024 * 1024

VALID_AVATAR_PRESETS = frozenset([
    "bear", "cat", "dog", "fox", "frog", "hedgehog",
    "koala", "lion", "owl", "panda", "penguin", "rabbit",
])


class AvatarPresetIn(BaseModel):
    name: str


@router.post("/me/avatar/preset", response_model=MeOut)
async def set_avatar_preset(body: AvatarPresetIn, user: CurrentUser, db: DB) -> MeOut:
    if body.name not in VALID_AVATAR_PRESETS:
        raise HTTPException(status_code=422, detail=f"Unknown preset '{body.name}'")
    user.avatar_key = f"preset:{body.name}"
    await db.commit()
    await db.refresh(user)
    family = await db.get(Family, user.family_id)
    return _me(user, family)


async def save_avatar(user: User, file: UploadFile) -> None:
    """A square 256 px JPEG of the uploaded picture becomes the member's avatar (not committed)."""
    content_type = file.content_type or ""
    if content_type not in {"image/jpeg", "image/png", "image/webp", "image/gif"}:
        raise HTTPException(status_code=422, detail="Only image uploads are allowed for avatar")

    from PIL import Image, ImageOps

    raw = await read_upload(file, AVATAR_MAX_BYTES)
    if not raw:
        raise HTTPException(status_code=422, detail="Empty file")

    try:
        img = open_image(raw).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Invalid image") from exc

    avatar = ImageOps.fit(img, (256, 256), method=Image.LANCZOS, centering=(0.5, 0.5))
    buf = io.BytesIO()
    avatar.save(buf, "JPEG", quality=85)
    buf.seek(0)

    key = f"avatars/{user.id}_avatar.jpg"
    storage = get_storage()
    storage.save(user.family_id, key, buf)
    user.avatar_key = key


def avatar_response(user: User):
    """The member's uploaded picture (a preset is drawn by the app itself)."""
    if not user.avatar_key or user.avatar_key.startswith("preset:"):
        raise HTTPException(status_code=404, detail="No avatar")
    try:
        file_path = get_storage().open(user.family_id, user.avatar_key)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="No avatar") from exc

    def _iter():
        with open(file_path, "rb") as fh:
            while chunk := fh.read(65536):
                yield chunk

    return StreamingResponse(_iter(), media_type="image/jpeg")


@router.post("/me/avatar", response_model=MeOut)
async def upload_avatar(file: UploadFile = File(...), user: CurrentUser = None, db: DB = None) -> MeOut:
    await save_avatar(user, file)
    await db.commit()
    await db.refresh(user)
    family = await db.get(Family, user.family_id)
    return _me(user, family)


@router.get("/me/avatar")
async def get_avatar(user: CurrentUser):
    if not user.avatar_key:
        raise HTTPException(status_code=404, detail="No avatar")
    storage = get_storage()
    try:
        file_path = storage.open(user.family_id, user.avatar_key)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="No avatar") from exc

    def _iter():
        with open(file_path, "rb") as fh:
            while chunk := fh.read(65536):
                yield chunk

    return StreamingResponse(_iter(), media_type="image/jpeg")


def _me(user: User, family: Family) -> MeOut:
    return MeOut(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        role=user.role,
        color=user.color,
        family_id=family.id,
        family_name=family.name,
        language=user.language,
        theme=user.theme,
        notification_prefs=user.notification_prefs,
        avatar_key=user.avatar_key,
        email=user.email,
        nav_order=user.nav_order or [],
        nav_hidden=user.nav_hidden or [],
        nav_group_mobile=bool(user.nav_group_mobile),
        nav_group_desktop=user.nav_group_desktop is not False,
        app_access=user.app_access,
        apps=user.apps,
        easy_mode=bool(user.easy_mode),
        can_manage_family=user.role == "admin" or bool(user.can_manage_family),
        is_server_admin=bool(user.is_server_admin),
        family_kind=family.kind or "owner",
        smarthome_available=(family.kind or "owner") in ("owner", "demo"),
        smarthome_gateway_only=family.kind == "hosted",
        morning_summary=bool(user.morning_summary),
        morning_time=user.morning_time or "07:00",
        morning_days=user.morning_days or "weekdays",
    )
