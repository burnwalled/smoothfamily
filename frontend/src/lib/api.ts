// Thin fetch wrapper. All calls go through the Next rewrite /api -> backend,
// so the session cookie travels along automatically (same origin).

import { isPartyHelper } from "@/lib/partyHelper";
import { toLocalDateKey } from "@/lib/dateKey";
import { apiKey, clearQueryCache, queryClient, shouldRetry } from "@/lib/queryClient";
import { canQueue, enqueue, flush, hasPending } from "@/lib/outbox";

export class ApiError extends Error {
  status: number;
  // The fields the server didn't accept (422 from validation), e.g. ["username", "email"].
  fields: string[];
  constructor(status: number, message: string, fields: string[] = []) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

// The network call itself, without the cache. Query functions use this (calling `api.get` from
// inside a query would wait for itself).
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(isPartyHelper() ? { "X-Party-Helper": "1" } : {}), ...init?.headers },
    credentials: "same-origin",
  });
  if (!resp.ok) {
    let detail = resp.statusText;
    let fields: string[] = [];
    try {
      const body = await resp.json();
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail)) {
        // Validation errors: one per field, with where it is in "loc".
        fields = [...new Set<string>(body.detail.map((d: { loc?: unknown[] }) => String(d.loc?.[d.loc.length - 1] ?? "")).filter(Boolean))];
        if (fields.length) detail = `Check: ${fields.join(", ")}`;
      }
    } catch {}
    throw new ApiError(resp.status, detail, fields);
  }
  if (resp.status === 204) return undefined as T;
  return resp.json();
}

// Reads are cached by TanStack Query (lib/queryClient.ts); components read through `useApi`
// (lib/query.ts), which shows the cached answer at once and refreshes it (#76: no page keeps its own
// copy any more). `api.get` stays for one-off reads in event handlers.
// A write invalidates the resource it touched plus the ones it changes on the server, so their
// cached answers are not shown again until refreshed. Signing in or out clears everything.
// Server-side side effects: e.g. completing a task gives points (achievements, allowance, goals).
const RELATED: Record<string, string[]> = {
  tasks: ["achievements", "allowance", "rewards", "dashboard", "shop", "week", "pets"],
  lists: ["tasks", "achievements", "allowance", "rewards"],
  meals: ["lists", "week"],
  // Bought items move from a list into the pantry; the recipes know what is at home.
  pantry: ["lists", "meals"],
  // The simulated home moves people; who's home follows the smart home.
  smarthome: ["presence"],
  presence: ["smarthome"],
  // A routine in the little ones' mode is a task.
  easy: ["tasks"],
  // The household's economy counts the receipts (and the homes' and vehicles' costs).
  receipts: ["economy"],
  bank: ["economy", "receipts", "subscriptions"],
  // A receipt read by the local AI is told as a notification.
  notifications: ["receipts", "ai"],
  // The emergency cards list the medicines.
  medicine: ["emergency", "tasks"],
  family: ["auth", "tasks", "allowance", "chat", "lists", "smarthome"],
  rewards: ["achievements"],
  calendar: ["dashboard", "week"],
  home: ["property", "smarthome"],
  property: ["tasks", "economy"],
  vehicles: ["tasks", "economy"],
  albums: ["media", "vault"],
  media: ["albums", "vault"],
};
export function relatedResources(resource: string): string[] {
  return RELATED[resource] ?? [];
}

// Not tied to one resource (imports, integrations): everything is refreshed.
const INVALIDATE_ALL = new Set(["admin"]);
const SESSION_CHANGES = /^\/api\/auth\/(login|logout|setup|passkeys\/login)/;

export function clearApiCache() {
  clearQueryCache();
}

// Identical reads running at the same time (Shell and page) share one request.
function get<T>(path: string): Promise<T> {
  return queryClient.fetchQuery({ queryKey: apiKey(path), queryFn: () => request<T>(path), staleTime: 0, retry: shouldRetry });
}

async function write<T>(path: string, init: RequestInit): Promise<T> {
  // Lists and task completions also work offline (lib/outbox.ts): without a connection – or while
  // earlier offline changes still wait, so the order is kept – the write is queued and shown at once.
  const method = init.method ?? "GET";
  const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
  if (canQueue(method, path) && (hasPending() || (typeof navigator !== "undefined" && !navigator.onLine))) {
    const queued = (await enqueue(method, path, body)) as T;
    void flush();
    return queued;
  }
  let queued = false;
  try {
    return await request<T>(path, init);
  } catch (e) {
    // A network error (not an answer from the server): keep the change for later.
    if (!(e instanceof ApiError) && canQueue(method, path)) {
      queued = true;
      return (await enqueue(method, path, body)) as T;
    }
    throw e;
  } finally {
    // A queued change is already in the cache; refreshing it now would only fail.
    if (queued) {
      // nothing to refresh until the outbox has been sent
    } else if (SESSION_CHANGES.test(path)) {
      clearApiCache(); // another person's data
    } else {
      const resource = apiKey(path)[1];
      // cancelRefetch: false – a request already running is not aborted (callers awaiting it would
      // get an error); it is simply refetched afterwards if still needed.
      const opts = { cancelRefetch: false };
      if (INVALIDATE_ALL.has(resource)) void queryClient.invalidateQueries({ queryKey: ["api"] }, opts);
      else for (const r of [resource, ...(RELATED[resource] ?? [])]) void queryClient.invalidateQueries({ queryKey: ["api", r] }, opts);
    }
  }
}

export const api = {
  get,
  post: <T>(path: string, body?: unknown) =>
    write<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body: unknown) =>
    write<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    write<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: (path: string) => write<void>(path, { method: "DELETE" }),
};

// --- Types (mirror the backend schemas) ---

export type Me = {
  id: string;
  username: string;
  display_name: string;
  role: "admin" | "adult" | "child";
  color: string;
  family_id: string;
  family_name: string;
  language: string;
  theme: string;
  notification_prefs: NotificationPrefs;
  avatar_key: string | null;
  email: string | null;
  // Own menu: section keys in order, and hidden ones (see lib/nav.ts).
  nav_order: string[];
  nav_hidden: string[];
  // Menu grouped into Family / Points / Home (phones default off, computers default on).
  nav_group_mobile: boolean;
  nav_group_desktop: boolean;
  // The server's admin (families, invitations, backups).
  is_server_admin: boolean;
  // owner (runs the server) | hosted (invited) | demo – only the owner family has smart home.
  family_kind: "owner" | "hosted" | "demo";
  smarthome_available: boolean;
  // A hosted family's Home Assistant only comes through the gateway (2.8.4).
  smarthome_gateway_only?: boolean;
  // Hosted and demo families: the family whose home the server runs in.
  host_family_name?: string | null;
  morning_summary: boolean;
  morning_time: string;
  morning_days: "weekdays" | "all";
  // Set by the family admin (null = the role's default) and the apps that gives.
  app_access: string[] | null;
  apps: string[];
  // The little ones' mode: pictures and routines instead of the app.
  easy_mode?: boolean;
  // May change the family's settings (the admin, or an adult the admin lets).
  can_manage_family?: boolean;
};

export type NotificationPrefs = {
  chat: boolean;
  approvals: boolean;
  calendar_mine: boolean;
  calendar_family: boolean;
  memories?: boolean;
  subs_cancel?: boolean;
  subs_quarter?: boolean;
  subs_year?: boolean;
};

export type Member = {
  id: string;
  username: string;
  display_name: string;
  role: string;
  color: string;
  allowance_rate?: number | null;
  app_access?: string[] | null;
  apps?: string[];
  can_manage_family?: boolean;
  // The app's language; a parent chooses it for a child (3.0.4).
  language?: string;
  // "preset:<name>" or an uploaded picture (a parent sets a child's, 3.0.4).
  avatar_key?: string | null;
};

export type Feed = {
  id: string;
  name: string;
  url: string;
  color: string;
  visible_to: string[];
  details_for: string[];
  // A member's own calendar (their Google/iCloud …); null = the family's.
  member_id: string | null;
};

export type CalendarEvent = {
  // Exactly one is set: feed_id for iCal subscriptions, event_id for events created in the app.
  feed_id: string | null;
  event_id: string | null;
  // A public holiday of the family's country (3.4.0), or an eve that works like one.
  holiday?: boolean;
  holiday_eve?: boolean;
  feed_name: string;
  color: string;
  title: string | null;
  start: string;
  end: string;
  all_day: boolean;
  busy: boolean;
  location: string | null;
  description: string | null;
  created_by: string | null;
  // Members an app event concerns; empty = everyone.
  member_ids: string[];
  // Set for a birthday from the Birthdays app.
  birthday_person_id?: string | null;
  // Set for a document's expiry date from the Documents app.
  document_id?: string | null;
  // Set for a trip from the Trips app.
  trip_id?: string | null;
  // Who drives and the packing list; key names the occurrence (null for busy and birthdays).
  key?: string | null;
  needs_ride?: boolean;
  drop_off_by?: string | null;
  pick_up_by?: string | null;
  // Someone outside the family drives (3.4.0), instead of a member.
  drop_off_text?: string | null;
  pick_up_text?: string | null;
  packing?: PackingItem[];
  pack_tasks?: PackTask[];
};

export type PackingItem = { text: string; done: boolean };

export type EventPlan = {
  key: string;
  needs_ride: boolean;
  drop_off_by: string | null;
  pick_up_by: string | null;
  drop_off_text?: string | null;
  pick_up_text?: string | null;
  packing: PackingItem[];
  pack_tasks?: PackTask[];
};

// The day it's time to pack (2.9.0): a task per member, from a trip or a calendar event.
export type PackTask = { task_id: string; user_id: string | null; day: string | null; done: boolean };

export type FeedbackReport = {
  id: string;
  type: "bug" | "idea";
  title: string;
  description: string;
  reporter_name: string;
  created_at: string;
  has_screenshot: boolean;
  // The case number.
  issue_number: number;
  // Set by the server admin (3.1.0), with a note to the reporter if they wrote one.
  status: "new" | "planned" | "done" | "declined";
  admin_note: string | null;
  updated_at: string | null;
  // Only reports made as GitHub issues before 3.1.0.
  issue_url: string | null;
};

export type FamilyEventInput = {
  title: string;
  start: string;
  end: string;
  all_day: boolean;
  location: string | null;
  description: string | null;
  color: string;
  member_ids: string[];
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  points: number;
  assignee_id: string | null;
  recurrence: "none" | "daily" | "workdays" | "weekends" | "weekly" | "monthly" | "yearly";
  weekday: number | null;
  // Weekly: the weekdays (0 = Monday) and every how many weeks.
  weekdays: number[];
  interval_weeks: number;
  // 3.4.0: daily every N days, monthly every N months (from anchor_date), and monthly on the
  // first … fourth or last (-1) of weekdays[0] instead of a date.
  interval_days: number;
  interval_months: number;
  month_nth: number | null;
  anchor_date?: string | null;
  month: number | null;
  day_of_month: number | null;
  due_date: string | null;
  property_id: string | null;
  project_id: string | null;
  vehicle_id: string | null;
  requires_approval: boolean;
  // 3.4.0: done by exercising this many minutes that day (Health); null = an ordinary task.
  exercise_minutes?: number | null;
  active: boolean;
  // Taking turns: the members in order (assignee_id is whose turn it is); "done" or "weekly".
  rotation_user_ids: string[];
  rotation_mode: "done" | "weekly";
  pet_id: string | null;
  // A picture (emoji) for the little ones' mode.
  picture?: string | null;
  // Made from another app (2.9.0): a medicine's dose, or packing before a trip or an event.
  medication_id?: string | null;
  dose_time?: string | null;
  until_date?: string | null;
  trip_id?: string | null;
  event_key?: string | null;
  // Several can do it together; the points are shared (3.0.3).
  shared?: boolean;
};

export type TodayTask = {
  // Completed offline and not sent yet (lib/outbox.ts).
  pending?: boolean;
  task: Task;
  done: boolean;
  done_by: string | null;
  completion_status?: "pending" | "approved" | "rejected" | null;
  review_note?: string | null;
  unlocked?: string[];
  // Ticked off by mistake (3.1.1): whether I may undo it.
  can_undo?: boolean;
};

export type WeekDayTasks = {
  day: string;
  items: TodayTask[];
};

export type TaskHistoryItem = {
  task_id: string;
  title: string;
  completed_date: string;
  points_awarded: number;
  status: "pending" | "approved" | "rejected";
};

export type ApprovalItem = {
  completion_id: string;
  task_id: string;
  task_title: string;
  user_id: string;
  user_name: string;
  completed_date: string;
  created_at: string;
  points: number;
};

export type AllowanceMe = {
  rate: number | null; // older: money per point
  points_per_unit: number | null; // e.g. 10 = ten points per krona
  currency: string;
  earned_week: number;
  earned_month: number;
  earned_lifetime: number;
  payouts_total: number;
  balance: number;
  points_week: number;
  points_lifetime: number;
  points_pending: number; // waiting for an adult's approval
  // points: points per unit; goal: `amount` for each period reaching `min_points`.
  mode: "points" | "goal";
  period: "week" | "month";
  min_points: number | null;
  amount: number | null;
  period_points: number;
  period_reached: boolean;
  period_earned: number;
};

export type AllowanceOverviewItem = {
  user_id: string;
  display_name: string;
  color: string;
  rate: number | null;
  points_per_unit: number | null;
  currency: string;
  earned_week: number;
  earned_lifetime: number;
  payouts_total: number;
  balance: number;
  points_week: number;
  points_pending: number;
  mode: "points" | "goal";
  period: "week" | "month";
  min_points: number | null;
  amount: number | null;
  period_points: number;
  period_reached: boolean;
  period_earned: number;
};

export type AllowancePayout = {
  id: string;
  user_id: string;
  amount: number;
  note: string | null;
  paid_at: string;
};

export type LeaderboardEntry = {
  user_id: string;
  display_name: string;
  color: string;
  points_week: number;
  points_total: number;
  streak_days: number;
};

export type WidgetType =
  | "calendar_today"
  | "tasks_today"
  | "leaderboard"
  | "sl_departures"
  | "shopping_list"
  | "smart_home"
  | "chat_unread"
  | "family_goals"
  | "waste_collection"
  | "school_lunch"
  | "weather"
  | "presence"
  | "electricity"
  | "memories"
  | "pantry_soon"
  | "upcoming"
  | "custody"
  | "school";

export type TaskSuggestion = {
  id: string;
  user_id: string;
  user_name: string;
  title: string;
  description: string | null;
  status: "pending" | "approved" | "rejected";
  task_id: string | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

// Adults: what is waiting for them (completions to approve, task suggestions).
export type TasksAttention = { approvals: number; suggestions: number };

export type FamilyReward = {
  id: string;
  title: string;
  description: string | null;
  points_required: number;
  points: number; // collected so far (capped at points_required)
  starts_at: string;
  unlocked_at: string | null;
  redeemed_at: string | null;
};

export type Widget = {
  id: string;
  type: WidgetType;
  position: number;
  config: Record<string, unknown>;
};

export type SlSite = { id: number; name: string };
// 3.4.0: departures from several providers (SL keyless as before; the others' keys from the server admin).
export type TransitProvider = { id: string; name: string; area: string; needs_key: boolean; available: boolean; suggested: boolean };
export type TransitStop = { id: string; name: string };

export type SlDeparture = {
  line: string;
  destination: string;
  transport_mode: string;
  scheduled: string;
  expected: string;
  state: string;
  stale?: boolean; // SL isn't answering: last known departures
};

export type HomeProfile = {
  dwelling_type: "apartment" | "rowhouse" | "villa" | "farm";
  has_garden: boolean;
  notes: string | null;
};

export type Room = { id: string; name: string; category: string };

export type Ingredient = { name: string; amount: number | null; unit: string | null };

export type MealSlot = "dinner" | "lunchbox" | "lunch";

export type Meal = {
  id: string;
  weekday: number;
  // dinner, a lunchbox to take along (the evening before's leftovers) or lunch (3.2.0)
  slot: MealSlot;
  name: string;
  description: string | null;
  servings: number;
  ingredients: Ingredient[];
  steps: string[];
};

export type MealPlan = { id: string; week_start: string; meals: Meal[] };

export type RecipeIngredient = {
  name: string;
  amount: number | null;
  unit: string | null;
  category: ListCategory | null;
};

export type Recipe = {
  id: string;
  name: string;
  description: string | null;
  servings: number;
  photo_key: string | null;
  ingredients: RecipeIngredient[];
  steps: string[];
  // The recipe book (2.8.4).
  source_url: string | null;
  category: string;
  favorite: boolean;
  rating: number | null;
  ratings: number;
  my_rating: number;
};

export type ListCategory =
  | "produce"
  | "bread"
  | "dairy"
  | "meat_fish"
  | "frozen"
  | "pantry"
  | "snacks"
  | "beverages"
  | "household"
  | "other";

export type FamilyList = {
  id: string;
  name: string;
  allowed_user_ids: string[];
  created_by: string;
  linked_task_id: string | null;
  archived: boolean;
  open_items: number;
};

export type ListItem = {
  id: string;
  list_id: string;
  name: string;
  category: ListCategory | null;
  done: boolean;
  position: number;
  // Changed offline and not sent yet (lib/outbox.ts).
  pending?: boolean;
};

export type ImportResult = { imported: number; skipped: string[] };

export type Album = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  item_count: number;
};

export type MediaItem = {
  id: string;
  album_id: string;
  uploaded_by: string;
  kind: "image" | "video";
  original_name: string;
  content_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  created_at: string;
};

// The vault (2.8.1): a file from any of the apps, shown to those the app shows it to.
export type VaultItem = {
  id: string;
  source: "photo" | "chat" | "receipt" | "document" | "file";
  kind: "image" | "video" | "file";
  title: string;
  context: string;
  created_at: string;
  media_id: string | null;
  content_type: string;
  // Whether the app can show it (most office files can only be downloaded).
  previewable: boolean;
  thumb: string | null;
  url: string;
  link: string | null;
  album_id: string | null;
  can_delete: boolean;
  // A file only the one who put it there sees.
  private?: boolean;
};

// An account in the vault's password manager; the password and note are fetched only when shown.
export type VaultLogin = {
  id: string;
  owner_id: string;
  owner_name: string;
  title: string;
  url: string;
  username: string;
  has_password: boolean;
  has_notes: boolean;
  updated_at: string;
  // The adults the owner shares it with; they may see and copy it, not change it.
  shared_with: string[];
  can_edit: boolean;
};

// A link out of the vault that runs out (2.8.1).
export type VaultShareKind = "media" | "album" | "document" | "file" | "login";
export type VaultShare = {
  id: string;
  kind: VaultShareKind;
  target_id: string;
  title: string;
  label: string;
  one_time: boolean;
  allow_download: boolean;
  expires_at: string;
  views: number;
  last_opened_at: string | null;
  revoked_at: string | null;
  active: boolean;
  created_at: string;
};
export type VaultShareCreated = VaultShare & { url: string };

// A photo album, or the pictures of one chat.
export type VaultAlbum = {
  id: string;
  kind: "user" | "chat";
  name: string;
  item_count: number;
  cover: string | null;
  created_by: string | null;
  created_at: string | null;
};

export type SmarthomeConnection = {
  id: string;
  provider: string;
  base_url: string;
  created_at: string;
  // A simulated Home Assistant (demo / trying it out).
  simulated?: boolean;
};

export type SmarthomeEntity = {
  entity_id: string;
  domain: string;
  name: string;
  state: string;
};

export type SmarthomeDevice = {
  id: string;
  // Which Home Assistant (2.8.4).
  connection_id?: string | null;
  entity_id: string;
  display_name: string;
  domain: string;
  position: number;
  allowed_user_ids: string[];
};

export type SmarthomeAttributes = {
  volume_level?: number; // percent
  media_title?: string;
  media_artist?: string;
  brightness?: number; // percent
  color_temp_kelvin?: number;
  min_color_temp_kelvin?: number;
  max_color_temp_kelvin?: number;
  supported_color_modes?: string[];
  percentage?: number;
  percentage_step?: number;
  current_position?: number;
  current_temperature?: number;
  temperature?: number;
  min_temp?: number;
  max_temp?: number;
  target_temp_step?: number;
  hvac_action?: string;
  hvac_modes?: string[];
  battery_level?: number;
  status?: string;
  last_triggered?: string;
};

export type SmarthomeDeviceState = {
  id: string;
  entity_id: string;
  display_name: string;
  domain: string;
  state: string;
  position: number;
  attributes: SmarthomeAttributes;
  favorite: boolean; // on this user's Today card
  // The home it is in, when the family has more than one Home Assistant (2.8.4).
  home?: string | null;
  online?: boolean;
};

export type AchievementProgress = { current: number; target: number };

export type Achievement = {
  id: string;
  tier: "bronze" | "silver" | "gold";
  icon: string;
  unlocked_at: string | null;
  progress: AchievementProgress;
};

export type LevelInfo = {
  level: number;
  points: number;
  points_in_level: number;
  points_to_next: number;
};

export type AchievementsResponse = { achievements: Achievement[]; level: LevelInfo };

export type ConfigImportResult = {
  created: Record<string, number>;
  skipped: Record<string, number>;
};

export type StorageInfo = {
  data_dir: string;
  media_root: string;
  bytes_total: number;
  bytes_used: number;
  bytes_free: number;
  sd_card_suspected: boolean;
  advisory: string | null;
};

export type AllowanceSettings = {
  currency: string;
  shopping_task_points: number;
  child_approval: boolean;
};

export type ChatConversation = {
  peer_key: string;
  peer_type: "family" | "dm" | "group";
  peer_user_id: string | null;
  peer_name: string;
  peer_color: string | null;
  last_message_snippet: string | null;
  last_message_at: string | null;
  unread_count: number;
  conversation_id: string | null;
  conversation_name: string | null;
  member_ids: string[];
  is_creator: boolean;
};

export type ChatMessage = {
  id: string;
  sender_id: string | null;
  sender_name: string;
  sender_color: string;
  recipient_id: string | null;
  body: string;
  media_id: string | null;
  gif_id: string | null;
  created_at: string;
};

export type GifResult = { id: string; url: string };

export type ChatMessagesPage = {
  items: ChatMessage[];
  next_before: string | null;
};

export type PushSubscription = {
  id: string;
  endpoint: string;
  user_agent: string | null;
  created_at: string;
};

export type Property = {
  id: string;
  name: string;
  kind: string;
  dwelling?: string;
  address: string | null;
  built_year?: number | null;
  area_m2?: number | null;
  purchase_date?: string | null;
  purchase_price?: number | null;
  notes: string | null;
};

export type PropertyProject = {
  id: string;
  property_id: string;
  name: string;
  status: string;
  budget: number | null;
  started_at: string | null;
  finished_at: string | null;
  notes?: string | null;
  spent?: number;
};

export type PropertyReminder = {
  id: string;
  property_id: string;
  kind: string;
  title: string;
  due_date: string;
  repeat_months: number | null;
  remind_days: number;
  last_done: string | null;
  item_id: string | null;
  assignee_id: string | null;
  task_points: number;
  task_id: string | null;
  status: "overdue" | "soon" | "ok";
  days_left: number;
};

export type PropertyItem = {
  id: string;
  property_id: string;
  name: string;
  room: string;
  brand: string;
  model: string;
  serial: string;
  bought: string | null;
  price: number | null;
  warranty_until: string | null;
  manual_url: string;
  receipt_media_id: string | null;
  notes: string | null;
  warranty: "under" | "ending" | "over" | "none";
  service_months: number | null;
};

export type PropertyMeter = { id: string; property_id: string; kind: string; unit: string; ha_entity: string | null };
export type PropertyEnergy = { kind: string; unit: string; months: { month: string; use: number }[]; this_year: number; last_year_to_date: number; last_reading: number | null };
export type PropertyRecurringCost = { id: string; property_id: string; kind: string; amount: number; period: "monthly" | "quarterly" | "yearly"; note: string | null };
export type UtilityReading = { id: string; property_id: string; kind: string; reading_date: string; value: number; unit: string };

export type HomeCard = {
  property: Property;
  reminders: PropertyReminder[];
  cost_this_year: number;
  cost_last_year_to_date: number;
  by_category: Record<string, number>;
  recurring_monthly: number;
  projects: PropertyProject[];
  energy: PropertyEnergy[];
  items: number;
  warranties_ending: number;
  ownership_cost: number | null;
  currency: string;
};

export type PropertyExpense = {
  id: string;
  property_id: string;
  project_id: string | null;
  name: string;
  amount: number;
  expense_date: string;
  category: string;
  receipt_media_id: string | null;
};

export type PropertySummary = {
  total_expenses: number;
  project_budget_total: number;
  recurring_monthly_estimate: number;
  open_projects: number;
};

export type Vehicle = {
  id: string;
  name: string;
  registration: string;
  make: string | null;
  model: string | null;
  year: number | null;
  mileage: number | null;
  kind?: string;
  // What the meter counts: km, engine hours, or nothing.
  meter?: "km" | "hours" | "none";
  fuel?: VehicleFuel | null;
  purchase_date?: string | null;
  purchase_price?: number | null;
  charge_price_mode?: "spot" | "fixed";
  charge_fixed_price?: number | null;
  charge_extra?: number | null;
  ha_meter_entity?: string | null;
  notes: string | null;
  // Members who may see it; empty = everyone with the Vehicles app.
  allowed_user_ids: string[];
};

export type VehicleFuel = "petrol" | "diesel" | "electric" | "hybrid" | "plugin" | "gas" | "other";
export type ReminderKind = "inspection" | "service" | "tyres" | "insurance" | "tax" | "storage" | "battery" | "warranty" | "other";

export type VehicleTyre = {
  id: string;
  vehicle_id: string;
  name: string;
  season: "summer" | "winter" | "studded" | "allyear";
  size: string;
  bought: string | null;
  tread_mm: number | null;
  storage: string;
  notes: string | null;
  mounted: boolean;
  mounted_at: string | null;
};

export type VehicleDocument = { id: string; title: string; kind: string; expiry_date: string | null };

export type VehicleReminder = {
  id: string;
  vehicle_id: string;
  kind: ReminderKind;
  title: string;
  due_date: string | null;
  due_mileage: number | null;
  repeat_months: number | null;
  repeat_km: number | null;
  remind_days: number;
  last_done: string | null;
  status: "overdue" | "soon" | "ok";
  days_left: number | null;
  km_left: number | null;
};

export type VehicleMileage = { id: string; vehicle_id: string; reading_date: string; mileage: number; from_expense: boolean };

export type VehicleCard = {
  vehicle: Vehicle;
  reminders: VehicleReminder[];
  cost_this_year: number;
  cost_last_year: number;
  cost_last_year_to_date: number;
  by_category: Record<string, number>;
  consumption: number | null;
  consumption_unit: "l" | "kWh" | null;
  km_last_12_months: number | null;
  cost_per_km: number | null;
  currency: string;
  ownership_cost: number | null;
  tyres_on: string | null;
};

export type VehicleExpense = {
  id: string;
  vehicle_id: string;
  name: string;
  amount: number;
  expense_date: string;
  category: string;
  mileage_at: number | null;
  volume?: number | null;
  volume_unit?: "l" | "kWh" | null;
  charge_place?: "home" | "public" | null;
  receipt_media_id: string | null;
};

export type VehicleSummary = {
  total_expenses: number;
  fuel_total: number;
  service_total: number;
  repair_total: number;
};

export async function postRaw<T>(path: string, body: string): Promise<T> {
  const resp = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    credentials: "same-origin",
    body,
  });
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const b = await resp.json();
      if (typeof b.detail === "string") detail = b.detail;
    } catch {}
    throw new ApiError(resp.status, detail);
  }
  return resp.json();
}

/** Multipart upload of a single file (field name "file"). */
export async function uploadFile<T>(path: string, file: File): Promise<T> {
  const data = new FormData();
  data.append("file", file);
  const resp = await fetch(path, { method: "POST", body: data, credentials: "same-origin", headers: isPartyHelper() ? { "X-Party-Helper": "1" } : undefined });
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const b = await resp.json();
      if (typeof b.detail === "string") detail = b.detail;
    } catch {}
    throw new ApiError(resp.status, detail);
  }
  return resp.json();
}

export function isoDate(d: Date): string {
  return toLocalDateKey(d);
}

export type AppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  route: string | null;
  created_at: string;
  read_at: string | null;
};

// --- Birthdays and wish lists ---

export type Person = {
  id: string;
  name: string;
  user_id: string | null;
  birth_month: number | null;
  birth_day: number | null;
  birth_year: number | null;
  next_birthday: string | null;
  days_until: number | null;
  turns: number | null;
  wish_count: number;
};

export type Wish = {
  id: string;
  kind: "wish" | "idea";
  title: string;
  url: string | null;
  note: string | null;
  // null for the person the wish is for: they never see reservations.
  reserved: boolean | null;
  reserved_by_me: boolean;
  reserved_by_name: string | null;
  can_edit: boolean;
};

// --- Reward shop ---

export type ShopItem = {
  id: string;
  title: string;
  description: string | null;
  price: number;
  limit_count: number | null;
  limit_period: "week" | "month" | null;
  active: boolean;
  left_this_period: number | null;
};

export type ShopPurchase = {
  id: string;
  item_id: string;
  user_id: string;
  user_name: string;
  title: string;
  price: number;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export type ShopWallet = { balance: number; earned: number; spent: number; held: number; purchases: ShopPurchase[] };

// --- Savings jars ---

// A jar a parent added for a child; with a target it is a savings goal.
export type Jar = {
  id: string;
  name: string;
  pct: number;
  target: number | null;
  balance: number;
  progress: number | null;
  reached_at: string | null;
};

export type Jars = {
  enabled: boolean;
  currency: string;
  // Spend gets what the jars don't.
  spend: number;
  spend_pct: number;
  jars: Jar[];
  entries: { id: string; jar_id: string | null; jar_name: string | null; amount: number; kind: string; note: string | null; created_at: string }[];
  // Goals the child has proposed, waiting for an adult (2.8.3).
  requests: { id: string; name: string; pct: number; target: number; created_at: string }[];
};

// --- Today cards from public sources ---

export type WastePickup = { date: string; title: string };
export type SchoolLunch = {
  user_id: string;
  name: string;
  school: string;
  school_name: string;
  days: { date: string; dishes: string[] }[];
  error: boolean;
};
export type TodaySources = {
  waste_ical_url: string | null;
  schools: { user_id: string; name: string; role: string; school: string | null }[];
  weather_lat: number | null;
  weather_lon: number | null;
  weather_place: string | null;
  waste_schedules: WasteSchedule[];
  electricity_area: string | null;
  // The red days in the calendar (3.4.0); null is off.
  holiday_country: string | null;
};

export type PriceHour = { start: string; ore: number };

export type Electricity = {
  area: string;
  now: number | null;
  today: PriceHour[];
  tomorrow: PriceHour[] | null;
  cheapest_ahead: string[];
};

export type KioskScreen = {
  id: string;
  name: string;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
  pantry_scan: boolean;
  easy_mode: boolean;
  screensaver: KioskScreensaver;
  idle_minutes: number;
  // Dims from night_from to night_to (whole hours) when night_dim (3.0.4).
  night_dim: boolean;
  night_from: number;
  night_to: number;
  // "" = the family admin's language.
  language: string;
  // 3.0.4: "" = the app's first theme; the smart home devices it may control.
  theme: string;
  devices: string[];
  // 3.4.0: the fox dresses up for the holidays and birthdays.
  fox_themes: boolean;
  url?: string;
  qr_svg?: string;
  widgets: KioskWidget[];
};

export type KioskView = {
  family_name: string;
  language: string;
  events: CalendarEvent[];
  members: { id: string; name: string; color: string }[];
  presence: { user_id: string; name: string; color: string; state: "home" | "away" | "travel" | "unknown" }[];
  weather: (Weather & { place: string | null }) | null;
  tasks: { id: string | null; title: string; who: string | null; color: string | null; done: boolean; points: number; shared: boolean; assignee_id: string | null }[];
  turns: { title: string; who: string | null; color: string | null }[];
  waste: { date: string; title: string }[];
  lunch: { name: string; dishes: string[] }[];
  flows: { id: string; name: string }[];
  electricity: { area: string; now: number | null; cheapest: string[] } | null;
  pantry_scan: boolean;
  easy_mode: boolean;
  // What this screen shows (chosen in the family's settings).
  widgets: KioskWidget[];
  // 3.0.3: today's and tomorrow's dinner, and the screensaver.
  meals?: { date: string; name: string; meal_id?: string; cook?: boolean }[];
  screensaver?: KioskScreensaver;
  idle_minutes?: number;
  night_dim?: boolean;
  night_from?: number;
  night_to?: number;
  // 3.0.4: the screen's theme, the week's dinners and the devices it may control.
  theme?: string;
  week?: { date: string; name: string; meal_id: string; cook: boolean }[];
  devices?: SmarthomeDeviceState[];
  // 3.4.0: what the fox dresses up for today ("" = nothing) and whose birthday it is (first names).
  fox_theme?: "" | "halloween" | "christmas" | "newyear" | "easter" | "midsummer";
  birthdays?: string[];
  // 3.4.0: this week's exercise of those who share it with the family, and the family's goals.
  exercise?: { people: { name: string; color: string | null; minutes: number; workouts: number }[]; goals: ExerciseGoal[] } | null;
  // 3.4.0: each child's school day (never absence or letters on the kitchen display).
  school?: { name: string; color: string | null; school_day: string | null; pe: boolean | null; leisure_today: string | null; next_event: string | null; assignments: number | null }[];
};

// 3.4.0: a child's school day from Home Assistant (InfoMentor, SchoolSoft).
export type SchoolDay = {
  user_id: string;
  name: string;
  color: string | null;
  accounts: string[];
  school_day: string | null;
  pe: boolean | null;
  leisure_today: string | null;
  checked_in: boolean | null;
  assignments: number | null;
  assignment_titles: string[];
  absent_today: boolean | null;
  last_absence: string | null;
  next_event: string | null;
  next_lesson: string | null;
  notifications: number | null;
  weekly_letter: string | null;
  news: number | null;
  news_titles: string[];
  lunch: string | null;
};

export type ExerciseGoal = { title: string; metric: "minutes" | "km" | "workouts"; target: number; progress: number; end_date?: string };

export const KIOSK_SCREENSAVERS = ["photos", "flipclock", "calm", "fox", "dark"] as const;
export type KioskScreensaver = (typeof KIOSK_SCREENSAVERS)[number];

export const KIOSK_WIDGETS = ["calendar", "weather", "tasks", "food", "week", "recipes", "presence", "flows", "waste", "lunch", "electricity", "emergency", "slideshow", "exercise", "school"] as const;
export type KioskWidget = (typeof KIOSK_WIDGETS)[number];

export type WasteSchedule = {
  id: string;
  title: string;
  anchor_date: string;
  interval_weeks: number;
  months: number[];
  next_date: string | null;
};

export type WeatherKind = "clear" | "partly" | "cloudy" | "fog" | "rain" | "thunder" | "sleet" | "snow";

export type Weather = {
  place: string | null;
  now: { temp: number; kind: WeatherKind; wind: number | null } | null;
  today: { min: number | null; max: number | null; kind: WeatherKind; wet_from: string | null; precip: number };
  hours: { time: string; temp: number; kind: WeatherKind; precip: number }[];
  days: { date: string; min: number; max: number; kind: WeatherKind }[];
};

// --- Documents, emergency cards, guest links ---

export type DocumentKind = "passport" | "id_card" | "driving_licence" | "insurance" | "warranty" | "contract" | "vaccination" | "health" | "other";

export type FamilyDocument = {
  id: string;
  user_id: string | null;
  owner_name: string | null;
  kind: DocumentKind;
  title: string;
  number_masked: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  remind_days: number;
  private: boolean;
  notes: string | null;
  status: "ok" | "soon" | "expired";
  files: { id: string; filename: string; content_type: string; size_bytes: number }[];
  can_edit: boolean;
};

export type EmergencyContact = { name: string; phone: string; relation: string };

export type EmergencyCard = {
  user_id: string | null;
  name: string | null;
  role: string | null;
  color: string | null;
  allergies: string;
  medicines: string;
  health_centre: string;
  insurance: string;
  contacts: EmergencyContact[];
  routines: string;
  notes: string;
  address: string;
  app_medicines: string[];
  updated_at: string | null;
};

export type EmergencyCards = { household: EmergencyCard; members: EmergencyCard[] };

export type GuestAccess = {
  id: string;
  name: string;
  show_calendar: boolean;
  list_ids: string[];
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_seen_at: string | null;
  active: boolean;
  visits: { at: string; user_agent: string }[];
  // Only right after it was made.
  url?: string;
  qr_svg?: string;
};

export type GuestView = {
  name: string;
  family_name: string;
  expires_at: string;
  emergency: EmergencyCards;
  calendar: CalendarEvent[] | null;
  lists: { id: string; name: string; items: { id: string; name: string; done: boolean }[] }[];
  // A link for a child's other parent: the child's days between the two homes.
  custody?: { name: string; other_home: string; place: "here" | "other"; next_handover: string | null; next_place: "here" | "other" | null; handover_time: string; days: { date: string; place: string }[] }[];
};

// --- Presence (Home Assistant) ---

export type PresenceOut = {
  available: boolean;
  linked: boolean;
  share: "off" | "home" | "travel";
  members: { user_id: string; name: string; color: string; state: "home" | "away" | "travel" | "unknown"; since: string | null }[];
};

export type PresenceLinks = {
  people: { entity_id: string; name: string }[];
  travel_sensors: { entity_id: string; name: string }[];
  members: { user_id: string; name: string; role: string; person_entity: string | null; travel_entity: string | null; share: "off" | "home" | "travel" }[];
};

// --- Pantry ---

export type PantryPlace = "freezer" | "fridge" | "pantry";

export type PantryItem = {
  id: string;
  place: PantryPlace;
  name: string;
  amount: number | null;
  unit: string;
  best_before: string | null;
  status: "ok" | "soon" | "expired";
  barcode: string | null;
  created_at: string;
};

// What a barcode is: named by the family before, found in Open Food Facts, or unknown.
export type ScanProduct = {
  barcode: string;
  name: string;
  unit: string;
  place: PantryPlace | null;
  keeps_days: number | null;
  source: "family" | "lookup" | "none";
};

export type ScanLine = {
  barcode: string | null;
  name: string;
  amount: number;
  unit: string;
  place: PantryPlace;
  best_before: string | null;
  keeps_days: number | null;
  remember: boolean;
};

export type ScanResult = { items: PantryItem[]; missing: PantryItem[] };

// --- Söndagskollen ---

export type WeekReview = {
  week_start: string;
  last_week_start: string;
  activity: string | null;
  done_at: string | null;
  done_by_name: string | null;
  reminder: boolean;
  points: { user_id: string; name: string; color: string; points: number; tasks: number }[];
  tasks_done: number;
  top_helper: string | null;
  goals: { title: string; points: number; required: number; unlocked: boolean }[];
  stars: { id: string; from_user: string; from_name: string; to_user: string; to_name: string; message: string }[];
  // The day's dinner, and its lunch or lunchbox (3.2.0).
  days: { date: string; events: CalendarEvent[]; meal: string | null; lunch?: string | null }[];
  turns: { title: string; user_id: string | null; name: string | null }[];
  // 3.4.0: last week's exercise (shared with the family) and the family's goals.
  exercise?: { user_id: string; name: string; color: string | null; minutes: number; workouts: number; km: number }[];
  exercise_goals?: ExerciseGoal[];
};

// --- Backups ---

export type BackupSet = {
  stamp: string;
  created_at: string;
  database: string | null;
  database_size: number;
  media: string | null;
  media_size: number;
};

export type BackupsOverview = {
  available: boolean;
  running: boolean;
  error: string | null;
  // families: also a backup per family, the newest family_keep of each kept (2.8.2).
  schedule: { enabled: boolean; hour: number; keep_days: number; families: boolean; family_keep: number };
  backups: BackupSet[];
};

export type BackupStatus = { show: boolean; latest_at: string | null; stale: boolean };

// --- Server (family hosting) ---

export type ServerFamily = {
  id: string;
  name: string;
  kind: "owner" | "hosted" | "demo";
  status: "active" | "suspended";
  members: number;
  storage_bytes: number;
  // The server admin's ceiling for the family (MB), null = none.
  storage_quota_mb: number | null;
  created_at: string;
  last_activity: string | null;
  yours: boolean;
};

export type Invitation = {
  id: string;
  label: string;
  created_at: string;
  expires_at: string;
  state: "open" | "used" | "expired" | "revoked";
  family_name: string | null;
  demo_active: boolean;
};

export type ServerLogRow = {
  id: string;
  actor_name: string;
  action: string;
  family_id: string | null;
  family_name: string | null;
  detail: string;
  created_at: string;
};

// --- Medicine and pets ---

export type MedicineDose = { time: string; scheduled_at: string; taken_at: string | null; taken_by_name: string | null };

export type Medication = {
  id: string;
  user_id: string | null;
  pet_id: string | null;
  for_name: string;
  name: string;
  dose: string;
  times: string[];
  start_date: string;
  end_date: string | null;
  notes: string | null;
  alert_adults: boolean;
  active: boolean;
  // A child's or a pet's doses are tasks worth these points (2.9.0).
  points: number;
  as_tasks: boolean;
  can_edit: boolean;
  today: MedicineDose[];
};

export type PetCare = { id: string; kind: string; title: string; date: string | null; next_due: string | null; notes: string | null };

export type Pet = {
  id: string;
  name: string;
  species: string;
  birth_date: string | null;
  notes: string | null;
  care: PetCare[];
  next_due: string | null;
  chores: { id: string; title: string; recurrence: string; assignee_id: string | null; rotation_user_ids: string[] }[];
};

export type WishShare = { id: string; created_at: string; expires_at: string; revoked_at: string | null };
