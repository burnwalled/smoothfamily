from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import AuthContext, get_current_context
from app.core.database import get_db
from app.dashboard.schemas import (
    DashboardAvailableWidgetResponse,
    DashboardLayoutResponse,
    DashboardLayoutUpdateRequest,
    DashboardWidgetLayoutResponse,
)
from app.dashboard.service import (
    get_widget_definitions,
    list_or_create_dashboard_layout,
    reset_dashboard_layout,
    update_dashboard_layout,
)
from app.families.models import Family, UserFamilyMembership

router = APIRouter()


async def _get_family_or_403(
    db: AsyncSession,
    *,
    family_id: UUID,
    user_id: UUID,
) -> Family:
    family_result = await db.execute(select(Family).where(Family.id == family_id))
    family = family_result.scalar_one_or_none()
    if family is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")

    membership_result = await db.execute(
        select(UserFamilyMembership).where(
            UserFamilyMembership.family_id == family.id,
            UserFamilyMembership.user_id == user_id,
        )
    )
    membership = membership_result.scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    return family


def _build_layout_response(
    *,
    family_id: UUID,
    user_id: UUID,
    widgets: list,
) -> DashboardLayoutResponse:
    ordered = sorted(widgets, key=lambda item: (item.position, item.created_at or datetime.now(tz=UTC)))
    updated_at_candidates = [widget.updated_at for widget in ordered if widget.updated_at is not None]
    updated_at = max(updated_at_candidates) if updated_at_candidates else None

    return DashboardLayoutResponse(
        family_id=family_id,
        user_id=user_id,
        updated_at=updated_at,
        widgets=[
            DashboardWidgetLayoutResponse(
                widget_type=widget.widget_type,
                size=widget.size,
                position=widget.position,
                is_visible=widget.is_visible,
            )
            for widget in ordered
        ],
        available_widgets=[
            DashboardAvailableWidgetResponse(
                widget_type=definition.widget_type,
                default_size=definition.default_size,
                allowed_sizes=list(definition.allowed_sizes),
                required_features=list(definition.required_features),
            )
            for definition in get_widget_definitions()
        ],
    )


@router.get("/{family_id}/dashboard/layout", response_model=DashboardLayoutResponse)
async def get_dashboard_layout(
    family_id: UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> DashboardLayoutResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    family = await _get_family_or_403(db, family_id=family_id, user_id=ctx.user_id)
    layout_rows = await list_or_create_dashboard_layout(db, family=family, user_id=ctx.user_id)
    return _build_layout_response(family_id=family.id, user_id=ctx.user_id, widgets=layout_rows)


@router.put("/{family_id}/dashboard/layout", response_model=DashboardLayoutResponse)
async def put_dashboard_layout(
    family_id: UUID,
    body: DashboardLayoutUpdateRequest,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> DashboardLayoutResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    family = await _get_family_or_403(db, family_id=family_id, user_id=ctx.user_id)
    rows = await update_dashboard_layout(
        db,
        family=family,
        user_id=ctx.user_id,
        widgets=[
            {
                "widget_type": widget.widget_type,
                "size": widget.size,
                "position": widget.position,
                "is_visible": widget.is_visible,
            }
            for widget in body.widgets
        ],
    )
    return _build_layout_response(family_id=family.id, user_id=ctx.user_id, widgets=rows)


@router.post("/{family_id}/dashboard/layout/reset", response_model=DashboardLayoutResponse)
async def post_reset_dashboard_layout(
    family_id: UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> DashboardLayoutResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    family = await _get_family_or_403(db, family_id=family_id, user_id=ctx.user_id)
    rows = await reset_dashboard_layout(db, family_id=family.id, user_id=ctx.user_id)
    return _build_layout_response(family_id=family.id, user_id=ctx.user_id, widgets=rows)
