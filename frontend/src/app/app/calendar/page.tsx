"use client";

import { useAuth } from "@clerk/nextjs";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

type FamilyMember = {
  user_id: string;
  email: string;
  role: string;
  color_hex?: string | null;
};

type FamilyOverview = {
  family_id: string;
  current_user_role: string;
  members: FamilyMember[];
};

type CalendarEvent = {
  id: string;
  source_type: "family" | "external";
  source_label: string;
  member_user_id: string | null;
  source_color_hex: string | null;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  is_hidden: boolean;
  can_edit: boolean;
  family_event_id: string | null;
  tagged_user_ids: string[];
  hidden_for_user_ids: string[];
};

type CalendarEventsResponse = {
  events: CalendarEvent[];
};

type CalendarSource = {
  label: string;
  color_hex: string | null;
  source_type: "family" | "external";
};

type ViewMode = "month" | "week" | "list";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const WEEKDAY_LABELS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

function pad(value: number): string {
  return `${value}`.padStart(2, "0");
}

function toDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function getWeekStart(date: Date): Date {
  const current = startOfDay(date);
  const day = current.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(current, mondayOffset);
}

function toDateTimeLocal(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [
    date.getFullYear(),
    "-",
    `${date.getMonth() + 1}`.padStart(2, "0"),
    "-",
    `${date.getDate()}`.padStart(2, "0"),
    "T",
    `${date.getHours()}`.padStart(2, "0"),
    ":",
    `${date.getMinutes()}`.padStart(2, "0"),
  ].join("");
}

function toIso(value: string): string {
  return new Date(value).toISOString();
}

function formatEventRange(event: CalendarEvent): string {
  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "-";
  if (event.all_day) {
    return new Intl.DateTimeFormat("sv-SE", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(start);
  }
  return `${new Intl.DateTimeFormat("sv-SE", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(start)} – ${new Intl.DateTimeFormat("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(end)}`;
}

function getEventRenderKey(event: CalendarEvent, index: number): string {
  return [event.source_type, event.id, event.start_at, event.member_user_id ?? "none", `${index}`].join("-");
}

function EventDot({ color }: { color: string | null }) {
  return (
    <span
      className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
      style={{ backgroundColor: color ?? "currentColor" }}
    />
  );
}

export default function CalendarPage() {
  const t = useTranslations("calendar");
  const { isSignedIn, getToken } = useAuth();

  const [overview, setOverview] = useState<FamilyOverview | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [hiddenSources, setHiddenSources] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [cursorDate, setCursorDate] = useState<Date>(startOfDay(new Date()));
  const [isFormOpen, setIsFormOpen] = useState(false);

  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [taggedUserIds, setTaggedUserIds] = useState<string[]>([]);
  const [hiddenForUserIds, setHiddenForUserIds] = useState<string[]>([]);

  const canCreateHiddenEvents = useMemo(() => {
    const role = overview?.current_user_role;
    return role === "owner" || role === "parent";
  }, [overview?.current_user_role]);

  const availableSources = useMemo<CalendarSource[]>(() => {
    const seen = new Map<string, CalendarSource>();
    for (const event of events) {
      if (!seen.has(event.source_label)) {
        seen.set(event.source_label, {
          label: event.source_label,
          color_hex: event.source_color_hex,
          source_type: event.source_type,
        });
      }
    }
    return [...seen.values()].sort((a, b) => {
      if (a.source_type !== b.source_type) return a.source_type === "family" ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
  }, [events]);

  const sortedEvents = useMemo(() => {
    const filtered = events.filter((event) => !hiddenSources.has(event.source_label));
    return [...filtered].sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
    );
  }, [events, hiddenSources]);

  function toggleSource(label: string): void {
    setHiddenSources((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  async function loadAggregatedEvents(token: string, familyId: string): Promise<void> {
    const eventsResponse = await fetch(
      `${API_URL}/api/v1/families/${familyId}/calendar/events/aggregated`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    if (!eventsResponse.ok) throw new Error("failed_to_load_events");
    const eventsPayload = (await eventsResponse.json()) as CalendarEventsResponse;
    setEvents(eventsPayload.events);
  }

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of sortedEvents) {
      const key = toDayKey(new Date(event.start_at));
      const existing = map.get(key) ?? [];
      existing.push(event);
      map.set(key, existing);
    }
    return map;
  }, [sortedEvents]);

  const monthGridDays = useMemo(() => {
    const monthStart = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1);
    const gridStart = getWeekStart(monthStart);
    return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  }, [cursorDate]);

  const weekDays = useMemo(() => {
    const weekStart = getWeekStart(cursorDate);
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }, [cursorDate]);

  const selectedDayEvents = useMemo(
    () => eventsByDay.get(toDayKey(selectedDate)) ?? [],
    [eventsByDay, selectedDate],
  );

  const listEvents = useMemo(() => {
    const todayKey = toDayKey(startOfDay(new Date()));
    return sortedEvents.filter((event) => toDayKey(new Date(event.start_at)) >= todayKey);
  }, [sortedEvents]);

  useEffect(() => {
    async function loadData() {
      if (!API_URL) {
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
          setError(t("errors.auth"));
          return;
        }
        const overviewResponse = await fetch(`${API_URL}/api/v1/families/current/overview`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!overviewResponse.ok) {
          setError(t("errors.load"));
          return;
        }
        const overviewPayload = (await overviewResponse.json()) as FamilyOverview;
        setOverview(overviewPayload);
        await loadAggregatedEvents(token, overviewPayload.family_id);
      } catch {
        setError(t("errors.network"));
      } finally {
        setLoading(false);
      }
    }
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken, isSignedIn]);

  function resetForm(): void {
    setEditingEventId(null);
    setTitle("");
    setDescription("");
    setLocation("");
    setStartAt("");
    setEndAt("");
    setAllDay(false);
    setTaggedUserIds([]);
    setHiddenForUserIds([]);
  }

  function openCreateForm(date?: Date): void {
    resetForm();
    const baseDate = date ?? selectedDate;
    const start = new Date(baseDate);
    start.setHours(9, 0, 0, 0);
    const end = new Date(baseDate);
    end.setHours(10, 0, 0, 0);
    setStartAt(toDateTimeLocal(start.toISOString()));
    setEndAt(toDateTimeLocal(end.toISOString()));
    setIsFormOpen(true);
  }

  function closeForm(): void {
    setIsFormOpen(false);
    setEditingEventId(null);
  }

  function toggleId(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  }

  function startEdit(event: CalendarEvent): void {
    if (!event.can_edit || !event.family_event_id) return;
    setEditingEventId(event.family_event_id);
    setTitle(event.title);
    setDescription(event.description ?? "");
    setLocation(event.location ?? "");
    setStartAt(toDateTimeLocal(event.start_at));
    setEndAt(toDateTimeLocal(event.end_at));
    setAllDay(event.all_day);
    setTaggedUserIds(event.tagged_user_ids);
    setHiddenForUserIds(event.hidden_for_user_ids);
    setIsFormOpen(true);
  }

  function onNavigate(direction: -1 | 1): void {
    if (viewMode === "month") {
      setCursorDate((current) => addMonths(current, direction));
      return;
    }
    if (viewMode === "week") {
      setCursorDate((current) => addDays(current, 7 * direction));
      return;
    }
    setCursorDate((current) => addDays(current, 14 * direction));
  }

  async function submitEvent(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!overview || !API_URL || !title.trim() || !startAt || !endAt) return;

    setSaving(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        setError(t("errors.auth"));
        return;
      }

      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        start_at: toIso(startAt),
        end_at: toIso(endAt),
        all_day: allDay,
        tagged_user_ids: taggedUserIds,
        hidden_for_user_ids: canCreateHiddenEvents ? hiddenForUserIds : [],
      };

      const url = editingEventId
        ? `${API_URL}/api/v1/families/${overview.family_id}/calendar/events/${editingEventId}`
        : `${API_URL}/api/v1/families/${overview.family_id}/calendar/events`;
      const method = editingEventId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const responseBody = (await response.json().catch(() => ({}))) as { detail?: string };
        setError(responseBody.detail ?? t("errors.save"));
        return;
      }

      const upsertedEvent = (await response.json()) as CalendarEvent;
      await loadAggregatedEvents(token, overview.family_id);
      setSelectedDate(startOfDay(new Date(upsertedEvent.start_at)));
      closeForm();
      resetForm();
    } catch {
      setError(t("errors.network"));
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent(eventId: string): Promise<void> {
    if (!overview || !API_URL) return;
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError(t("errors.auth"));
        return;
      }

      const response = await fetch(
        `${API_URL}/api/v1/families/${overview.family_id}/calendar/events/${eventId}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );

      if (!response.ok) {
        const responseBody = (await response.json().catch(() => ({}))) as { detail?: string };
        setError(responseBody.detail ?? t("errors.delete"));
        return;
      }

      await loadAggregatedEvents(token, overview.family_id);
      if (editingEventId === eventId) closeForm();
    } catch {
      setError(t("errors.network"));
    }
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="portal-card">
        <p className="text-sm text-destructive">{error ?? t("errors.load")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="portal-card flex flex-wrap items-center justify-between gap-3 py-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => openCreateForm()}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("openCreate")}
        </button>
      </section>

      <section className="portal-card space-y-4">
        {/* Calendar source toggles */}
        {availableSources.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t("filters.calendarsLabel")}
            </span>
            {availableSources.map((source) => {
              const isHidden = hiddenSources.has(source.label);
              return (
                <button
                  key={source.label}
                  type="button"
                  onClick={() => toggleSource(source.label)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all",
                    isHidden
                      ? "bg-muted/40 text-muted-foreground/50 line-through"
                      : "bg-muted text-foreground hover:bg-muted/70",
                  )}
                >
                  <EventDot color={isHidden ? null : source.color_hex} />
                  {source.label}
                  {isHidden && <X className="h-2.5 w-2.5 opacity-60" />}
                </button>
              );
            })}
          </div>
        )}

        {/* Toolbar: nav + date + view mode */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onNavigate(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setCursorDate(startOfDay(new Date()))}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
            >
              {t("today")}
            </button>
            <button
              type="button"
              onClick={() => onNavigate(1)}
              className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <p className="text-sm font-semibold capitalize">
            {new Intl.DateTimeFormat("sv-SE", {
              month: "long",
              year: "numeric",
            }).format(cursorDate)}
          </p>

          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
            {(
              [
                ["month", t("viewMonth")],
                ["week", t("viewWeek")],
                ["list", t("viewList")],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setViewMode(value)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  viewMode === value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Month view */}
        {viewMode === "month" && (
          <div className="space-y-1">
            <div className="grid grid-cols-7">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="pb-1 text-center text-[11px] font-semibold text-muted-foreground"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthGridDays.map((date) => {
                const key = toDayKey(date);
                const dayEvents = eventsByDay.get(key) ?? [];
                const isCurrentMonth = date.getMonth() === cursorDate.getMonth();
                const isSelected = key === toDayKey(selectedDate);
                const isToday = key === toDayKey(startOfDay(new Date()));
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDate(startOfDay(date))}
                    className={cn(
                      "min-h-20 rounded-lg border border-border p-1.5 text-left transition-colors",
                      isSelected ? "ring-2 ring-primary ring-offset-1" : "hover:bg-muted/40",
                      !isCurrentMonth && "opacity-40",
                    )}
                  >
                    <p
                      className={cn(
                        "mb-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold",
                        isToday && "bg-primary text-primary-foreground",
                      )}
                    >
                      {date.getDate()}
                    </p>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 2).map((event, index) => (
                        <div
                          key={getEventRenderKey(event, index)}
                          className="flex items-center gap-1 rounded bg-muted px-1 py-0.5"
                        >
                          <EventDot color={event.source_color_hex} />
                          <span className="truncate text-[10px] leading-tight">{event.title}</span>
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <p className="pl-1 text-[10px] text-muted-foreground">
                          +{dayEvents.length - 2}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Week view */}
        {viewMode === "week" && (
          <div className="grid gap-2 md:grid-cols-7">
            {weekDays.map((day) => {
              const key = toDayKey(day);
              const dayEvents = eventsByDay.get(key) ?? [];
              const isToday = key === toDayKey(startOfDay(new Date()));
              return (
                <div
                  key={key}
                  className={cn(
                    "rounded-lg border border-border p-2",
                    isToday && "border-primary/40 bg-primary/5",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedDate(startOfDay(day))}
                    className="text-left"
                  >
                    <p className={cn("text-xs font-semibold", isToday && "text-primary")}>
                      {new Intl.DateTimeFormat("sv-SE", {
                        weekday: "short",
                        day: "2-digit",
                      }).format(day)}
                    </p>
                  </button>
                  <div className="mt-1.5 space-y-1">
                    {dayEvents.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground/50">–</p>
                    ) : (
                      dayEvents.map((event, index) => (
                        <div
                          key={getEventRenderKey(event, index)}
                          className="rounded bg-muted px-1.5 py-1"
                        >
                          <div className="flex items-center gap-1">
                            <EventDot color={event.source_color_hex} />
                            <p className="truncate text-[11px] font-medium leading-tight">
                              {event.title}
                            </p>
                          </div>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {event.source_label}
                          </p>
                          {event.can_edit && (
                            <button
                              type="button"
                              onClick={() => startEdit(event)}
                              className="mt-0.5 text-[10px] text-primary underline"
                            >
                              {t("edit")}
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* List view */}
        {viewMode === "list" && (
          <div className="space-y-1.5">
            {listEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            ) : (
              listEvents.map((event, index) => (
                <div
                  key={getEventRenderKey(event, index)}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <EventDot color={event.source_color_hex} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{event.title}</p>
                      <p className="text-xs text-muted-foreground">{formatEventRange(event)}</p>
                      <p className="text-xs text-muted-foreground">{event.source_label}</p>
                    </div>
                  </div>
                  {event.can_edit && (
                    <button
                      type="button"
                      onClick={() => startEdit(event)}
                      className="flex-shrink-0 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                    >
                      {t("edit")}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {/* Selected day detail */}
      <section className="portal-card space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            {t("selectedDayTitle")}{" "}
            <span className="capitalize">
              {new Intl.DateTimeFormat("sv-SE", {
                weekday: "long",
                day: "2-digit",
                month: "short",
              }).format(selectedDate)}
            </span>
          </h2>
          <button
            type="button"
            onClick={() => openCreateForm(selectedDate)}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
          >
            <Plus className="h-3 w-3" />
            {t("openCreate")}
          </button>
        </div>

        {selectedDayEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("selectedDayEmpty")}</p>
        ) : (
          <ul className="space-y-1.5">
            {selectedDayEvents.map((event, index) => (
              <li
                key={getEventRenderKey(event, index)}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border px-3 py-3"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <EventDot color={event.source_color_hex} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{event.title}</p>
                    <p className="text-xs text-muted-foreground">{formatEventRange(event)}</p>
                    <p className="text-xs text-muted-foreground">{event.source_label}</p>
                    {event.location && (
                      <p className="text-xs text-muted-foreground">
                        {t("fields.location")}: {event.location}
                      </p>
                    )}
                    {event.is_hidden && (
                      <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        {t("hiddenBadge")}
                      </span>
                    )}
                  </div>
                </div>
                {event.can_edit && event.family_event_id && (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => startEdit(event)}
                      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                    >
                      {t("edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeEvent(event.family_event_id as string)}
                      className="rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/5"
                    >
                      {t("delete")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}
      </section>

      {/* Event form modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {editingEventId ? t("editEvent") : t("newEvent")}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={submitEvent} className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium">{t("fields.title")}</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium">{t("fields.location")}</span>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>

              <label className="space-y-1 text-sm md:col-span-2">
                <span className="font-medium">{t("fields.description")}</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium">{t("fields.startAt")}</span>
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  required
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium">{t("fields.endAt")}</span>
                <input
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  required
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>

              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                />
                {t("fields.allDay")}
              </label>

              <div className="space-y-2 md:col-span-2">
                <p className="text-sm font-medium">{t("fields.taggedMembers")}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {overview.members.map((member) => (
                    <label
                      key={member.user_id}
                      className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={taggedUserIds.includes(member.user_id)}
                        onChange={() =>
                          setTaggedUserIds((prev) => toggleId(prev, member.user_id))
                        }
                      />
                      <span>{member.email}</span>
                    </label>
                  ))}
                </div>
              </div>

              {canCreateHiddenEvents && (
                <div className="space-y-2 md:col-span-2">
                  <p className="text-sm font-medium">{t("fields.hiddenFor")}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {overview.members.map((member) => (
                      <label
                        key={member.user_id}
                        className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={hiddenForUserIds.includes(member.user_id)}
                          onChange={() =>
                            setHiddenForUserIds((prev) => toggleId(prev, member.user_id))
                          }
                        />
                        <span>{member.email}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 md:col-span-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? t("saving") : editingEventId ? t("update") : t("create")}
                </button>
                {editingEventId && (
                  <button
                    type="button"
                    onClick={() => void removeEvent(editingEventId)}
                    className="rounded-lg border border-destructive/40 px-4 py-2 text-sm text-destructive hover:bg-destructive/5"
                  >
                    {t("delete")}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
