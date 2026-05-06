from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dashboard.models import DashboardWidgetLayout
from app.families.models import Family


@dataclass(frozen=True)
class DashboardWidgetDefinition:
    widget_type: str
    default_size: str
    allowed_sizes: tuple[str, ...]
    required_features: tuple[str, ...]
    default_visible: bool = True


_WIDGET_DEFINITIONS: tuple[DashboardWidgetDefinition, ...] = (
    DashboardWidgetDefinition(
        widget_type="calendar_upcoming",
        default_size="large",
        allowed_sizes=("medium", "large", "full"),
        required_features=("calendar",),
    ),
    DashboardWidgetDefinition(
        widget_type="chat_unread",
        default_size="large",
        allowed_sizes=("medium", "large", "full"),
        required_features=("chat",),
    ),
    DashboardWidgetDefinition(
        widget_type="lists_open",
        default_size="large",
        allowed_sizes=("medium", "large", "full"),
        required_features=("lists",),
    ),
    DashboardWidgetDefinition(
        widget_type="family_pending",
        default_size="large",
        allowed_sizes=("medium", "large", "full"),
        required_features=("family",),
    ),
)

_WIDGETS_BY_TYPE = {definition.widget_type: definition for definition in _WIDGET_DEFINITIONS}


def get_widget_definitions() -> tuple[DashboardWidgetDefinition, ...]:
    return _WIDGET_DEFINITIONS


def _validate_widget_update(widget_type: str, size: str) -> DashboardWidgetDefinition:
    definition = _WIDGETS_BY_TYPE.get(widget_type)
    if definition is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Unknown widget type: {widget_type}",
        )
    if size not in definition.allowed_sizes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Widget size '{size}' is not allowed for {widget_type}",
        )
    return definition


def validate_layout_payload(widgets: list[dict[str, object]]) -> None:
    seen_types: set[str] = set()
    for widget in widgets:
        widget_type = str(widget.get("widget_type", "")).strip()
        size = str(widget.get("size", "")).strip()
        _validate_widget_update(widget_type, size)
        if widget_type in seen_types:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Duplicate widget in payload: {widget_type}",
            )
        seen_types.add(widget_type)


async def _create_default_layout(
    db: AsyncSession,
    *,
    family_id: UUID,
    user_id: UUID,
) -> list[DashboardWidgetLayout]:
    rows: list[DashboardWidgetLayout] = []
    for position, definition in enumerate(_WIDGET_DEFINITIONS):
        row = DashboardWidgetLayout(
            family_id=family_id,
            user_id=user_id,
            widget_type=definition.widget_type,
            size=definition.default_size,
            position=position,
            is_visible=definition.default_visible,
        )
        db.add(row)
        rows.append(row)
    await db.flush()
    return rows


async def list_or_create_dashboard_layout(
    db: AsyncSession,
    *,
    family: Family,
    user_id: UUID,
) -> list[DashboardWidgetLayout]:
    result = await db.execute(
        select(DashboardWidgetLayout)
        .where(
            DashboardWidgetLayout.family_id == family.id,
            DashboardWidgetLayout.user_id == user_id,
        )
        .order_by(DashboardWidgetLayout.position.asc(), DashboardWidgetLayout.created_at.asc())
    )
    rows = list(result.scalars().all())
    if not rows:
        return await _create_default_layout(db, family_id=family.id, user_id=user_id)

    existing_by_type = {row.widget_type: row for row in rows}
    changed = False

    # Keep older data forward-compatible by auto-adding new widgets.
    for definition in _WIDGET_DEFINITIONS:
        if definition.widget_type in existing_by_type:
            continue
        new_row = DashboardWidgetLayout(
            family_id=family.id,
            user_id=user_id,
            widget_type=definition.widget_type,
            size=definition.default_size,
            position=len(rows),
            is_visible=False,
        )
        db.add(new_row)
        rows.append(new_row)
        changed = True

    # Normalize invalid sizes and positions from legacy/invalid state.
    rows.sort(key=lambda row: (row.position, row.created_at or datetime.now(tz=UTC)))
    for idx, row in enumerate(rows):
        definition = _WIDGETS_BY_TYPE.get(row.widget_type)
        if definition is None:
            continue
        if row.size not in definition.allowed_sizes:
            row.size = definition.default_size
            changed = True
        if row.position != idx:
            row.position = idx
            changed = True

    if changed:
        await db.flush()

    return rows


async def update_dashboard_layout(
    db: AsyncSession,
    *,
    family: Family,
    user_id: UUID,
    widgets: list[dict[str, object]],
) -> list[DashboardWidgetLayout]:
    validate_layout_payload(widgets)
    rows = await list_or_create_dashboard_layout(db, family=family, user_id=user_id)
    rows_by_type = {row.widget_type: row for row in rows}

    seen_types: set[str] = set()
    for index, widget in enumerate(widgets):
        widget_type = str(widget.get("widget_type", "")).strip()
        size = str(widget.get("size", "")).strip()
        is_visible = bool(widget.get("is_visible", True))
        definition = _validate_widget_update(widget_type, size)
        seen_types.add(widget_type)

        row = rows_by_type.get(widget_type)
        if row is None:
            row = DashboardWidgetLayout(
                family_id=family.id,
                user_id=user_id,
                widget_type=widget_type,
                size=definition.default_size,
                position=index,
                is_visible=is_visible,
            )
            db.add(row)
            rows_by_type[widget_type] = row
            rows.append(row)

        row.size = size
        row.position = index
        row.is_visible = is_visible

    # Keep unspecified widgets persisted but hidden at the end.
    trailing_position = len(widgets)
    for definition in _WIDGET_DEFINITIONS:
        if definition.widget_type in seen_types:
            continue
        row = rows_by_type.get(definition.widget_type)
        if row is None:
            row = DashboardWidgetLayout(
                family_id=family.id,
                user_id=user_id,
                widget_type=definition.widget_type,
                size=definition.default_size,
                position=trailing_position,
                is_visible=False,
            )
            db.add(row)
            rows_by_type[definition.widget_type] = row
            rows.append(row)
        else:
            row.position = trailing_position
            row.is_visible = False
            if row.size not in definition.allowed_sizes:
                row.size = definition.default_size
        trailing_position += 1

    await db.flush()
    rows.sort(key=lambda row: (row.position, row.created_at or datetime.now(tz=UTC)))
    return rows


async def reset_dashboard_layout(
    db: AsyncSession,
    *,
    family_id: UUID,
    user_id: UUID,
) -> list[DashboardWidgetLayout]:
    result = await db.execute(
        select(DashboardWidgetLayout).where(
            DashboardWidgetLayout.family_id == family_id,
            DashboardWidgetLayout.user_id == user_id,
        )
    )
    existing = list(result.scalars().all())
    for row in existing:
        await db.delete(row)
    await db.flush()
    return await _create_default_layout(db, family_id=family_id, user_id=user_id)
