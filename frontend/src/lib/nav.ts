import {
  CalendarDays,
  Car,
  FileText,
  Gift,
  HeartHandshake,
  HeartPulse,
  PawPrint,
  Pill,
  Siren,
  House,
  Lightbulb,
  ListChecks,
  Luggage,
  LucideIcon,
  MessageCircle,
  PiggyBank,
  Refrigerator,
  Star,
  Store,
  Sun,
  Trophy,
  UtensilsCrossed,
  Users,
  Vault,
} from "lucide-react";
import type { TranslationKey } from "@/lib/i18n";
import type { WidgetType } from "@/lib/api";

export type NavGroupKey = "family" | "points" | "home";
export type NavItem = { key: string; href: string; labelKey: TranslationKey; icon: LucideIcon; group?: NavGroupKey };
export type NavGroup = { key: NavGroupKey; labelKey: TranslationKey; icon: LucideIcon; items: NavItem[] };

/** Every app's page (what the family admin turns on per member; icons for the page titles). */
export const APP_PAGES: NavItem[] = [
  { key: "calendar", href: "/calendar", labelKey: "nav.calendar", icon: CalendarDays },
  { key: "chat", href: "/chat", labelKey: "nav.chat", icon: MessageCircle },
  { key: "lists", href: "/lists", labelKey: "nav.lists", icon: ListChecks },
  { key: "food", href: "/food", labelKey: "nav.food", icon: UtensilsCrossed },
  { key: "pantry", href: "/pantry", labelKey: "nav.pantry", icon: Refrigerator },
  { key: "photos", href: "/vault", labelKey: "nav.vault", icon: Vault },
  { key: "birthdays", href: "/birthdays", labelKey: "nav.birthdays", icon: Gift },
  { key: "medicine", href: "/medicine", labelKey: "nav.medicine", icon: Pill },
  { key: "week", href: "/week", labelKey: "nav.week", icon: HeartHandshake },
  { key: "emergency", href: "/emergency", labelKey: "nav.emergency", icon: Siren },
  { key: "trips", href: "/trips", labelKey: "nav.trips", icon: Luggage },
  { key: "documents", href: "/documents", labelKey: "nav.documents", icon: FileText },
  { key: "tasks", href: "/tasks", labelKey: "nav.tasks", icon: Star },
  { key: "allowance", href: "/allowance", labelKey: "nav.allowance", icon: PiggyBank },
  { key: "achievements", href: "/achievements", labelKey: "nav.achievements", icon: Trophy },
  { key: "shop", href: "/shop", labelKey: "nav.shop", icon: Store },
  { key: "property", href: "/property", labelKey: "nav.property", icon: House },
  { key: "vehicles", href: "/vehicles", labelKey: "nav.vehicles", icon: Car },
  { key: "smarthome", href: "/smarthome", labelKey: "nav.smarthome", icon: Lightbulb },
  { key: "pets", href: "/pets", labelKey: "nav.pets", icon: PawPrint },
  { key: "health", href: "/health", labelKey: "nav.health", icon: HeartPulse },
];

/** A tab inside one of the menu's apps: a page and the app (permission) it needs. */
// hidden: part of the hub (its permission and old saved menus) but not a tab of its own.
export type HubTab = { app: string; href: string; labelKey: TranslationKey; hidden?: boolean };
export type Hub = NavItem & { tabs: HubTab[] };

// The menu (2.8.0): ten apps instead of twenty – the pages that belong together are tabs of one.
// 2.9.0: no Safety any more – the emergency cards and the medicines are set up in the family's
// settings and your own in the profile; a child's and a pet's doses are tasks.
// A hub's key is one of its apps' keys, so the members' saved menu order still works.
export const HUBS: Hub[] = [
  { key: "today", href: "/", labelKey: "nav.today", icon: Sun, tabs: [] },
  {
    key: "calendar", href: "/calendar", labelKey: "nav.calendar", icon: CalendarDays,
    tabs: [
      { app: "calendar", href: "/calendar", labelKey: "nav.calendar" },
      { app: "birthdays", href: "/birthdays", labelKey: "nav.birthdays", hidden: true },
      { app: "trips", href: "/trips", labelKey: "nav.trips" },
      { app: "calendar", href: "/calendar/custody", labelKey: "custody.title" },
      { app: "week", href: "/week", labelKey: "nav.week" },
    ],
  },
  { key: "chat", href: "/chat", labelKey: "nav.chat", icon: MessageCircle, tabs: [{ app: "chat", href: "/chat", labelKey: "nav.chat" }] },
  { key: "lists", href: "/lists", labelKey: "nav.lists", icon: ListChecks, tabs: [{ app: "lists", href: "/lists", labelKey: "nav.lists" }] },
  {
    key: "food", href: "/food", labelKey: "nav.food", icon: UtensilsCrossed,
    tabs: [
      { app: "food", href: "/food", labelKey: "nav.food" },
      { app: "food", href: "/recipes", labelKey: "nav.recipes" },
      { app: "pantry", href: "/pantry", labelKey: "nav.pantry" },
    ],
  },
  {
    key: "tasks", href: "/tasks", labelKey: "nav.hub.points", icon: Star,
    tabs: [
      { app: "tasks", href: "/tasks", labelKey: "nav.tasks" },
      { app: "allowance", href: "/allowance", labelKey: "nav.allowance" },
      { app: "achievements", href: "/achievements", labelKey: "nav.achievements" },
      { app: "shop", href: "/shop", labelKey: "nav.shop" },
    ],
  },
  {
    key: "photos", href: "/vault", labelKey: "nav.vault", icon: Vault,
    tabs: [
      { app: "photos", href: "/vault", labelKey: "nav.vault" },
      // A view inside the vault.
      { app: "documents", href: "/documents", labelKey: "nav.documents", hidden: true },
    ],
  },
  {
    key: "property", href: "/property", labelKey: "nav.hub.home", icon: House,
    tabs: [
      { app: "property", href: "/property", labelKey: "nav.property" },
      { app: "property", href: "/economy", labelKey: "nav.economy" },
      { app: "vehicles", href: "/vehicles", labelKey: "nav.vehicles" },
      { app: "pets", href: "/pets", labelKey: "nav.pets" },
    ],
  },
  { key: "smarthome", href: "/smarthome", labelKey: "nav.smarthome", icon: Lightbulb, tabs: [{ app: "smarthome", href: "/smarthome", labelKey: "nav.smarthome" }] },
  // 3.4.0: each person's workouts and the day's numbers.
  { key: "health", href: "/health", labelKey: "nav.health", icon: HeartPulse, tabs: [{ app: "health", href: "/health", labelKey: "nav.health" }] },
];

// The menu's items (also what the profile's menu settings order and hide).
export const NAV: NavItem[] = HUBS;

// A saved menu from before 2.8.0 names the old apps: each counts as the hub it is now part of.
const OLD_TO_HUB: Record<string, string> = Object.fromEntries(HUBS.flatMap((h) => h.tabs.map((tab) => [tab.app, h.key])));

/** The tabs of a hub the member may open. */
export function hubTabs(hub: Hub, apps: string[]): HubTab[] {
  return hub.tabs.filter((tab) => apps.includes(tab.app));
}

/** The hub a page belongs to ("/birthdays" → the calendar), or null. */
export function hubForPath(pathname: string): Hub | null {
  let best: { hub: Hub; length: number } | null = null;
  for (const hub of HUBS) {
    for (const tab of hub.tabs) {
      if ((pathname === tab.href || pathname.startsWith(`${tab.href}/`)) && (!best || tab.href.length > best.length)) best = { hub, length: tab.href.length };
    }
  }
  return best?.hub ?? null;
}

// No groups any more: ten apps fit in one menu.
export const NAV_GROUPS: { key: NavGroupKey; labelKey: TranslationKey; icon: LucideIcon }[] = [];

// Today widgets that belong to an app; they disappear for members without it.
// The app a Today card needs (any of them, for a card from several apps).
export const WIDGET_APP: Partial<Record<WidgetType, string | string[]>> = {
  calendar_today: "calendar",
  tasks_today: "tasks",
  leaderboard: "tasks",
  shopping_list: "lists",
  smart_home: "smarthome",
  chat_unread: "chat",
  memories: "photos",
  pantry_soon: "pantry",
  upcoming: ["vehicles", "property"],
  custody: "calendar",
};

export function widgetAllowed(type: WidgetType, apps: string[]): boolean {
  const app = WIDGET_APP[type];
  return !app || (Array.isArray(app) ? app.some((a) => apps.includes(a)) : apps.includes(app));
}

/** All sections in the user's order; sections missing from it (e.g. new ones) follow in default order. */
export function orderedNav(order: string[] | undefined): NavItem[] {
  const keys = [...new Set((order ?? []).map((k) => OLD_TO_HUB[k] ?? k))];
  const rank = (item: NavItem) => {
    const i = keys.indexOf(item.key);
    return i >= 0 ? i : keys.length + NAV.indexOf(item);
  };
  return [...NAV].sort((a, b) => rank(a) - rank(b));
}

/** The sections the user sees, in their order: allowed by the family admin and not hidden. */
export function visibleNav(order: string[] | undefined, hidden: string[] | undefined, apps: string[]): NavItem[] {
  const hide = new Set(hidden ?? []);
  // A hub shows when the member has any of its apps, and opens on the first of them.
  return orderedNav(order)
    .map((item) => {
      const tabs = hubTabs(item as Hub, apps);
      return item.key === "today" ? item : tabs.length && !hide.has(item.key) ? { ...item, href: tabs[0].href } : null;
    })
    .filter((item): item is NavItem => item !== null);
}

/** The member may use a hub: they have at least one of its apps. */
export function hubAllowed(key: string, apps: string[]): boolean {
  const hub = HUBS.find((h) => h.key === key);
  return key === "today" || (!!hub && hubTabs(hub, apps).length > 0);
}

/** The visible sections grouped; groups without any visible section are left out. */
export function groupNav(items: NavItem[]): NavGroup[] {
  return NAV_GROUPS.map((g) => ({ ...g, items: items.filter((item) => item.group === g.key) })).filter((g) => g.items.length > 0);
}

/** The app a path belongs to ("/vehicles/..." → vehicles); null for Today, Profile, Help etc. */
export function appForPath(pathname: string): string | null {
  const item = APP_PAGES.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  return item ? item.key : null;
}

// Phones with an ungrouped menu: the first sections are in the bottom bar, the rest under "More".
export const MOBILE_PRIMARY = 4;

// The member's own menu settings (saved on their profile).
export type NavPrefs = { nav_order: string[]; nav_hidden: string[]; nav_group_mobile: boolean; nav_group_desktop: boolean };

// Fired after the user saves their menu so the shell updates without a reload.
export const NAV_CHANGED_EVENT = "sf:nav-changed";
