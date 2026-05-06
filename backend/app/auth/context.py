"""Authentication context derived from Clerk JWT.

Every authenticated request resolves a current user and their family memberships.
This context is then used for authorization in every endpoint.

CRITICAL: family_id NEVER comes from the client. It always comes from the
server based on who the authenticated user is.
"""

from dataclasses import dataclass, field
from uuid import UUID

import httpx
from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.service import get_or_create_user
from app.core.database import get_db
from app.core.settings import get_settings
from app.families.service import list_user_memberships

settings = get_settings()


@dataclass(frozen=True)
class AuthContext:
    """Resolved authentication context for the current request.

    user_id: Internal Boet UUID for the User row.
    clerk_user_id: External Clerk identifier (string from Clerk).
    family_ids: List of all families this user is a member of.
    primary_family_id: User's primary family – None until Sprint 2 (families).
    """

    user_id: UUID
    clerk_user_id: str
    email: str
    family_ids: list[UUID] = field(default_factory=list)
    primary_family_id: UUID | None = None

    def has_family_access(self, family_id: UUID) -> bool:
        """Check if the current user is a member of the given family."""
        return family_id in self.family_ids


# Cache for Clerk's JWKS (rotating keys for verifying JWTs)
_jwks_cache: dict[str, object] | None = None


async def _get_clerk_jwks() -> dict[str, object]:
    """Fetch Clerk's JWKS for JWT verification. Cached per process."""
    global _jwks_cache
    if _jwks_cache is None:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{settings.CLERK_JWT_ISSUER}/.well-known/jwks.json")
                response.raise_for_status()
                _jwks_cache = response.json()
        except httpx.HTTPError as error:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unable to verify token against Clerk issuer",
            ) from error
    assert _jwks_cache is not None
    return _jwks_cache


async def _verify_clerk_jwt(token: str) -> dict[str, object]:
    """Verify a Clerk JWT and return its claims."""
    try:
        # Get the right key from JWKS based on token's kid
        jwks = await _get_clerk_jwks()
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")

        # Find matching key
        key = None
        for jwk in jwks.get("keys", []):  # type: ignore[union-attr]
            if jwk.get("kid") == kid:
                key = jwk
                break

        if key is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unknown token signing key",
            )

        # Verify and decode
        claims = jwt.decode(
            token,
            key,  # type: ignore[arg-type]
            algorithms=["RS256"],
            issuer=settings.CLERK_JWT_ISSUER,
            options={"verify_aud": False},  # Clerk doesn't always set aud
        )
        return claims  # type: ignore[no-any-return]
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
        ) from e


async def get_current_context(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AuthContext:
    """FastAPI dependency that resolves the current AuthContext from the request.

    Validates the Authorization header, verifies the JWT, looks up the user
    and their family memberships in the database.

    Raises 401 if not authenticated or user not found.

    NOTE: This is a stub. Full implementation requires User and FamilyMembership
    models which will be added in Sprint 1. For now, this raises NotImplemented
    to make sure no endpoint accidentally bypasses auth.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )

    token = auth_header[len("Bearer ") :]
    claims = await _verify_clerk_jwt(token)
    clerk_user_id = claims.get("sub")

    if not clerk_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing sub claim",
        )

    email = str(claims.get("email", ""))
    user = await get_or_create_user(db, str(clerk_user_id), email)
    memberships = await list_user_memberships(db, user.id)
    family_ids = [membership.family_id for membership in memberships]

    primary_family_id = None
    if memberships:
        primary_family_id = next(
            (membership.family_id for membership in memberships if membership.is_primary),
            memberships[0].family_id,
        )

    return AuthContext(
        user_id=user.id,
        clerk_user_id=str(clerk_user_id),
        email=email,
        family_ids=family_ids,
        primary_family_id=primary_family_id,
    )


async def require_family_access(
    family_id: UUID,
    ctx: AuthContext = Depends(get_current_context),
) -> AuthContext:
    """Dependency that ensures the user has access to the specified family.

    Use this in any endpoint that takes a family_id path parameter:

        @router.get("/families/{family_id}/calendar")
        async def list_events(
            family_id: UUID,
            ctx: AuthContext = Depends(require_family_access),
        ):
            ...
    """
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )
    return ctx
