from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import AuthContext, get_current_context
from app.auth.service import get_or_create_user
from app.core.database import get_db
from app.families.schemas import FamilyInviteAcceptResponse
from app.families.service import accept_family_invite_token

router = APIRouter()


@router.get("/{token}", response_model=FamilyInviteAcceptResponse)
async def accept_family_invite(
    token: str,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> FamilyInviteAcceptResponse:
    user = await get_or_create_user(db, ctx.clerk_user_id, ctx.email)
    family, role, already_member = await accept_family_invite_token(db, user, token)

    return FamilyInviteAcceptResponse(
        family_id=family.id,
        family_name=family.name,
        role=role,
        already_member=already_member,
    )
