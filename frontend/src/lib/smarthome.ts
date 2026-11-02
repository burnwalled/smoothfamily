// Shared Home Assistant domain metadata for the admin picker and the widget.
import {
  Blinds,
  Bot,
  Clapperboard,
  Fan,
  Lightbulb,
  LucideIcon,
  Plug,
  ScrollText,
  Speaker,
  Thermometer,
  Workflow,
} from "lucide-react";

export const SMART_DOMAINS = ["light", "switch", "fan", "cover", "climate", "vacuum", "scene", "script", "automation", "media_player"] as const;
export type SmartDomain = (typeof SMART_DOMAINS)[number];

export const DOMAIN_ICONS: Record<SmartDomain, LucideIcon> = {
  light: Lightbulb,
  switch: Plug,
  fan: Fan,
  cover: Blinds,
  climate: Thermometer,
  vacuum: Bot,
  scene: Clapperboard,
  script: ScrollText,
  automation: Workflow,
  media_player: Speaker,
};

export function domainIcon(domain: string): LucideIcon {
  return DOMAIN_ICONS[domain as SmartDomain] ?? Plug;
}

/** Whether the device should be shown as "on"/highlighted. */
export function isActive(domain: string, state: string): boolean {
  if (domain === "cover") return state === "open" || state === "opening";
  if (domain === "vacuum") return state === "cleaning" || state === "returning";
  if (domain === "climate") return state !== "off" && state !== "unavailable" && state !== "unknown";
  if (domain === "media_player") return state === "playing";
  return state === "on";
}
