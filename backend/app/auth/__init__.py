"""Auth module – Clerk integration and authorization.

Exports:
    AuthContext: Per-request authentication state
    get_current_context: FastAPI dependency to extract AuthContext from JWT
    require_family_access: Dependency for family-scoped endpoints
"""

from app.auth.context import AuthContext, get_current_context, require_family_access

__all__ = ["AuthContext", "get_current_context", "require_family_access"]
