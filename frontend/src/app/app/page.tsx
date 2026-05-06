"use client";

import { useAuth } from "@clerk/nextjs";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import {
  reorderVisibleWidgets,
  resizeWidget,
  toLayoutUpdatePayload,
  toggleWidgetVisibility,
  type DashboardWidgetLayout,
  type DashboardWidgetSize,
} from "@/lib/dashboard-layout";
import { widgetRegistry } from "@/lib/widget-registry";

type FamilyOverview = {
  family_id: string;
};

type AvailableWidget = {
  widget_type: string;
  default_size: DashboardWidgetSize;
  allowed_sizes: DashboardWidgetSize[];
  required_features: string[];
};

type DashboardLayoutResponse = {
  family_id: string;
  user_id: string;
  updated_at: string | null;
  widgets: DashboardWidgetLayout[];
  available_widgets: AvailableWidget[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function resolveApiUrl(rawValue: string | undefined): string | undefined {
  if (!rawValue) {
    return undefined;
  }

  try {
    const parsed = new URL(rawValue);
    if (parsed.hostname === "localhost") {
      parsed.hostname = "127.0.0.1";
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return rawValue;
  }
}

function sizeClass(size: DashboardWidgetSize): string {
  if (size === "full") {
    return "lg:col-span-3";
  }
  if (size === "large") {
    return "lg:col-span-2";
  }
  return "lg:col-span-1";
}

function SortableWidgetCard({
  widget,
  allowedSizes,
  onResize,
  onHide,
}: {
  widget: DashboardWidgetLayout;
  allowedSizes: DashboardWidgetSize[];
  onResize: (widgetType: string, size: DashboardWidgetSize) => void;
  onHide: (widgetType: string) => void;
}) {
  const sortable = useSortable({ id: widget.widget_type });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  const widgetDefinition = widgetRegistry[widget.widget_type];
  const WidgetComponent = widgetDefinition?.component;

  return (
    <article
      ref={sortable.setNodeRef}
      style={style}
      className={`rounded-lg border p-2 ${sizeClass(widget.size)}`}
      {...sortable.attributes}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs"
          style={{ borderColor: "rgb(var(--color-border))" }}
          {...sortable.listeners}
        >
          Drag
        </button>

        <div className="flex items-center gap-2">
          <select
            value={widget.size}
            onChange={(event) =>
              onResize(widget.widget_type, event.target.value as DashboardWidgetSize)
            }
            className="rounded border px-2 py-1 text-xs"
            style={{ borderColor: "rgb(var(--color-border))" }}
          >
            {allowedSizes.map((allowedSize) => (
              <option key={allowedSize} value={allowedSize}>
                {allowedSize}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onHide(widget.widget_type)}
            className="rounded border px-2 py-1 text-xs"
            style={{ borderColor: "rgb(var(--color-border))" }}
          >
            Hide
          </button>
        </div>
      </div>

      {WidgetComponent ? (
        <WidgetComponent />
      ) : (
        <section className="portal-card">
          <p className="text-sm text-muted-foreground">Missing widget component.</p>
        </section>
      )}
    </article>
  );
}

export default function DashboardPage() {
  const t = useTranslations();
  const { isSignedIn, getToken } = useAuth();
  const apiUrl = useMemo(() => resolveApiUrl(API_URL), []);

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [widgets, setWidgets] = useState<DashboardWidgetLayout[]>([]);
  const [availableWidgets, setAvailableWidgets] = useState<AvailableWidget[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const visibleWidgets = useMemo(
    () => widgets.filter((widget) => widget.is_visible).sort((a, b) => a.position - b.position),
    [widgets],
  );

  const hiddenWidgets = useMemo(
    () => widgets.filter((widget) => !widget.is_visible).sort((a, b) => a.position - b.position),
    [widgets],
  );

  async function persistLayout(nextWidgets: DashboardWidgetLayout[]): Promise<void> {
    if (!apiUrl || !familyId) {
      return;
    }

    setWidgets(nextWidgets);
    setSaving(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        setError(t("settings.errors.auth"));
        return;
      }

      const response = await fetch(`${apiUrl}/api/v1/families/${familyId}/dashboard/layout`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ widgets: toLayoutUpdatePayload(nextWidgets) }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { detail?: string };
        setError(payload.detail ?? t("settings.errors.load"));
        return;
      }

      const payload = (await response.json()) as DashboardLayoutResponse;
      setWidgets(payload.widgets);
      setAvailableWidgets(payload.available_widgets);
    } catch {
      setError(t("settings.errors.network"));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    async function loadDashboardLayout() {
      if (!apiUrl) {
        setError("NEXT_PUBLIC_API_URL is not configured.");
        setLoading(false);
        return;
      }
      if (!isSignedIn) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const token = await getToken();
        if (!token) {
          setError(t("settings.errors.auth"));
          return;
        }

        const overviewResponse = await fetch(`${apiUrl}/api/v1/families/current/overview`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });
        if (!overviewResponse.ok) {
          setError(t("settings.errors.load"));
          return;
        }

        const overview = (await overviewResponse.json()) as FamilyOverview;
        setFamilyId(overview.family_id);

        const layoutResponse = await fetch(
          `${apiUrl}/api/v1/families/${overview.family_id}/dashboard/layout`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          },
        );

        if (!layoutResponse.ok) {
          setError(t("settings.errors.load"));
          return;
        }

        const payload = (await layoutResponse.json()) as DashboardLayoutResponse;
        setWidgets(payload.widgets);
        setAvailableWidgets(payload.available_widgets);
      } catch {
        setError(t("settings.errors.network"));
      } finally {
        setLoading(false);
      }
    }

    void loadDashboardLayout();
  }, [apiUrl, getToken, isSignedIn, t]);

  function onDragEnd(event: DragEndEvent): void {
    const activeId = String(event.active.id);
    const overId = String(event.over?.id ?? "");
    if (!overId || activeId === overId) {
      return;
    }
    void persistLayout(reorderVisibleWidgets(widgets, activeId, overId));
  }

  function onResize(widgetType: string, size: DashboardWidgetSize): void {
    void persistLayout(resizeWidget(widgets, widgetType, size));
  }

  function onHide(widgetType: string): void {
    void persistLayout(toggleWidgetVisibility(widgets, widgetType, false));
  }

  function onShow(widgetType: string): void {
    void persistLayout(toggleWidgetVisibility(widgets, widgetType, true));
  }

  async function onReset(): Promise<void> {
    if (!apiUrl || !familyId) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        setError(t("settings.errors.auth"));
        return;
      }

      const response = await fetch(
        `${apiUrl}/api/v1/families/${familyId}/dashboard/layout/reset`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!response.ok) {
        setError(t("settings.errors.load"));
        return;
      }

      const payload = (await response.json()) as DashboardLayoutResponse;
      setWidgets(payload.widgets);
      setAvailableWidgets(payload.available_widgets);
    } catch {
      setError(t("settings.errors.network"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 lg:space-y-5">
      <section className="portal-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("dashboard.greetingTitle")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("dashboard.greetingSubtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPicker((previous) => !previous)}
              className="rounded-md border px-3 py-2 text-sm font-medium"
              style={{ borderColor: "rgb(var(--color-border))" }}
            >
              {t("dashboard.addWidget")}
            </button>
            <button
              type="button"
              onClick={() => void onReset()}
              className="rounded-md border px-3 py-2 text-sm font-medium"
              style={{ borderColor: "rgb(var(--color-border))" }}
            >
              {t("dashboard.reset")}
            </button>
          </div>
        </div>
        {saving ? (
          <p className="mt-2 text-xs text-muted-foreground">{t("dashboard.savingLayout")}</p>
        ) : null}
        {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
      </section>

      {showPicker ? (
        <section className="portal-card space-y-2">
          <h2 className="text-base font-semibold">{t("dashboard.widgetPickerTitle")}</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {availableWidgets.map((entry) => {
              const isVisible = !hiddenWidgets.some(
                (widget) => widget.widget_type === entry.widget_type,
              );
              return (
                <div
                  key={entry.widget_type}
                  className="rounded border px-3 py-2"
                  style={{ borderColor: "rgb(var(--color-border))" }}
                >
                  <p className="text-sm font-medium">{entry.widget_type}</p>
                  <button
                    type="button"
                    onClick={() =>
                      isVisible
                        ? onHide(entry.widget_type)
                        : onShow(entry.widget_type)
                    }
                    className="mt-2 rounded border px-2 py-1 text-xs"
                    style={{ borderColor: "rgb(var(--color-border))" }}
                  >
                    {isVisible ? t("dashboard.hideWidget") : t("dashboard.showWidget")}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {loading ? (
        <section className="portal-card">
          <p className="text-sm text-muted-foreground">{t("settings.loading")}</p>
        </section>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={visibleWidgets.map((widget) => widget.widget_type)}
            strategy={verticalListSortingStrategy}
          >
            <section className="grid gap-3 lg:grid-cols-3">
              {visibleWidgets.map((widget) => {
                const available = availableWidgets.find(
                  (entry) => entry.widget_type === widget.widget_type,
                );
                const allowedSizes =
                  available?.allowed_sizes ??
                  widgetRegistry[widget.widget_type]?.allowedSizes ??
                  ["medium", "large"];
                return (
                  <SortableWidgetCard
                    key={widget.widget_type}
                    widget={widget}
                    allowedSizes={allowedSizes}
                    onResize={onResize}
                    onHide={onHide}
                  />
                );
              })}
            </section>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
