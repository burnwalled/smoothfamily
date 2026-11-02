"""The server's security rules (2.8.2), set by the server admin: passkeys, two-step codes and how long
passwords must be. The sign-in rules are written onto every family (where sign-in reads them); the
password rule is checked wherever a password is set."""
import json

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppSetting, Family

KEY = "security_policy"
# Passwords (2.9.0): 12 characters for adults – the first admin and invited families' admins too –
# unless the server admin chooses fewer. Children keep 4; they mostly sign in on the family's devices.
ADULT_MIN = 12
DEFAULTS = {"passkeys_enabled": True, "totp_policy": "optional", "password_min_adult": ADULT_MIN, "password_min_child": 4}


async def get_policy(db: AsyncSession) -> dict:
    row = await db.get(AppSetting, KEY)
    if row is not None:
        return {**DEFAULTS, **json.loads(row.value)}
    # Before 2.8.2 each family chose: start from the owner's family.
    owner = (await db.execute(select(Family).where(Family.kind == "owner").limit(1))).scalar_one_or_none()
    if owner is None:
        return dict(DEFAULTS)
    return {**DEFAULTS, "passkeys_enabled": owner.passkeys_enabled, "totp_policy": owner.totp_policy}


async def set_policy(db: AsyncSession, policy: dict) -> dict:
    current = {**await get_policy(db), **{k: v for k, v in policy.items() if k in DEFAULTS}}
    row = await db.get(AppSetting, KEY)
    if row is None:
        db.add(AppSetting(key=KEY, value=json.dumps(current)))
    else:
        row.value = json.dumps(current)
    # Every family follows the server (a demo family keeps its own, open sign-in).
    await db.execute(
        update(Family).where(Family.kind != "demo").values(passkeys_enabled=current["passkeys_enabled"], totp_policy=current["totp_policy"])
    )
    await db.commit()
    return current


async def check_password(db: AsyncSession, password: str, role: str) -> None:
    """422 when the password is shorter than the server allows for this role."""
    policy = await get_policy(db)
    least = policy["password_min_child"] if role == "child" else policy["password_min_adult"]
    if len(password) < least:
        raise HTTPException(status_code=422, detail=f"The password must be at least {least} characters")
