"""Invitations and the demo – the only ways into a server besides the very first setup.

An invitation link (from the server admin) lets someone try a demo family bound to that link, or
create their own family. On a brand-new installation the setup page offers the demo too. Demo
members switch with one tap; "start over" re-creates the sample data.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.services.holidays import BY_LANGUAGE
from app.services import security_policy
from app.deps import DB, CurrentUser
from app.models import Family, Invitation, User
from app.routers.auth import _me
from app.routers.server import _state, token_hash
from app.schemas import SUPPORTED_LANGUAGES, Email, MeOut, Username
from app.security import clear_session_cookie, create_token, hash_password, set_session_cookie
from app.services import families as fam
from app.services import login_throttle
from app.services.demo import create_demo_family

router = APIRouter(prefix="/api", tags=["invite"])


class InviteInfo(BaseModel):
    label: str
    expires_at: datetime
    demo_active: bool
    password_min: int


class NewFamilyIn(BaseModel):
    family_name: str = Field(min_length=1, max_length=120)
    display_name: str = Field(min_length=1, max_length=120)
    username: Username
    password: str = Field(min_length=8, max_length=200)
    email: Email
    language: str = Field(default="sv", pattern=SUPPORTED_LANGUAGES)


class DemoIn(BaseModel):
    language: str = Field(default="sv", pattern=SUPPORTED_LANGUAGES)
    setup_code: str | None = Field(default=None, max_length=200)


class DemoMember(BaseModel):
    id: uuid.UUID
    name: str
    role: str
    color: str


class DemoOut(BaseModel):
    members: list[DemoMember]
    # Through an invitation (back to its page) or on a new installation (back to setup).
    invitation: bool


class SwitchIn(BaseModel):
    user_id: uuid.UUID


async def _open_invitation(db, token: str, request: Request) -> Invitation:
    """The invitation behind a token, if it can still be used; a neutral 404 otherwise."""
    ip = login_throttle.client_ip(request)
    if login_throttle.ip_retry_after(ip):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    inv = (await db.execute(select(Invitation).where(Invitation.token_hash == token_hash(token)))).scalar_one_or_none()
    if inv is None or _state(inv, datetime.now(timezone.utc)) != "open":
        login_throttle.record_ip_failure(ip)
        raise HTTPException(status_code=404, detail="This link isn't valid")
    return inv


async def _sign_in(response: Response, user: User) -> None:
    set_session_cookie(response, create_token(user.id))


@router.get("/invite/{token}", response_model=InviteInfo)
async def invite_info(token: str, request: Request, db: DB) -> InviteInfo:
    inv = await _open_invitation(db, token, request)
    policy = await security_policy.get_policy(db)
    return InviteInfo(label=inv.label, expires_at=inv.expires_at, demo_active=inv.demo_family_id is not None, password_min=policy["password_min_adult"])


@router.post("/invite/{token}/family", response_model=MeOut, status_code=status.HTTP_201_CREATED)
async def create_family(token: str, payload: NewFamilyIn, request: Request, response: Response, db: DB) -> MeOut:
    inv = await _open_invitation(db, token, request)
    username = payload.username.lower()
    if (await db.execute(select(User.id).where(User.username == username))).first():
        raise HTTPException(status_code=409, detail="Username is already taken")
    await security_policy.check_password(db, payload.password, "admin")
    policy = await security_policy.get_policy(db)
    family = Family(
        name=payload.family_name.strip(), kind="hosted", invitation_id=inv.id, passkeys_enabled=policy["passkeys_enabled"], totp_policy=policy["totp_policy"],
        holiday_country=BY_LANGUAGE.get(payload.language or ""),
    )
    db.add(family)
    await db.flush()
    admin = User(
        family_id=family.id,
        username=username,
        display_name=payload.display_name.strip(),
        email=payload.email.strip(),
        password_hash=hash_password(payload.password),
        role="admin",
        language=payload.language,
    )
    db.add(admin)
    inv.used_at = datetime.now(timezone.utc)
    inv.family_id = family.id
    demo = inv.demo_family_id
    inv.demo_family_id = None
    await db.commit()
    if demo:
        await fam.delete_family(db, demo)
    await fam.log(db, None, "family_created", family.id, f"{family.name} (invitation: {inv.label})")
    await _sign_in(response, admin)
    return _me(admin, family)


async def _start_demo(db, response: Response, language: str, invitation: Invitation | None) -> MeOut:
    family, members = await create_demo_family(db, language, invitation.id if invitation else None)
    if invitation is not None:
        old = invitation.demo_family_id
        invitation.demo_family_id = family.id
        await db.commit()
        if old:
            await fam.delete_family(db, old)
    first = next(m for m in members if m.role == "admin")
    await _sign_in(response, first)
    return _me(first, family)


@router.post("/invite/{token}/demo", response_model=MeOut, status_code=status.HTTP_201_CREATED)
async def invite_demo(token: str, payload: DemoIn, request: Request, response: Response, db: DB) -> MeOut:
    inv = await _open_invitation(db, token, request)
    return await _start_demo(db, response, payload.language, inv)


@router.post("/auth/setup/demo", response_model=MeOut, status_code=status.HTTP_201_CREATED)
async def setup_demo(payload: DemoIn, response: Response, db: DB) -> MeOut:
    """A brand-new installation: try the demo before creating the family."""
    import secrets

    from app.config import get_settings

    if (await db.execute(select(func.count(Family.id)).where(Family.kind != "demo"))).scalar_one():
        raise HTTPException(status_code=409, detail="Setup has already been completed")
    expected = get_settings().setup_code
    if expected and not secrets.compare_digest((payload.setup_code or "").encode(), expected.encode()):
        raise HTTPException(status_code=403, detail="Wrong setup code")
    for old in (await db.execute(select(Family.id).where(Family.kind == "demo", Family.invitation_id.is_(None)))).scalars().all():
        await fam.delete_family(db, old)
    return await _start_demo(db, response, payload.language, None)


async def _demo_family(db, user: User) -> Family:
    family = await db.get(Family, user.family_id)
    if family.kind != "demo":
        raise HTTPException(status_code=404, detail="Not a demo")
    return family


@router.get("/demo", response_model=DemoOut)
async def demo_info(user: CurrentUser, db: DB) -> DemoOut:
    family = await _demo_family(db, user)
    members = (await db.execute(select(User).where(User.family_id == family.id).order_by(User.created_at))).scalars().all()
    return DemoOut(members=[DemoMember(id=m.id, name=m.display_name, role=m.role, color=m.color) for m in members], invitation=family.invitation_id is not None)


@router.post("/demo/switch", response_model=MeOut)
async def demo_switch(payload: SwitchIn, user: CurrentUser, response: Response, db: DB) -> MeOut:
    """Sign in as another member of the same demo family – no password in a demo."""
    family = await _demo_family(db, user)
    other = await db.get(User, payload.user_id)
    if other is None or other.family_id != family.id:
        raise HTTPException(status_code=404, detail="Member not found")
    await _sign_in(response, other)
    return _me(other, family)


@router.post("/demo/reset", response_model=MeOut)
async def demo_reset(user: CurrentUser, response: Response, db: DB) -> MeOut:
    family = await _demo_family(db, user)
    invitation = await db.get(Invitation, family.invitation_id) if family.invitation_id else None
    language = user.language or "sv"
    if invitation is None:
        await fam.delete_family(db, family.id)
    return await _start_demo(db, response, language, invitation)


@router.post("/demo/leave", status_code=status.HTTP_204_NO_CONTENT)
async def demo_leave(user: CurrentUser, response: Response, db: DB) -> None:
    """On a new installation: remove the demo and go back to setting up the real family. (Through
    an invitation the demo stays until the family is created or the link expires.)"""
    family = await _demo_family(db, user)
    if family.invitation_id is None:
        await fam.delete_family(db, family.id)
    clear_session_cookie(response)
