"use client";

import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

type FamilyMember = {
  user_id: string;
  email: string;
  role: string;
};

type FamilyOverview = {
  family_id: string;
  current_user_role: string;
  members: FamilyMember[];
};

type CalendarEvent = {
  id: string;
  family_id: string;
  creator_user_id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  is_hidden: boolean;
  tagged_user_ids: string[];
  hidden_for_user_ids: string[];
};

type CalendarEventsResponse = {
  events: CalendarEvent[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL;

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

        const overviewPayload = (await overviewResponse.json()) as FamilyOverview;
        setOverview(overviewPayload);

        const eventsResponse = await fetch(
          `${API_URL}/api/v1/families/${overviewPayload.family_id}/calendar/events`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          },
        );

        if (!eventsResponse.ok) {
          setError(t("errors.load"));
          return;
        }

        const eventsPayload = (await eventsResponse.json()) as CalendarEventsResponse;
        setEvents(eventsPayload.events);
      } catch {
        setError(t("errors.network"));
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, [getToken, isSignedIn, t]);

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

  function toggleId(list: string[], id: string): string[] {
    if (list.includes(id)) {
      return list.filter((item) => item !== id);
    }
    return [...list, id];
  }

  function startEdit(event: CalendarEvent): void {
    setEditingEventId(event.id);
    setTitle(event.title);
    setDescription(event.description ?? "");
    setLocation(event.location ?? "");
    setStartAt(toDateTimeLocal(event.start_at));
    setEndAt(toDateTimeLocal(event.end_at));
    setAllDay(event.all_day);
    setTaggedUserIds(event.tagged_user_ids);
    setHiddenForUserIds(event.hidden_for_user_ids);
  }

  async function submitEvent(event: React.FormEvent<HTMLFormElement>): Promise<void> {
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
      setEvents((previous) => {
        const withoutOld = previous.filter((item) => item.id !== upsertedEvent.id);
        return [...withoutOld, upsertedEvent].sort(
          (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
        );
      });
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

      setEvents((previous) => previous.filter((item) => item.id !== eventId));
      if (editingEventId === eventId) {
        resetForm();
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
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </section>

      <section className="portal-card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {editingEventId ? t("editEvent") : t("newEvent")}
          </h2>
          {editingEventId ? (
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={resetForm}
            >
              {t("cancelEdit")}
            </button>
          ) : null}
        </div>

        <form onSubmit={submitEvent} className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>{t("fields.title")}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              style={{ borderColor: "rgb(var(--color-border))" }}
            />
          </label>

          <label className="space-y-1 text-sm">
            <span>{t("fields.location")}</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              style={{ borderColor: "rgb(var(--color-border))" }}
            />
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span>{t("fields.description")}</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
              onChange={(e) => setStartAt(e.target.value)}
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
              onChange={(e) => setEndAt(e.target.value)}
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              style={{ borderColor: "rgb(var(--color-border))" }}
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

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md border px-3 py-2 text-sm font-medium"
              style={{ borderColor: "rgb(var(--color-border))" }}
            >
              {saving ? t("saving") : editingEventId ? t("update") : t("create")}
            </button>
          </div>
        </form>

        {error ? <p className="text-xs text-red-500">{error}</p> : null}
      </section>

      <section className="portal-card space-y-3">
        <h2 className="text-base font-semibold">{t("eventListTitle")}</h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="space-y-2">
            {events.map((event) => (
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
                      onClick={() => void removeEvent(event.id)}
                      className="rounded-md border px-2 py-1 text-xs"
                      style={{ borderColor: "rgb(var(--color-border))" }}
                    >
                      {t("delete")}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
