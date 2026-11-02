"""FastAPI dependencies: current user and admin guard."""
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.security import read_user_id_from_request

DB = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(request: Request, db: DB) -> User:
    from app.models import Family

    user_id = read_user_id_from_request(request)
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists")
    family = await db.get(Family, user.family_id)
    if family is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists")
    if family.status != "active":
        # The server admin has paused this family.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="This family's access is paused")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def require_admin(user: CurrentUser) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return user


AdminUser = Annotated[User, Depends(require_admin)]


async def require_family_manager(user: CurrentUser) -> User:
    """The family's settings (everyday, children, sharing): the admin, or an adult the admin lets."""
    if user.role == "admin" or (user.role == "adult" and user.can_manage_family):
        return user
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the family admin, or an adult they let, can change this")


FamilyManager = Annotated[User, Depends(require_family_manager)]


async def require_adult(user: CurrentUser) -> User:
    if user.role not in {"admin", "adult"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Adult or admin privileges required")
    return user


AdultUser = Annotated[User, Depends(require_adult)]


async def require_server_admin(user: CurrentUser, db: DB) -> User:
    """Things that concern the whole server – families, invitations, backups of everyone. Never
    gives access to another family's content."""
    del db
    if not user.is_server_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the server's admin can do this")
    return user


ServerAdmin = Annotated[User, Depends(require_server_admin)]


async def require_smarthome_host(user: CurrentUser, db: DB) -> None:
    """Smart home needs the server in the same home as Home Assistant: only the family that runs
    the server has it."""
    from app.models import Family

    from app.services.smarthome_conn import hosted_allowed

    family = await db.get(Family, user.family_id)
    # A demo family tries the smart home on a simulated Home Assistant; a hosted family brings its
    # own through the gateway when the server admin allows it (2.8.4).
    kind = family.kind or "owner"
    if kind == "hosted" and await hosted_allowed(db):
        return
    if kind not in ("owner", "demo"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Smart home works when you host Smooth Family yourself")


def require_app(app: str):
    """Router dependency: 403 unless the family admin lets this member use the app."""

    async def check(user: CurrentUser) -> None:
        if app not in user.apps:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This app is not enabled for you")

    return Depends(check)
