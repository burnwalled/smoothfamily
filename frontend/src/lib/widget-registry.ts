import type { ComponentType } from "react";

import UpcomingEventsWidget from "@/components/widgets/UpcomingEventsWidget";

export type WidgetDefinition = {
  type: string;
  defaultSize: "small" | "medium" | "large" | "full";
  allowedSizes: Array<"small" | "medium" | "large" | "full">;
  requiredFeatures: string[];
  component: ComponentType;
};

export const widgetRegistry: Record<string, WidgetDefinition> = {
  calendar_upcoming: {
    type: "calendar_upcoming",
    defaultSize: "large",
    allowedSizes: ["medium", "large", "full"],
    requiredFeatures: ["calendar"],
    component: UpcomingEventsWidget,
  },
};
