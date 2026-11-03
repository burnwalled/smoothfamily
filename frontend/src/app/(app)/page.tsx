"use client";

// Dashboard: a customizable grid of widgets. Built-ins (today's calendar,
// today's tasks, leaderboard) plus any number of SL departure boards.
import { useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  Gift,
  GripVertical,
  House,
  LayoutGrid,
  LucideIcon,
  MapPin,
  MessageCircle,
  Pencil,
  ShoppingBasket,
  Soup,
  CloudSun,
  Users,
  Zap,
  Images,
  Refrigerator,
  CalendarClock,
  Repeat,
  Star,
  Trash2,
  TriangleAlert,
  Trophy,
  X,
} from "lucide-react";
import TaskList from "@/components/TaskList";
import Leaderboard from "@/components/Leaderboard";
import AddWidgetPanel from "@/components/widgets/AddWidgetPanel";
import SlDeparturesWidget from "@/components/widgets/SlDeparturesWidget";
import SmartHomeWidget from "@/components/widgets/SmartHomeWidget";
import { ElectricityWidget, SchoolLunchWidget, WasteWidget, WeatherWidget } from "@/components/widgets/TodaySourcesWidgets";
import { EventPlanBadges } from "@/components/EventPlanPanel";
import { PresenceWidget } from "@/components/Presence";
import Memories from "@/components/Memories";
import PantrySoonWidget from "@/components/widgets/PantrySoonWidget";
import UpcomingWidget from "@/components/widgets/UpcomingWidget";
import CustodyWidget from "@/components/widgets/CustodyWidget";
import FamilyGoals from "@/components/FamilyGoals";
import {
  api,
  ApprovalItem,
  BackupStatus,
  TasksAttention,
  CalendarEvent,
  ChatConversation,
  FamilyList,
  isoDate,
  LeaderboardEntry,
  ListItem,
  Member,
  TodayTask,
  Widget,
  WidgetType,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getIsoWeek } from "@/lib/week";
import { eventDayKeys, toLocalDateKey } from "@/lib/dateKey";
import { useMediaQuery } from "@/lib/useMediaQuery";
import Link from "next/link";
import { useMe } from "@/components/Shell";
import { widgetAllowed } from "@/lib/nav";
import { NONE, setApiData, useApi, useApis } from "@/lib/query";

const UPCOMING_EVENTS = 4;
const OPEN_TASKS = 6;

// The calendar card: today through Sunday, but always at least today and tomorrow.
function calendarCardDays(today: Date): Date[] {
  const daysLeftInWeek = 7 - ((today.getDay() + 6) % 7); // Monday = 7 … Sunday = 1
  return Array.from({ length: Math.max(2, daysLeftInWeek) }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    d.setDate(d.getDate() + i);
    return d;
  });
}

function SortableCard({ id, children, disabled }: { id: string; children: React.ReactNode; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id, disabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const { t, dateLocale } = useI18n();
  const [editing, setEditing] = useState(false);
  const twoColumns = useMediaQuery("(min-width: 768px)");
  const me = useMe();
  const meId = me.id;
  // Apps the family admin allows; widgets and data of the others are skipped.
  const apps = me.apps ?? [];
  const has = (app: string) => apps.includes(app);
  const appsKey = apps.join(",");
  // Server admin only: a reminder when the newest backup is old (or there is none).
  const backupStatus = useApi<BackupStatus>(me.role === "admin" ? "/api/admin/backups/status" : null).data;
  // Everything the cards show, from the cache (lib/query.ts): it refreshes itself after a change here
  // or a live event from elsewhere in the family. Apps this member doesn't have are never asked for.
  const widgets = useApi<Widget[]>("/api/dashboard/widgets").data ?? NONE;
  const [cardStart] = useState(() => new Date());
  // The rest of the week (the end date is exclusive).
  const weekEnd = useMemo(() => {
    const end = calendarCardDays(cardStart).at(-1)!;
    end.setDate(end.getDate() + 1);
    return end;
  }, [cardStart]);
  const events = useApi<CalendarEvent[]>(has("calendar") ? `/api/calendar/events?start=${isoDate(cardStart)}&end=${isoDate(weekEnd)}` : null).data ?? NONE;
  const members = useApi<Member[]>("/api/family/members").data ?? NONE;
  const tasks = useApi<TodayTask[]>(has("tasks") ? "/api/tasks/today" : null).data ?? NONE;
  // Adults only (403 for children): tasks waiting for approval.
  const approvals = useApi<ApprovalItem[]>(has("tasks") ? "/api/tasks/approvals" : null).data ?? NONE;
  const suggestionCount = useApi<TasksAttention>(has("tasks") ? "/api/tasks/attention" : null).data?.suggestions ?? 0;
  const board = useApi<LeaderboardEntry[]>(has("tasks") ? "/api/tasks/leaderboard" : null).data ?? NONE;
  const conversations = useApi<ChatConversation[]>(has("chat") ? "/api/chat/conversations" : null).data ?? NONE;
  const lists = useApi<FamilyList[]>(has("lists") ? "/api/lists" : null).data ?? NONE;
  const listItems = useApis<ListItem[]>(lists.map((l) => `/api/lists/${l.id}/items`));
  const listItemsById: Record<string, ListItem[]> = Object.fromEntries(lists.map((l, i) => [l.id, listItems[i] ?? NONE]));
  // Compact cards: a few upcoming events plus a per-day summary; open tasks first.
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [showDoneTasks, setShowDoneTasks] = useState(false);
  const [showAllOpen, setShowAllOpen] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function addWidget(type: WidgetType, config: Record<string, unknown> = {}) {
    await api.post("/api/dashboard/widgets", { type, config });
  }

  async function removeWidget(id: string) {
    try {
      await api.del(`/api/dashboard/widgets/${id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function moveWidget(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= widgets.length) return;
    const a = widgets[index];
    const b = widgets[target];
    // Optimistic swap, then persist both positions.
    const next = [...widgets];
    next[index] = b;
    next[target] = a;
    await persistOrder(next);
  }

  async function persistOrder(next: Widget[]) {
    setApiData<Widget[]>("/api/dashboard/widgets", () => next);
    await api.post("/api/dashboard/widgets/reorder", next.map((w, i) => ({ id: w.id, position: i })));
  }

  async function onDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const oldIndex = widgets.findIndex((w) => w.id === event.active.id);
    const newIndex = widgets.findIndex((w) => w.id === event.over?.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(widgets, oldIndex, newIndex);
    await persistOrder(reordered);
  }

  function widgetTitle(widget: Widget): string {
    if (widget.type === "sl_departures") {
      return String(widget.config.stop_name ?? widget.config.site_name ?? "SL");
    }
    return t(`widget.${widget.type}`);
  }

  function widgetBody(widget: Widget) {
    switch (widget.type) {
      case "calendar_today": {
        const now = new Date();
        const todayKey = toLocalDateKey(now);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowKey = toLocalDateKey(tomorrow);
        const dayLabel = (day: Date, key: string) =>
          key === todayKey
            ? t("calendar.today")
            : key === tomorrowKey
              ? t("calendar.tomorrow")
              : day.toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "short" });
        // Events that are over no longer take room; the next few are shown in full.
        const ahead = events
          .filter((event) => new Date(event.end) > now)
          .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
        const upcoming = ahead.slice(0, UPCOMING_EVENTS);
        const later = ahead.slice(UPCOMING_EVENTS);
        const laterByDay: Record<string, CalendarEvent[]> = {};
        for (const event of later) {
          for (const key of eventDayKeys(event)) if (key >= todayKey) (laterByDay[key] ??= []).push(event);
        }
        const eventRow = (event: CalendarEvent, i: number, withDay: boolean) => {
          const start = new Date(event.start);
          const startKey = toLocalDateKey(start);
          const when = event.all_day ? t("calendar.allDay") : start.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" });
          return (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: event.color }} />
              <div className="min-w-0">
                <div className="text-sm font-semibold">{event.busy ? t("calendar.busy") : event.title}</div>
                <div className="text-xs text-muted">
                  {withDay ? `${dayLabel(start < now ? now : start, start < now ? todayKey : startKey)} · ` : ""}
                  {when}
                  {event.location ? ` · ${event.location}` : ""}
                  {event.feed_id ? ` · ${event.feed_name}` : ""}
                </div>
                <EventPlanBadges event={event} members={members} />
              </div>
            </li>
          );
        };
        const summaryDays = calendarCardDays(now).filter((day) => laterByDay[toLocalDateKey(day)]);
        return (
          <div className="space-y-4">
            <div>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">{t("calendar.upcoming")}</h3>
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted">{t("calendar.nothingThisWeek")}</p>
              ) : (
                <ul className="space-y-2">{upcoming.map((event, i) => eventRow(event, i, true))}</ul>
              )}
            </div>
            {summaryDays.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">{t("calendar.laterThisWeek")}</h3>
                <ul className="divide-y divide-edge rounded-lg border border-edge">
                  {summaryDays.map((day) => {
                    const key = toLocalDateKey(day);
                    const dayEvents = laterByDay[key];
                    const open = openDay === key;
                    return (
                      <li key={key}>
                        <button
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-base"
                          onClick={() => setOpenDay(open ? null : key)}
                          aria-expanded={open}
                        >
                          <span className="font-semibold first-letter:uppercase">{dayLabel(day, key)}</span>
                          <span className="flex items-center gap-2 text-xs text-muted">
                            <span className="flex -space-x-1">
                              {dayEvents.slice(0, 4).map((event, i) => (
                                <span key={i} className="h-2.5 w-2.5 rounded-full ring-2 ring-surface" style={{ background: event.color }} />
                              ))}
                            </span>
                            {t(dayEvents.length === 1 ? "calendar.countOne" : "calendar.count", { n: dayEvents.length })}
                            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={2} aria-hidden />
                          </span>
                        </button>
                        {open && <ul className="space-y-2 px-3 pb-3 pt-1">{dayEvents.map((event, i) => eventRow(event, i, false))}</ul>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Link href="/calendar" className="btn-ghost -ml-2 inline-flex px-2 py-1 text-xs">
                {t("calendar.openCalendar")}
              </Link>
              <Link href="/calendar?new=1" className="btn-ghost inline-flex px-2 py-1 text-xs">
                {t("calendar.newEvent")}
              </Link>
            </div>
          </div>
        );
      }
      case "tasks_today": {
        // Only my own tasks and the ones anyone may take; the rest live on the Tasks page.
        const mine = tasks.filter(({ task }) => task.assignee_id === null || task.assignee_id === meId);
        const open = mine.filter((item) => !item.done);
        const done = mine.filter((item) => item.done);
        const shownOpen = showAllOpen ? open : open.slice(0, OPEN_TASKS);
        const pct = mine.length ? Math.round((done.length / mine.length) * 100) : 0;
        return (
          <div className="space-y-3">
            {mine.length > 0 && (
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-semibold">{t("tasks.statsLeft", { n: open.length })}</span>
                  <span className="text-muted">{t("tasks.statsDone", { done: done.length, total: mine.length })}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-edge">
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}
            {mine.length > 0 && open.length === 0 ? (
              <p className="text-sm font-semibold">{t("tasks.allDoneToday")}</p>
            ) : (
              <TaskList items={shownOpen} members={members} meId={meId} />
            )}
            <div className="flex flex-wrap gap-2">
              {open.length > OPEN_TASKS && (
                <button className="btn-ghost -ml-2 px-2 py-1 text-xs" onClick={() => setShowAllOpen((v) => !v)}>
                  {showAllOpen ? t("tasks.showFewer") : t("tasks.showMore", { n: open.length - OPEN_TASKS })}
                </button>
              )}
              {done.length > 0 && (
                <button className="btn-ghost -ml-2 px-2 py-1 text-xs" onClick={() => setShowDoneTasks((v) => !v)}>
                  {showDoneTasks ? t("tasks.hideDone") : t("tasks.showDone", { n: done.length })}
                </button>
              )}
            </div>
            {showDoneTasks && done.length > 0 && <TaskList items={done} members={members} meId={meId} />}
          </div>
        );
      }
      case "leaderboard":
        return <Leaderboard entries={board} />;
      case "sl_departures":
        return <SlDeparturesWidget provider={String(widget.config.provider ?? "sl")} stop={String(widget.config.stop_id ?? widget.config.site_id)} />;
      case "shopping_list":
        {
          const configured = typeof widget.config.list_id === "string" ? widget.config.list_id : "";
          const selectedList = lists.find((lst) => lst.id === configured) ?? lists[0] ?? null;
          if (!selectedList) return <p className="text-sm text-muted">{t("lists.empty")}</p>;

          const rows = listItemsById[selectedList.id] ?? [];
          if (rows.length === 0) return <p className="text-sm text-muted">{t("shopping.addPh")}</p>;

          return (
            <>
              <p className="mb-2 text-xs text-muted">{selectedList.name}</p>
              <ul className="space-y-1">
                {rows.slice(0, 8).map((item) => (
                  <li key={item.id} className={`flex items-center gap-2 text-sm ${item.done ? "line-through opacity-50" : ""}`}>
                    <input
                      type="checkbox"
                      checked={item.done}
                      className="h-4 w-4 accent-primary-700"
                      onChange={(e) => {
                        const done = e.target.checked;
                        setApiData<ListItem[]>(`/api/lists/${selectedList.id}/items`, (rows) => rows?.map((x) => (x.id === item.id ? { ...x, done } : x)));
                        void api.patch(`/api/lists/${selectedList.id}/items/${item.id}`, { done });
                      }}
                    />
                    {item.name}
                  </li>
                ))}
              </ul>
            </>
          );
        }
      case "family_goals":
        return <FamilyGoals compact />;
      case "waste_collection":
        return <WasteWidget />;
      case "school_lunch":
        return <SchoolLunchWidget />;
      case "weather":
        return <WeatherWidget />;
      case "presence":
        return <PresenceWidget />;
      case "electricity":
        return <ElectricityWidget />;
      case "memories":
        return <Memories compact />;
      case "pantry_soon":
        return <PantrySoonWidget />;
      case "upcoming":
        return <UpcomingWidget />;
      case "custody":
        return <CustodyWidget />;
      case "smart_home":
        return <SmartHomeWidget />;
      case "chat_unread":
        {
          const unread = conversations.filter((row) => row.unread_count > 0);
          const latest = [...conversations]
            .filter((row) => row.last_message_at)
            .sort((a, b) => (a.last_message_at! < b.last_message_at! ? 1 : -1))
            .slice(0, 4);
          if (conversations.length === 0) return <p className="text-sm text-muted">{t("common.loading")}</p>;
          return (
            <div className="space-y-2">
              <p className="text-xs text-muted">
                {t("chat.widgetUnread", { count: unread.reduce((sum, row) => sum + row.unread_count, 0) })}
              </p>
              <ul className="space-y-1">
                {latest.map((row) => (
                  <li key={row.peer_key} className="rounded border border-edge px-2 py-1 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{row.peer_type === "family" ? t("chat.family") : row.peer_name}</span>
                      {row.unread_count > 0 ? (
                        <span className="rounded-full bg-accent px-1.5 py-0.5 text-xs font-bold text-white">{row.unread_count}</span>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-muted">{row.last_message_snippet || t("chat.noMessages")}</p>
                  </li>
                ))}
              </ul>
              <Link href="/chat" className="btn-ghost inline-block px-3 py-1 text-xs">
                {t("chat.open")}
              </Link>
            </div>
          );
        }
    }
  }

  const shown = widgets.filter((w) => widgetAllowed(w.type, apps));
  const now = new Date();
  const today = now.toLocaleDateString(dateLocale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const week = `${t("common.weekShort")}${getIsoWeek(now)}`;

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="flex min-h-10 items-center text-2xl font-extrabold tracking-tight capitalize">{today} · {week}</h1>
        <button className="btn-ghost" onClick={() => setEditing((v) => !v)}>
          {editing ? (
            t("dashboard.doneEditing")
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              {t("dashboard.customize")}
            </span>
          )}
        </button>
      </div>

      {backupStatus?.show && (
        <Link
          href="/settings/storage"
          className="mt-4 flex items-center gap-3 rounded-card border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <TriangleAlert className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
          <span className="min-w-0 flex-1">
            {backupStatus.latest_at
              ? t("backups.staleBanner", { when: new Date(backupStatus.latest_at).toLocaleDateString(dateLocale, { day: "numeric", month: "long" }) })
              : t("backups.noneBanner")}
          </span>
          <span className="shrink-0 font-semibold">{t("backups.open")} →</span>
        </Link>
      )}

      {has("tasks") && (approvals.length > 0 || suggestionCount > 0) && (
        <Link
          href="/tasks?tab=approvals"
          className="mt-4 flex items-center gap-3 rounded-card border border-accent bg-accent-soft px-4 py-3 text-sm text-ink"
        >
          <BadgeCheck className="h-5 w-5 shrink-0 text-accent" strokeWidth={2} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="font-semibold">
              {[
                approvals.length > 0 ? t("approvals.bannerTitle", { n: approvals.length }) : null,
                suggestionCount > 0 ? t("approvals.bannerSuggestions", { n: suggestionCount }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <span className="block truncate text-xs text-muted">
              {approvals.slice(0, 3).map((a) => `${a.user_name}: ${a.task_title}`).join(" · ")}
              {approvals.length > 3 ? " …" : ""}
            </span>
          </span>
          <span className="shrink-0 font-semibold text-accent">{t("approvals.review")} →</span>
        </Link>
      )}

      {editing && (
        <div className="mt-4">
          <AddWidgetPanel onAdd={addWidget} />
        </div>
      )}

      {shown.length === 0 && !editing && (
        <p className="mt-6 text-sm text-muted">{t("dashboard.empty")}</p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={shown.map((w) => w.id)} strategy={rectSortingStrategy}>
          {/* Two independent columns (every other widget) so cards stack edge to edge
              instead of lining up in rows; one column in widget order on phones. */}
          <div className="mt-6 flex gap-4">
            {(twoColumns
              ? [shown.filter((_, i) => i % 2 === 0), shown.filter((_, i) => i % 2 === 1)]
              : [shown]
            ).map((column, col) => (
              <div key={col} className="flex min-w-0 flex-1 flex-col gap-4">
                {column.map((widget) => {
                  const index = widgets.indexOf(widget);
                  return (
                    <SortableCard key={widget.id} id={widget.id} disabled={!editing}>
                      <section className="card p-5">
                        <div className="mb-3 flex items-center justify-between">
                          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
                            <WidgetIcon type={widget.type} />
                            {widgetTitle(widget)}
                          </h2>
                          {editing && (
                            <div className="flex gap-1">
                              <span className="rounded px-1 py-0.5 text-muted" aria-hidden>
                                <GripVertical className="h-4 w-4" strokeWidth={1.75} />
                              </span>
                              <button
                                className="rounded px-2 py-0.5 text-xs text-muted hover:bg-edge disabled:opacity-30"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveWidget(index, -1);
                                }}
                                disabled={index === 0}
                                aria-label="Move up"
                              >
                                <ArrowUp className="h-3.5 w-3.5" strokeWidth={2} />
                              </button>
                              <button
                                className="rounded px-2 py-0.5 text-xs text-muted hover:bg-edge disabled:opacity-30"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveWidget(index, 1);
                                }}
                                disabled={index === widgets.length - 1}
                                aria-label="Move down"
                              >
                                <ArrowDown className="h-3.5 w-3.5" strokeWidth={2} />
                              </button>
                              <button
                                className="rounded px-2 py-0.5 text-xs text-red-600 hover:bg-edge"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeWidget(widget.id);
                                }}
                                aria-label={t("common.remove")}
                              >
                                <X className="h-3.5 w-3.5" strokeWidth={2} />
                              </button>
                            </div>
                          )}
                        </div>
                        {widgetBody(widget)}
                      </section>
                    </SortableCard>
                  );
                })}
              </div>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </>
  );
}

const WIDGET_ICONS: Record<string, LucideIcon> = {
  calendar_today: CalendarDays,
  tasks_today: Star,
  leaderboard: Trophy,
  sl_departures: MapPin,
  shopping_list: ShoppingBasket,
  smart_home: House,
  chat_unread: MessageCircle,
  family_goals: Gift,
  waste_collection: Trash2,
  school_lunch: Soup,
  weather: CloudSun,
  presence: Users,
  electricity: Zap,
  memories: Images,
  pantry_soon: Refrigerator,
  upcoming: CalendarClock,
  custody: Repeat,
};

function WidgetIcon({ type }: { type: string }) {
  const Icon = WIDGET_ICONS[type] ?? LayoutGrid;
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
    </span>
  );
}
