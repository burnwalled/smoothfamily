export type DashboardWidgetSize = "small" | "medium" | "large" | "full";

export type DashboardWidgetLayout = {
  widget_type: string;
  size: DashboardWidgetSize;
  position: number;
  is_visible: boolean;
};

type DashboardWidgetUpdate = {
  widget_type: string;
  size: DashboardWidgetSize;
  position: number;
  is_visible: boolean;
};

function sortByPosition(
  widgets: DashboardWidgetLayout[],
): DashboardWidgetLayout[] {
  return [...widgets].sort((left, right) => left.position - right.position);
}

function normalizePositions(
  widgets: DashboardWidgetLayout[],
): DashboardWidgetLayout[] {
  return widgets.map((widget, index) => ({
    ...widget,
    position: index,
  }));
}

function arrayMove<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function reorderVisibleWidgets(
  widgets: DashboardWidgetLayout[],
  activeType: string,
  overType: string,
): DashboardWidgetLayout[] {
  const ordered = sortByPosition(widgets);
  const visible = ordered.filter((widget) => widget.is_visible);
  const hidden = ordered.filter((widget) => !widget.is_visible);
  const fromIndex = visible.findIndex(
    (widget) => widget.widget_type === activeType,
  );
  const toIndex = visible.findIndex(
    (widget) => widget.widget_type === overType,
  );

  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return ordered;
  }

  return normalizePositions([
    ...arrayMove(visible, fromIndex, toIndex),
    ...hidden,
  ]);
}

export function toggleWidgetVisibility(
  widgets: DashboardWidgetLayout[],
  widgetType: string,
  isVisible: boolean,
): DashboardWidgetLayout[] {
  const ordered = sortByPosition(widgets).map((widget) =>
    widget.widget_type === widgetType
      ? { ...widget, is_visible: isVisible }
      : widget,
  );

  const visible = ordered.filter((widget) => widget.is_visible);
  const hidden = ordered.filter((widget) => !widget.is_visible);
  return normalizePositions([...visible, ...hidden]);
}

export function resizeWidget(
  widgets: DashboardWidgetLayout[],
  widgetType: string,
  size: DashboardWidgetSize,
): DashboardWidgetLayout[] {
  return sortByPosition(widgets).map((widget) =>
    widget.widget_type === widgetType ? { ...widget, size } : widget,
  );
}

export function toLayoutUpdatePayload(
  widgets: DashboardWidgetLayout[],
): DashboardWidgetUpdate[] {
  return normalizePositions(sortByPosition(widgets)).map((widget) => ({
    widget_type: widget.widget_type,
    size: widget.size,
    position: widget.position,
    is_visible: widget.is_visible,
  }));
}
