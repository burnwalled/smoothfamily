"""Passkeys (WebAuthn) and authenticator-app codes (TOTP): enrolment, sign-in and policy."""
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from webauthn import (
    base64url_to_bytes,
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers.exceptions import InvalidAuthenticationResponse, InvalidJSONStructure, InvalidRegistrationResponse
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.services import security_policy
from app.deps import DB, CurrentUser, ServerAdmin
from app.models import Family, User, WebAuthnCredential
from app.routers.auth import _me
from app.schemas import MeOut
from app.security import create_token, read_mfa_token, set_session_cookie
from app.services import login_throttle, mfa, public_url

router = APIRouter(prefix="/api/auth", tags=["mfa"])

TotpPolicy = Literal["off", "optional", "required"]


# ── Schemas ───────────────────────────────────────────────────────────────────

class TotpCode(BaseModel):
    code: str = Field(min_length=6, max_length=10)


class MfaCode(TotpCode):
    mfa_token: str = Field(min_length=10, max_length=2000)


class MfaToken(BaseModel):
    mfa_token: str = Field(min_length=10, max_length=2000)


class TotpSetupOut(BaseModel):
    secret: str
    otpauth_uri: str
    qr_svg: str


class PasskeyOut(BaseModel):
    id: uuid.UUID
    name: str
    created_at: datetime
    last_used_at: datetime | None


class SecurityOut(BaseModel):
    passkeys_enabled: bool
    totp_policy: TotpPolicy
    totp_enabled: bool
    totp_required: bool
    passkeys: list[PasskeyOut]


class PolicyIn(BaseModel):
    passkeys_enabled: bool
    totp_policy: TotpPolicy


class ChallengeOut(BaseModel):
    challenge_id: str
    options: dict[str, Any]


class PasskeyRegisterIn(BaseModel):
    challenge_id: str = Field(max_length=100)
    credential: dict[str, Any]
    name: str = Field(min_length=1, max_length=80)


class PasskeyLoginIn(BaseModel):
    challenge_id: str = Field(max_length=100)
    credential: dict[str, Any]


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _finish_login(user: User, response: Response, db: DB) -> MeOut:
    login_throttle.record_success(user.username)
    set_session_cookie(response, create_token(user.id))
    return _me(user, await db.get(Family, user.family_id))


async def _user_from_mfa_token(token: str, request: Request, db: DB) -> tuple[User, Family, str]:
    user = await db.get(User, read_mfa_token(token))
    if user is None:
        raise HTTPException(status_code=401, detail="Sign-in expired, start again")
    ip = login_throttle.client_ip(request)
    wait = login_throttle.retry_after(user.username, ip)
    if wait:
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again later.", headers={"Retry-After": str(wait)})
    return user, await db.get(Family, user.family_id), ip


def _setup_out(user: User, family: Family, secret: str) -> TotpSetupOut:
    uri = mfa.provisioning_uri(secret, user.username, family.name)
    return TotpSetupOut(secret=secret, otpauth_uri=uri, qr_svg=mfa.qr_svg(uri))


def _accept_code(user: User, secret: str, code: str) -> bool:
    step = mfa.verify_totp(secret, code, user.totp_last_step)
    if step is None:
        return False
    user.totp_last_step = step
    return True


# ── Sign-in, second step ──────────────────────────────────────────────────────

@router.post("/login/totp", response_model=MeOut)
async def login_with_code(payload: MfaCode, request: Request, response: Response, db: DB) -> MeOut:
    user, family, ip = await _user_from_mfa_token(payload.mfa_token, request, db)
    if not mfa.totp_active(user, family):
        raise HTTPException(status_code=400, detail="No authenticator configured")
    if not _accept_code(user, mfa.decrypt_secret(user.totp_secret_encrypted), payload.code):
        login_throttle.record_failure(user.username, ip)
        raise HTTPException(status_code=401, detail="Wrong code")
    await db.commit()
    return await _finish_login(user, response, db)


@router.post("/login/totp/setup", response_model=TotpSetupOut)
async def login_totp_setup(payload: MfaToken, request: Request, db: DB) -> TotpSetupOut:
    """Forced enrolment when the family requires an authenticator and this user has none."""
    user, family, _ = await _user_from_mfa_token(payload.mfa_token, request, db)
    if mfa.totp_active(user, family) or not mfa.totp_required(user, family):
        raise HTTPException(status_code=400, detail="Authenticator setup not needed")
    secret = mfa.new_totp_secret()
    user.totp_pending_encrypted = mfa.encrypt_secret(secret)
    await db.commit()
    return _setup_out(user, family, secret)


@router.post("/login/totp/enable", response_model=MeOut)
async def login_totp_enable(payload: MfaCode, request: Request, response: Response, db: DB) -> MeOut:
    user, family, ip = await _user_from_mfa_token(payload.mfa_token, request, db)
    if user.totp_pending_encrypted is None or not mfa.totp_required(user, family):
        raise HTTPException(status_code=400, detail="Start the authenticator setup first")
    if not _accept_code(user, mfa.decrypt_secret(user.totp_pending_encrypted), payload.code):
        login_throttle.record_failure(user.username, ip)
        raise HTTPException(status_code=401, detail="Wrong code")
    user.totp_secret_encrypted, user.totp_pending_encrypted = user.totp_pending_encrypted, None
    await db.commit()
    return await _finish_login(user, response, db)


# ── Passkey sign-in ───────────────────────────────────────────────────────────

@router.post("/passkeys/login/options", response_model=ChallengeOut)
async def passkey_login_options(request: Request, db: DB) -> ChallengeOut:
    enabled = (await db.execute(select(Family.id).where(Family.passkeys_enabled.is_(True)).limit(1))).first()
    if enabled is None:
        raise HTTPException(status_code=404, detail="Passkeys are turned off")
    rp_id, _ = await public_url.relying_party(db, request)
    # No allowCredentials: the device offers its discoverable passkeys for this site.
    options = generate_authentication_options(rp_id=rp_id, user_verification=UserVerificationRequirement.PREFERRED)
    challenge_id = mfa.store_challenge(options.challenge, None)
    return ChallengeOut(challenge_id=challenge_id, options=_json(options))


@router.post("/passkeys/login/verify", response_model=MeOut)
async def passkey_login_verify(payload: PasskeyLoginIn, request: Request, response: Response, db: DB) -> MeOut:
    ip = login_throttle.client_ip(request)
    if login_throttle.ip_retry_after(ip):
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again later.")
    challenge = mfa.pop_challenge(payload.challenge_id, None)
    try:
        raw_id = base64url_to_bytes(str(payload.credential.get("rawId", "")))
    except Exception:
        raw_id = b""
    cred = (
        await db.execute(select(WebAuthnCredential).where(WebAuthnCredential.credential_id == raw_id))
    ).scalar_one_or_none()
    user = await db.get(User, cred.user_id) if cred else None
    family = await db.get(Family, user.family_id) if user else None
    if cred is None or user is None or not family.passkeys_enabled:
        login_throttle.record_ip_failure(ip)
        raise HTTPException(status_code=401, detail="Unknown passkey")

    rp_id, origin = await public_url.relying_party(db, request)
    try:
        verified = verify_authentication_response(
            credential=payload.credential,
            expected_challenge=challenge,
            expected_rp_id=rp_id,
            expected_origin=origin,
            credential_public_key=cred.public_key,
            credential_current_sign_count=cred.sign_count,
        )
    except (InvalidAuthenticationResponse, InvalidJSONStructure) as exc:
        login_throttle.record_failure(user.username, ip)
        raise HTTPException(status_code=401, detail="Passkey could not be verified") from exc

    cred.sign_count = verified.new_sign_count
    cred.last_used_at = datetime.now(timezone.utc)
    await db.commit()
    # A passkey is already two factors (device + biometrics/PIN), so no TOTP step.
    return await _finish_login(user, response, db)


# ── Own security settings (signed in) ─────────────────────────────────────────

@router.get("/security", response_model=SecurityOut)
async def my_security(user: CurrentUser, db: DB) -> SecurityOut:
    family = await db.get(Family, user.family_id)
    creds = (
        await db.execute(
            select(WebAuthnCredential).where(WebAuthnCredential.user_id == user.id).order_by(WebAuthnCredential.created_at)
        )
    ).scalars().all()
    return SecurityOut(
        passkeys_enabled=family.passkeys_enabled,
        totp_policy=family.totp_policy,
        totp_enabled=mfa.totp_active(user, family),
        totp_required=mfa.totp_required(user, family),
        passkeys=[PasskeyOut(id=c.id, name=c.name, created_at=c.created_at, last_used_at=c.last_used_at) for c in creds],
    )


@router.post("/totp/setup", response_model=TotpSetupOut)
async def totp_setup(user: CurrentUser, db: DB) -> TotpSetupOut:
    family = await db.get(Family, user.family_id)
    if family.totp_policy == "off":
        raise HTTPException(status_code=404, detail="Authenticator codes are turned off")
    secret = mfa.new_totp_secret()
    user.totp_pending_encrypted = mfa.encrypt_secret(secret)
    await db.commit()
    return _setup_out(user, family, secret)


@router.post("/totp/enable", status_code=status.HTTP_204_NO_CONTENT)
async def totp_enable(payload: TotpCode, user: CurrentUser, db: DB) -> None:
    if user.totp_pending_encrypted is None:
        raise HTTPException(status_code=400, detail="Start the authenticator setup first")
    if not _accept_code(user, mfa.decrypt_secret(user.totp_pending_encrypted), payload.code):
        raise HTTPException(status_code=400, detail="Wrong code")
    user.totp_secret_encrypted, user.totp_pending_encrypted = user.totp_pending_encrypted, None
    await db.commit()


@router.post("/totp/disable", status_code=status.HTTP_204_NO_CONTENT)
async def totp_disable(payload: TotpCode, user: CurrentUser, db: DB) -> None:
    family = await db.get(Family, user.family_id)
    if mfa.totp_required(user, family):
        raise HTTPException(status_code=403, detail="Your family requires an authenticator")
    if user.totp_secret_encrypted is None:
        return
    if not _accept_code(user, mfa.decrypt_secret(user.totp_secret_encrypted), payload.code):
        raise HTTPException(status_code=400, detail="Wrong code")
    user.totp_secret_encrypted = None
    user.totp_last_step = None
    await db.commit()


@router.post("/passkeys/register/options", response_model=ChallengeOut)
async def passkey_register_options(request: Request, user: CurrentUser, db: DB) -> ChallengeOut:
    family = await db.get(Family, user.family_id)
    if not family.passkeys_enabled:
        raise HTTPException(status_code=404, detail="Passkeys are turned off")
    existing = (
        await db.execute(select(WebAuthnCredential.credential_id).where(WebAuthnCredential.user_id == user.id))
    ).scalars().all()
    rp_id, _ = await public_url.relying_party(db, request)
    options = generate_registration_options(
        rp_id=rp_id,
        rp_name=f"Smooth Family – {family.name}",
        user_id=user.id.bytes,
        user_name=user.username,
        user_display_name=user.display_name,
        exclude_credentials=[PublicKeyCredentialDescriptor(id=cid) for cid in existing],
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
    )
    challenge_id = mfa.store_challenge(options.challenge, str(user.id))
    return ChallengeOut(challenge_id=challenge_id, options=_json(options))


@router.post("/passkeys/register/verify", response_model=PasskeyOut, status_code=status.HTTP_201_CREATED)
async def passkey_register_verify(payload: PasskeyRegisterIn, request: Request, user: CurrentUser, db: DB) -> PasskeyOut:
    challenge = mfa.pop_challenge(payload.challenge_id, str(user.id))
    rp_id, origin = await public_url.relying_party(db, request)
    try:
        verified = verify_registration_response(
            credential=payload.credential,
            expected_challenge=challenge,
            expected_rp_id=rp_id,
            expected_origin=origin,
        )
    except (InvalidRegistrationResponse, InvalidJSONStructure) as exc:
        raise HTTPException(status_code=400, detail="Passkey could not be verified") from exc

    transports = payload.credential.get("response", {}).get("transports")
    cred = WebAuthnCredential(
        user_id=user.id,
        credential_id=verified.credential_id,
        public_key=verified.credential_public_key,
        sign_count=verified.sign_count,
        transports=transports if isinstance(transports, list) else None,
        name=payload.name.strip(),
    )
    db.add(cred)
    await db.commit()
    await db.refresh(cred)
    return PasskeyOut(id=cred.id, name=cred.name, created_at=cred.created_at, last_used_at=cred.last_used_at)


@router.delete("/passkeys/{passkey_id}", status_code=status.HTTP_204_NO_CONTENT)
async def passkey_delete(passkey_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    cred = await db.get(WebAuthnCredential, passkey_id)
    if cred is None or cred.user_id != user.id:
        raise HTTPException(status_code=404, detail="Passkey not found")
    await db.delete(cred)
    await db.commit()


# ── Sign-in policy (the server admin, for every family since 2.8.2) ──────────

@router.put("/policy", response_model=PolicyIn)
async def set_policy(payload: PolicyIn, admin: ServerAdmin, db: DB) -> PolicyIn:
    await security_policy.set_policy(db, payload.model_dump())
    return payload


def _json(options) -> dict[str, Any]:
    return json.loads(options_to_json(options))
