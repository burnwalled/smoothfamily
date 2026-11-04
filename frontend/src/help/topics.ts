// The help centre's topics (3.0.2): where each belongs, who sees it, which app it is about (the "?"
// on that app's page leads here) and what it relates to. The texts are in help/<locale>.ts.
import {
  Baby, BookOpen, Bot, CalendarDays, Car, CircleUserRound, CloudOff, CookingPot, DatabaseBackup, FileText, Gift, HeartHandshake,
  House, KeyRound, Lightbulb, ListChecks, Luggage, LucideIcon, MessageCircle, Monitor, Network, PawPrint, PiggyBank, Pill, Plug,
  Receipt, Refrigerator, RefreshCw, Rocket, Search, Server, Settings, ShieldCheck, ShoppingCart, Star, Sun, Trophy, Users, Vault, Wallet,
  Bell, Siren, Home, Inbox, MessageSquareWarning, HeartPulse, GraduationCap, PartyPopper,
} from "lucide-react";
import type { Audience, Category } from "./types";

export type Topic = {
  id: string;
  category: Category;
  icon: LucideIcon;
  audience: Audience;
  // Shown to those who may use one of these apps (none: everyone in the audience).
  apps?: string[];
  // The pages this topic is the help for (the "?" next to their title), and where "Open" goes.
  paths?: string[];
  related?: string[];
};

export const CATEGORIES: { id: Category; icon: LucideIcon }[] = [
  { id: "start", icon: Rocket },
  { id: "everyday", icon: CalendarDays },
  { id: "food", icon: CookingPot },
  { id: "children", icon: Star },
  { id: "vault", icon: Vault },
  { id: "home", icon: House },
  { id: "smarthome", icon: Lightbulb },
  { id: "ai", icon: Bot },
  { id: "family", icon: Settings },
  { id: "server", icon: Server },
];

export const TOPICS: Topic[] = [
  // Getting started
  { id: "start", category: "start", icon: Rocket, audience: "everyone", related: ["signin", "notifications", "offline"] },
  { id: "signin", category: "start", icon: KeyRound, audience: "everyone", paths: ["/profile"], related: ["start"] },
  { id: "notifications", category: "start", icon: Bell, audience: "everyone", paths: ["/notifications"], related: ["today"] },
  { id: "offline", category: "start", icon: CloudOff, audience: "everyone", related: ["lists", "tasks"] },
  // Everyday
  { id: "today", category: "everyday", icon: Sun, audience: "everyone", paths: ["/"], related: ["notifications", "kiosk"] },
  { id: "calendar", category: "everyday", icon: CalendarDays, audience: "everyone", apps: ["calendar"], paths: ["/calendar"], related: ["trips", "twohomes", "week"] },
  { id: "trips", category: "everyday", icon: Luggage, audience: "everyone", apps: ["trips"], paths: ["/trips"], related: ["calendar", "tasks"] },
  { id: "parties", category: "everyday", icon: PartyPopper, audience: "adults", apps: ["calendar"], paths: ["/parties"], related: ["wishes", "calendar"] },
  { id: "school", category: "children", icon: GraduationCap, audience: "everyone", apps: ["calendar"], related: ["calendar", "smarthome"] },
  { id: "health", category: "everyday", icon: HeartPulse, audience: "everyone", apps: ["health"], paths: ["/health"], related: ["safety"] },
  { id: "twohomes", category: "everyday", icon: Home, audience: "adults", apps: ["calendar"], paths: ["/calendar/custody", "/coparent"], related: ["calendar", "receipts"] },
  { id: "week", category: "everyday", icon: HeartHandshake, audience: "everyone", apps: ["week"], paths: ["/week"], related: ["tasks", "calendar"] },
  { id: "chat", category: "everyday", icon: MessageCircle, audience: "everyone", apps: ["chat"], paths: ["/chat"] },
  { id: "lists", category: "everyday", icon: ListChecks, audience: "everyone", apps: ["lists"], paths: ["/lists"], related: ["wishes", "halists"] },
  { id: "wishes", category: "everyday", icon: Gift, audience: "everyone", apps: ["lists", "birthdays"], paths: ["/birthdays"], related: ["lists"] },
  // Food
  { id: "food", category: "food", icon: CookingPot, audience: "everyone", apps: ["food"], paths: ["/food"], related: ["recipebook", "pantry", "localai"] },
  { id: "recipebook", category: "food", icon: BookOpen, audience: "everyone", apps: ["food"], paths: ["/recipes"], related: ["food", "pantry", "websearch"] },
  { id: "pantry", category: "food", icon: Refrigerator, audience: "everyone", apps: ["pantry"], paths: ["/pantry"], related: ["food", "receipts"] },
  // Points and children
  { id: "tasks", category: "children", icon: Star, audience: "everyone", apps: ["tasks"], paths: ["/tasks"], related: ["allowance", "littleones", "safety"] },
  { id: "allowance", category: "children", icon: PiggyBank, audience: "everyone", apps: ["allowance"], paths: ["/allowance"], related: ["tasks", "shop"] },
  { id: "shop", category: "children", icon: Trophy, audience: "everyone", apps: ["shop", "achievements"], paths: ["/shop", "/achievements"], related: ["tasks", "allowance"] },
  { id: "littleones", category: "children", icon: Baby, audience: "adults", apps: ["tasks"], paths: ["/tasks/little"], related: ["tasks", "kiosk"] },
  // Vault and safety
  { id: "vault", category: "vault", icon: Vault, audience: "everyone", apps: ["photos"], paths: ["/vault"], related: ["documents", "passwords", "receipts"] },
  { id: "documents", category: "vault", icon: FileText, audience: "adults", apps: ["documents"], paths: ["/documents"], related: ["vault"] },
  { id: "passwords", category: "vault", icon: KeyRound, audience: "everyone", apps: ["photos"], related: ["vault"] },
  { id: "receipts", category: "vault", icon: Receipt, audience: "adults", apps: ["photos"], paths: ["/vault/receive"], related: ["economy", "localai"] },
  { id: "safety", category: "vault", icon: Siren, audience: "everyone", apps: ["emergency", "medicine"], paths: ["/emergency", "/medicine"], related: ["tasks"] },
  // Home
  { id: "property", category: "home", icon: House, audience: "adults", apps: ["property"], paths: ["/property"], related: ["economy", "receipts", "homeassistant"] },
  { id: "economy", category: "home", icon: Wallet, audience: "adults", apps: ["property"], paths: ["/economy", "/bank-import", "/subscriptions"], related: ["receipts", "property"] },
  { id: "vehicles", category: "home", icon: Car, audience: "adults", apps: ["vehicles"], paths: ["/vehicles"], related: ["economy", "localai"] },
  { id: "pets", category: "home", icon: PawPrint, audience: "everyone", apps: ["pets"], paths: ["/pets"], related: ["tasks", "safety"] },
  // Smart home and Home Assistant
  { id: "smarthome", category: "smarthome", icon: Lightbulb, audience: "everyone", apps: ["smarthome"], paths: ["/smarthome"], related: ["homeassistant", "gateway"] },
  { id: "homeassistant", category: "smarthome", icon: Plug, audience: "family", apps: ["smarthome"], paths: ["/settings/smarthome"], related: ["gateway", "smarthome", "halists"] },
  { id: "gateway", category: "smarthome", icon: Network, audience: "family", apps: ["smarthome"], related: ["homeassistant", "serverupdates"] },
  { id: "halists", category: "smarthome", icon: ShoppingCart, audience: "everyone", apps: ["lists"], related: ["lists", "homeassistant"] },
  { id: "kiosk", category: "smarthome", icon: Monitor, audience: "family", paths: ["/settings/kiosk"], related: ["today", "littleones"] },
  // Local AI and search
  { id: "localai", category: "ai", icon: Bot, audience: "adults", paths: ["/ai"], related: ["receipts", "food", "serverservices"] },
  { id: "websearch", category: "ai", icon: Search, audience: "everyone", related: ["wishes", "recipebook"] },
  // Family settings
  { id: "family", category: "family", icon: Users, audience: "family", paths: ["/settings", "/settings/members", "/settings/everyday", "/settings/sharing"], related: ["familydata", "start"] },
  { id: "familydata", category: "family", icon: ShieldCheck, audience: "family", paths: ["/settings/security-data"], related: ["serverbackups"] },
  { id: "profile", category: "family", icon: CircleUserRound, audience: "everyone", related: ["signin", "notifications"] },
  { id: "devices", category: "family", icon: Network, audience: "family", paths: ["/settings/devices"], related: ["kiosk", "gateway", "serverdevices"] },
  { id: "feedback", category: "family", icon: MessageSquareWarning, audience: "everyone", paths: ["/feedback"], related: ["profile", "serverreports"] },
  // Server
  { id: "server", category: "server", icon: Server, audience: "server", paths: ["/server"], related: ["serverbackups", "serverupdates", "serverservices", "serverdevices", "serverreports"] },
  { id: "serverbackups", category: "server", icon: DatabaseBackup, audience: "server", related: ["server", "familydata"] },
  { id: "serverupdates", category: "server", icon: RefreshCw, audience: "server", related: ["gateway", "server"] },
  { id: "serverservices", category: "server", icon: Pill, audience: "server", related: ["localai", "websearch"] },
  { id: "serverdevices", category: "server", icon: Network, audience: "server", related: ["devices", "serverupdates", "gateway"] },
  { id: "serverreports", category: "server", icon: Inbox, audience: "server", related: ["feedback", "server"] },
];

export function topic(id: string): Topic | undefined {
  return TOPICS.find((t) => t.id === id);
}

/** The topic that helps with a page (the most specific path wins). */
export function topicForPath(pathname: string): Topic | undefined {
  let best: { t: Topic; len: number } | undefined;
  for (const t of TOPICS) {
    for (const p of t.paths ?? []) {
      const hit = p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`);
      if (hit && (!best || p.length > best.len)) best = { t, len: p.length };
    }
  }
  return best?.t;
}

/** Whether a member sees a topic: their role, and an app it is about. */
export function visibleTo(t: Topic, me: { role: string; apps: string[]; can_manage_family?: boolean; is_server_admin?: boolean }): boolean {
  const adult = me.role === "admin" || me.role === "adult";
  const family = me.role === "admin" || !!me.can_manage_family;
  const audienceOk = t.audience === "everyone" || (t.audience === "adults" && adult) || (t.audience === "family" && family) || (t.audience === "server" && !!me.is_server_admin);
  return audienceOk && (!t.apps || t.apps.some((a) => me.apps.includes(a)));
}
