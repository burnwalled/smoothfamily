"use client";

import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

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

type ViewMode = "month" | "week" | "list";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toIso(value: string): string {
  return new Date(value).toISOString();
}

function formatEventRange(event: CalendarEvent): string {
  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "-";
  }
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
  }).format(start)} - ${new Intl.DateTimeFormat("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(end)}`;
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
  const [sourceFilter, setSourceFilter] = useState<"all" | "family" | "external">("all");
  const [memberFilterIds, setMemberFilterIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(
    startOfDay(new Date()),
  );
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

  const sortedEvents = useMemo(
    () => {
      const filtered = events.filter((event) => {
        if (sourceFilter !== "all" && event.source_type !== sourceFilter) {
          return false;
        }
        if (memberFilterIds.length === 0) {
          return true;
        }
        if (!event.member_user_id) {
          return false;
        }
        return memberFilterIds.includes(event.member_user_id);
      });
      return [...filtered].sort(
        (a, b) =>
          new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
      );
    },
    [events, memberFilterIds, sourceFilter],
  );

  function toggleMemberFilter(userId: string): void {
    setMemberFilterIds((previous) =>
      previous.includes(userId)
        ? previous.filter((value) => value !== userId)
        : [...previous, userId],
    );
  }

  async function loadAggregatedEvents(
    token: string,
    familyId: string,
  ): Promise<void> {
    const eventsResponse = await fetch(
      `${API_URL}/api/v1/families/${familyId}/calendar/events/aggregated`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );

    if (!eventsResponse.ok) {
      throw new Error("failed_to_load_events");
    }

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
    const monthStart = new Date(
      cursorDate.getFullYear(),
      cursorDate.getMonth(),
      1,
    );
    const gridStart = getWeekStart(monthStart);
    return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  }, [cursorDate]);

  const weekDays = useMemo(() => {
    const weekStart = getWeekStart(cursorDate);
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }, [cursorDate]);

  const selectedDayEvents = useMemo(() => {
    return eventsByDay.get(toDayKey(selectedDate)) ?? [];
  }, [eventsByDay, selectedDate]);

  const listEvents = useMemo(() => {
    const todayKey = toDayKey(startOfDay(new Date()));
    return sortedEvents.filter(
      (event) => toDayKey(new Date(event.start_at)) >= todayKey,
    );
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

        const overviewResponse = await fetch(
          `${API_URL}/api/v1/families/current/overview`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          },
        );

        if (!overviewResponse.ok) {
          setError(t("errors.load"));
          return;
        }

        const overviewPayload =
          (await overviewResponse.json()) as FamilyOverview;
        setOverview(overviewPayload);
        if (memberFilterIds.length === 0) {
          setMemberFilterIds(overviewPayload.members.map((member) => member.user_id));
        }
        await loadAggregatedEvents(token, overviewPayload.family_id);
      } catch {
        setError(t("errors.network"));
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, [getToken, isSignedIn, memberFilterIds.length, t]);

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
    if (list.includes(id)) {
      return list.filter((item) => item !== id);
    }
    return [...list, id];
  }

  function startEdit(event: CalendarEvent): void {
    if (!event.can_edit || !event.family_event_id) {
      return;
    }
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

  async function submitEvent(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!overview || !API_URL || !title.trim() || !startAt || !endAt) {
      return;
    }

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
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const responseBody = (await response.json().catch(() => ({}))) as {
          detail?: string;
        };
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
    if (!overview || !API_URL) {
      return;
    }

    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError(t("errors.auth"));
        return;
      }

      const response = await fetch(
        `${API_URL}/api/v1/families/${overview.family_id}/calendar/events/${eventId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        const responseBody = (await response.json().catch(() => ({}))) as {
          detail?: string;
        };
        setError(responseBody.detail ?? t("errors.delete"));
        return;
      }

      await loadAggregatedEvents(token, overview.family_id);
      if (editingEventId === eventId) {
        closeForm();
      }
    } catch {
      setError(t("errors.network"));
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }

  if (!overview) {
    return <p className="text-sm text-red-500">{error ?? t("errors.load")}</p>;
  }

  return (
    <div className="space-y-6">
      <section className="portal-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => openCreateForm()}
            className="rounded-md border px-3 py-2 text-sm font-medium"
            style={{ borderColor: "rgb(var(--color-border))" }}
          >
            {t("openCreate")}
          </button>
        </div>
      </section>

      <section className="portal-card space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-md border p-2"
          style={{ borderColor: "rgb(var(--color-border))" }}>
          <span className="text-xs text-muted-foreground">{t("filters.source")}</span>
          {([
            ["all", t("filters.all")],
            ["family", t("filters.family")],
            ["external", t("filters.external")],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSourceFilter(value)}
              className={`rounded px-2 py-1 text-xs ${
                sourceFilter === value ? "bg-muted font-semibold" : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
          <span className="ml-2 text-xs text-muted-foreground">{t("filters.members")}</span>
          {overview.members.map((member) => (
            <label key={member.user_id} className="inline-flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={memberFilterIds.includes(member.user_id)}
                onChange={() => toggleMemberFilter(member.user_id)}
              />
              {member.email}
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate(-1)}
              className="rounded-md border px-2 py-1 text-sm"
              style={{ borderColor: "rgb(var(--color-border))" }}
            >
              {t("prev")}
            </button>
            <button
              type="button"
              onClick={() => setCursorDate(startOfDay(new Date()))}
              className="rounded-md border px-2 py-1 text-sm"
              style={{ borderColor: "rgb(var(--color-border))" }}
            >
              {t("today")}
            </button>
            <button
              type="button"
              onClick={() => onNavigate(1)}
              className="rounded-md border px-2 py-1 text-sm"
              style={{ borderColor: "rgb(var(--color-border))" }}
            >
              {t("next")}
            </button>
          </div>

          <div className="text-sm font-medium">
            {new Intl.DateTimeFormat("sv-SE", {
              month: "long",
              year: "numeric",
            }).format(cursorDate)}
          </div>

          <div
            className="flex items-center gap-1 rounded-md border p-1"
            style={{ borderColor: "rgb(var(--color-border))" }}
          >
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
                className={`rounded px-2 py-1 text-xs ${
                  viewMode === value
                    ? "bg-muted font-semibold"
                    : "text-muted-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {viewMode === "month" ? (
          <div className="space-y-2">
            <div className="grid grid-cols-7 gap-2">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="px-1 text-center text-xs font-semibold text-muted-foreground"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {monthGridDays.map((date) => {
                const key = toDayKey(date);
                const dayEvents = eventsByDay.get(key) ?? [];
                const isCurrentMonth =
                  date.getMonth() === cursorDate.getMonth();
                const isSelected = key === toDayKey(selectedDate);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDate(startOfDay(date))}
                    className={`min-h-24 rounded-md border p-2 text-left ${
                      isSelected ? "ring-2 ring-sky-500" : ""
                    }`}
                    style={{
                      borderColor: "rgb(var(--color-border))",
                      opacity: isCurrentMonth ? 1 : 0.45,
                    }}
                  >
                    <p className="text-xs font-semibold">{date.getDate()}</p>
                    <div className="mt-2 space-y-1">
                      {dayEvents.slice(0, 2).map((event) => (
                        <p
                          key={event.id}
                          className="truncate rounded bg-muted px-1 py-0.5 text-[10px]"
                          style={{
                            borderLeft: event.source_color_hex
                              ? `3px solid ${event.source_color_hex}`
                              : undefined,
                          }}
                        >
                          {event.title}
                        </p>
                      ))}
                      {dayEvents.length > 2 ? (
                        <p className="text-[10px] text-muted-foreground">
                          +{dayEvents.length - 2}
                        </p>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {viewMode === "week" ? (
          <div className="grid gap-2 md:grid-cols-7">
            {weekDays.map((day) => {
              const key = toDayKey(day);
              const dayEvents = eventsByDay.get(key) ?? [];
              return (
                <div
                  key={key}
                  className="rounded-md border p-2"
                  style={{ borderColor: "rgb(var(--color-border))" }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedDate(startOfDay(day))}
                    className="text-left"
                  >
                    <p className="text-xs font-semibold">
                      {new Intl.DateTimeFormat("sv-SE", {
                        weekday: "short",
                        day: "2-digit",
                      }).format(day)}
                    </p>
                  </button>
                  <div className="mt-2 space-y-1">
                    {dayEvents.length === 0 ? (
                      <p className="text-xs text-muted-foreground">-</p>
                    ) : (
                      dayEvents.map((event) => (
                        <div
                          key={event.id}
                          className="w-full rounded bg-muted px-1 py-1 text-left text-[11px]"
                          style={{
                            borderLeft: event.source_color_hex
                              ? `3px solid ${event.source_color_hex}`
                              : undefined,
                          }}
                        >
                          <p>{event.title}</p>
                          <p className="text-[10px] text-muted-foreground">{event.source_label}</p>
                          {event.can_edit ? (
                            <button type="button" onClick={() => startEdit(event)} className="text-[10px] underline">
                              {t("edit")}
                            </button>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {viewMode === "list" ? (
          <div className="space-y-2">
            {listEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            ) : (
              listEvents.map((event) => (
                <div
                  key={event.id}
                  className="rounded-md border px-3 py-2"
                  style={{ borderColor: "rgb(var(--color-border))" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{event.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatEventRange(event)}
                      </p>
                      <p className="text-xs text-muted-foreground">{event.source_label}</p>
                    </div>
                    {event.can_edit ? (
                      <button
                        type="button"
                        onClick={() => startEdit(event)}
                        className="rounded-md border px-2 py-1 text-xs"
                        style={{ borderColor: "rgb(var(--color-border))" }}
                      >
                        {t("edit")}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}
      </section>

      <section className="portal-card space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">
            {t("selectedDayTitle")}{" "}
            {new Intl.DateTimeFormat("sv-SE", {
              weekday: "long",
              day: "2-digit",
              month: "short",
            }).format(selectedDate)}
          </h2>
          <button
            type="button"
            onClick={() => openCreateForm(selectedDate)}
            className="rounded-md border px-2 py-1 text-xs"
            style={{ borderColor: "rgb(var(--color-border))" }}
          >
            {t("openCreate")}
          </button>
        </div>

        {selectedDayEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("selectedDayEmpty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {selectedDayEvents.map((event) => (
              <li
                key={event.id}
                className="rounded-md border px-3 py-3"
                style={{ borderColor: "rgb(var(--color-border))" }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatEventRange(event)}
                    </p>
                    <p className="text-xs text-muted-foreground">{event.source_label}</p>
                    {event.location ? (
                      <p className="text-xs text-muted-foreground">
                        {t("fields.location")}: {event.location}
                      </p>
                    ) : null}
                    {event.is_hidden ? (
                      <p className="text-xs text-muted-foreground">
                        {t("hiddenBadge")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    {event.can_edit && event.family_event_id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(event)}
                          className="rounded-md border px-2 py-1 text-xs"
                          style={{ borderColor: "rgb(var(--color-border))" }}
                        >
                          {t("edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeEvent(event.family_event_id as string)}
                          className="rounded-md border px-2 py-1 text-xs"
                          style={{ borderColor: "rgb(var(--color-border))" }}
                        >
                          {t("delete")}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {error ? <p className="text-xs text-red-500">{error}</p> : null}
      </section>

      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border p-4 shadow-2xl"
            style={{
              borderColor: "rgb(var(--color-border))",
              backgroundColor: "rgb(var(--color-surface))",
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {editingEventId ? t("editEvent") : t("newEvent")}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-md border px-2 py-1 text-xs"
                style={{ borderColor: "rgb(var(--color-border))" }}
              >
                {t("closeForm")}
              </button>
            </div>

            <form onSubmit={submitEvent} className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span>{t("fields.title")}</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  style={{ borderColor: "rgb(var(--color-border))" }}
                />
              </label>

              <label className="space-y-1 text-sm">
                <span>{t("fields.location")}</span>
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  style={{ borderColor: "rgb(var(--color-border))" }}
                />
              </label>

              <label className="space-y-1 text-sm md:col-span-2">
                <span>{t("fields.description")}</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={2}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  style={{ borderColor: "rgb(var(--color-border))" }}
                />
              </label>

              <label className="space-y-1 text-sm">
                <span>{t("fields.startAt")}</span>
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(event) => setStartAt(event.target.value)}
                  required
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  style={{ borderColor: "rgb(var(--color-border))" }}
                />
              </label>

              <label className="space-y-1 text-sm">
                <span>{t("fields.endAt")}</span>
                <input
                  type="datetime-local"
                  value={endAt}
                  onChange={(event) => setEndAt(event.target.value)}
                  required
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  style={{ borderColor: "rgb(var(--color-border))" }}
                />
              </label>

              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(event) => setAllDay(event.target.checked)}
                />
                {t("fields.allDay")}
              </label>

              <div className="space-y-2 md:col-span-2">
                <p className="text-sm font-medium">
                  {t("fields.taggedMembers")}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {overview.members.map((member) => (
                    <label
                      key={member.user_id}
                      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                      style={{ borderColor: "rgb(var(--color-border))" }}
                    >
                      <input
                        type="checkbox"
                        checked={taggedUserIds.includes(member.user_id)}
                        onChange={() =>
                          setTaggedUserIds((previous) =>
                            toggleId(previous, member.user_id),
                          )
                        }
                      />
                      <span>{member.email}</span>
                    </label>
                  ))}
                </div>
              </div>

              {canCreateHiddenEvents ? (
                <div className="space-y-2 md:col-span-2">
                  <p className="text-sm font-medium">{t("fields.hiddenFor")}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {overview.members.map((member) => (
                      <label
                        key={member.user_id}
                        className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                        style={{ borderColor: "rgb(var(--color-border))" }}
                      >
                        <input
                          type="checkbox"
                          checked={hiddenForUserIds.includes(member.user_id)}
                          onChange={() =>
                            setHiddenForUserIds((previous) =>
                              toggleId(previous, member.user_id),
                            )
                          }
                        />
                        <span>{member.email}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-2 md:col-span-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md border px-3 py-2 text-sm font-medium"
                  style={{ borderColor: "rgb(var(--color-border))" }}
                >
                  {saving
                    ? t("saving")
                    : editingEventId
                      ? t("update")
                      : t("create")}
                </button>
                {editingEventId ? (
                  <button
                    type="button"
                    onClick={() => void removeEvent(editingEventId)}
                    className="rounded-md border px-3 py-2 text-sm"
                    style={{ borderColor: "rgb(var(--color-border))" }}
                  >
                    {t("delete")}
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
