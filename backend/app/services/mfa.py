"""Second factors: authenticator-app codes (TOTP, RFC 6238) and passkeys (WebAuthn).

Both work entirely locally – TOTP codes are derived from a shared secret and
the clock, so apps like Microsoft/Google Authenticator need no server of ours
or theirs; passkeys are verified with the public key stored at registration.
"""
import io
import secrets
import time

import pyotp
import qrcode
import qrcode.image.svg
from fastapi import HTTPException

from app.services.crypto import decrypt_token, encrypt_token

TOTP_ISSUER = "Smooth Family"
TOTP_VALID_WINDOW = 1  # accept the previous/next 30 s step for clock drift
CHALLENGE_TTL_SECONDS = 300


# ── Policy ────────────────────────────────────────────────────────────────────

def totp_active(user, family) -> bool:
    """The user has an authenticator and the family hasn't switched codes off."""
    return family.totp_policy != "off" and user.totp_secret_encrypted is not None


def totp_required(user, family) -> bool:
    """The family requires an authenticator; children are exempt."""
    return family.totp_policy == "required" and user.role != "child"


# ── TOTP ──────────────────────────────────────────────────────────────────────

def new_totp_secret() -> str:
    return pyotp.random_base32()


def encrypt_secret(secret: str) -> str:
    return encrypt_token(secret)


def decrypt_secret(encrypted: str) -> str:
    return decrypt_token(encrypted)


def provisioning_uri(secret: str, username: str, family_name: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=f"{username} ({family_name})", issuer_name=TOTP_ISSUER)


def qr_svg(data: str) -> str:
    image = qrcode.make(data, image_factory=qrcode.image.svg.SvgPathImage, box_size=8, border=2)
    buf = io.BytesIO()
    image.save(buf)
    return buf.getvalue().decode()


def verify_totp(secret: str, code: str, last_step: int | None) -> int | None:
    """Return the matched time step, or None. Rejects codes at or before
    last_step so an intercepted code can't be replayed."""
    code = "".join(ch for ch in code if ch.isdigit())
    if len(code) != 6:
        return None
    totp = pyotp.TOTP(secret)
    now_step = int(time.time()) // totp.interval
    for step in range(now_step - TOTP_VALID_WINDOW, now_step + TOTP_VALID_WINDOW + 1):
        if last_step is not None and step <= last_step:
            continue
        if secrets.compare_digest(totp.generate_otp(step), code):
            return step
    return None


# ── WebAuthn challenges ───────────────────────────────────────────────────────
# Single-use and short-lived; in memory because the API runs one worker.

_challenges: dict[str, tuple[bytes, str | None, float]] = {}


def store_challenge(challenge: bytes, user_id: str | None) -> str:
    now = time.monotonic()
    for key in [k for k, (_, _, exp) in _challenges.items() if exp < now]:
        del _challenges[key]
    challenge_id = secrets.token_urlsafe(24)
    _challenges[challenge_id] = (challenge, user_id, now + CHALLENGE_TTL_SECONDS)
    return challenge_id


def pop_challenge(challenge_id: str, user_id: str | None) -> bytes:
    entry = _challenges.pop(challenge_id, None)
    if entry is None or entry[2] < time.monotonic() or entry[1] != user_id:
        raise HTTPException(status_code=400, detail="Passkey request expired, try again")
    return entry[0]


def reset_challenges() -> None:
    _challenges.clear()
