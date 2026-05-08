import { describe, expect, it } from "vitest";

import {
  reorderVisibleWidgets,
  resizeWidget,
  toLayoutUpdatePayload,
  toggleWidgetVisibility,
  type DashboardWidgetLayout,
} from "./dashboard-layout";

function sampleLayout(): DashboardWidgetLayout[] {
  return [
    {
      widget_type: "calendar_upcoming",
      size: "large",
      position: 0,
      is_visible: true,
    },
    {
      widget_type: "chat_unread",
      size: "large",
      position: 1,
      is_visible: true,
    },
    { widget_type: "lists_open", size: "large", position: 2, is_visible: true },
    {
      widget_type: "family_pending",
      size: "large",
      position: 3,
      is_visible: false,
    },
  ];
}

describe("dashboard-layout helpers", () => {
  it("reorders visible widgets and keeps hidden widgets at the end", () => {
    const next = reorderVisibleWidgets(
      sampleLayout(),
      "lists_open",
      "calendar_upcoming",
    );

    expect(next.map((widget) => widget.widget_type)).toEqual([
      "lists_open",
      "calendar_upcoming",
      "chat_unread",
      "family_pending",
    ]);
    expect(next[3]?.is_visible).toBe(false);
    expect(next.map((widget) => widget.position)).toEqual([0, 1, 2, 3]);
  });

  it("can hide and show a widget while normalizing order", () => {
    const hidden = toggleWidgetVisibility(sampleLayout(), "chat_unread", false);
    expect(
      hidden.find((widget) => widget.widget_type === "chat_unread")?.is_visible,
    ).toBe(false);
    expect(hidden.map((widget) => widget.position)).toEqual([0, 1, 2, 3]);

    const shown = toggleWidgetVisibility(hidden, "family_pending", true);
    expect(
      shown.find((widget) => widget.widget_type === "family_pending")
        ?.is_visible,
    ).toBe(true);
    expect(shown.map((widget) => widget.position)).toEqual([0, 1, 2, 3]);
  });

  it("updates widget size and preserves normalized payload shape", () => {
    const resized = resizeWidget(sampleLayout(), "calendar_upcoming", "full");
    expect(
      resized.find((widget) => widget.widget_type === "calendar_upcoming")
        ?.size,
    ).toBe("full");

    const payload = toLayoutUpdatePayload(resized);
    expect(payload[0]).toEqual({
      widget_type: "calendar_upcoming",
      size: "full",
      position: 0,
      is_visible: true,
    });
    expect(payload).toHaveLength(4);
  });
});
