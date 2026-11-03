"use client";

// Create or edit an event that lives in the app (shared with the whole family).
import { useState } from "react";
import { api, CalendarEvent, FamilyEventInput, Member } from "@/lib/api";
import { COLOR_NAMES, COLORS } from "@/lib/colors";
import { toLocalDateKey } from "@/lib/dateKey";
import { useI18n } from "@/lib/i18n";
import AddressInput from "@/components/AddressInput";

const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function localTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// All-day events are stored as midnight UTC with an exclusive end, so read their dates in UTC.
function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateKey: string, days: number): string {
  return utcDateKey(new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * DAY_MS));
}

export default function FamilyEventForm({
  event,
  members,
  defaultDate,
  onDone,
  onCancel,
}: {
  event?: CalendarEvent;
  members: Member[];
  defaultDate: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const start = event ? new Date(event.start) : null;
  const end = event ? new Date(event.end) : null;

  const [title, setTitle] = useState(event?.title ?? "");
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [date, setDate] = useState(
    start ? (event?.all_day ? utcDateKey(start) : toLocalDateKey(start)) : defaultDate
  );
  const [endDate, setEndDate] = useState(
    end && event?.all_day ? utcDateKey(new Date(end.getTime() - DAY_MS)) : start ? toLocalDateKey(start) : defaultDate
  );
  const [startTime, setStartTime] = useState(start && !event?.all_day ? localTime(start) : "18:00");
  const [endTime, setEndTime] = useState(end && !event?.all_day ? localTime(end) : "19:00");
  const [location, setLocation] = useState(event?.location ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [color, setColor] = useState(event?.color && COLOR_NAMES[event.color] ? event.color : COLORS[1]);
  // Empty = the whole family.
  const [memberIds, setMemberIds] = useState<string[]>(event?.member_ids ?? []);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function toggleMember(id: string) {
    setMemberIds((ids) => {
      const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
      // Everyone picked one by one is the same as "everyone".
      return next.length === members.length ? [] : next;
    });
  }

  function payload(): FamilyEventInput {
    let startIso: string;
    let endIso: string;
    if (allDay) {
      const last = endDate < date ? date : endDate;
      startIso = `${date}T00:00:00Z`;
      endIso = `${addDays(last, 1)}T00:00:00Z`;
    } else {
      const s = new Date(`${date}T${startTime}`);
      // An end time earlier than the start time means the event runs past midnight.
      let e = new Date(`${date}T${endTime}`);
      if (e < s) e = new Date(e.getTime() + DAY_MS);
      startIso = s.toISOString();
      endIso = e.toISOString();
    }
    return {
      title: title.trim(),
      start: startIso,
      end: endIso,
      all_day: allDay,
      location: location.trim() || null,
      description: description.trim() || null,
      color,
      member_ids: memberIds,
    };
  }

  async function save() {
    const body = payload();
    setError("");
    setSaving(true);
    try {
      if (event?.event_id) {
        await api.put(`/api/calendar/family-events/${event.event_id}`, body);
      } else {
        await api.post("/api/calendar/family-events", body);
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("calendar.eventError"));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!event?.event_id || !confirm(t("calendar.deleteConfirm", { title: event.title ?? "" }))) return;
    try {
      await api.del(`/api/calendar/family-events/${event.event_id}`);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  return (
    <section className="card mt-4 space-y-3 p-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
        {event ? t("calendar.editEvent") : t("calendar.newEventTitle")}
      </h2>
      <div>
        <label className="label">{t("calendar.eventTitle")}</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("calendar.eventTitlePh")} maxLength={200} />
      </div>
      {members.length > 1 && (
        <div>
          <span className="label">{t("calendar.eventWho")}</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={memberIds.length === 0}
              onClick={() => setMemberIds([])}
              className={`min-h-10 rounded-full border px-4 text-sm ${
                memberIds.length === 0 ? "border-accent bg-accent-soft font-semibold text-ink" : "border-edge text-muted"
              }`}
            >
              {t("calendar.eventEveryone")}
            </button>
            {members.map((m) => {
              const on = memberIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleMember(m.id)}
                  className={`flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm ${
                    on ? "border-accent bg-accent-soft font-semibold text-ink" : "border-edge text-muted"
                  }`}
                >
                  <span className="h-3 w-3 rounded-full" style={{ background: m.color }} aria-hidden />
                  {m.display_name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        {t("calendar.allDay")}
      </label>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <label className="label">{t("calendar.eventDate")}</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {allDay ? (
          <div>
            <label className="label">{t("calendar.eventEndDate")}</label>
            <input className="input" type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        ) : (
          <>
            <div>
              <label className="label">{t("calendar.eventStart")}</label>
              <input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className="label">{t("calendar.eventEnd")}</label>
              <input className="input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </>
        )}
        <div>
          <label className="label">{t("calendar.eventColor")}</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full" style={{ background: color }} aria-hidden />
            <select className="input pl-8" value={color} onChange={(e) => setColor(e.target.value)}>
              {COLORS.map((c) => (
                <option key={c} value={c}>{t(COLOR_NAMES[c])}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div>
        <label className="label">{t("calendar.eventLocation")}</label>
        <AddressInput value={location} onChange={setLocation} maxLength={200} aria-label={t("calendar.eventLocation")} />
      </div>
      <div>
        <label className="label">{t("calendar.eventNotes")}</label>
        <textarea className="input min-h-20" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-accent" onClick={save} disabled={!title.trim() || saving}>
          {t("calendar.saveEvent")}
        </button>
        <button className="btn-ghost" onClick={onCancel}>{t("common.cancel")}</button>
        {event?.event_id && (
          <button className="btn ml-auto border border-red-300 text-red-700" onClick={remove}>
            {t("calendar.deleteEvent")}
          </button>
        )}
      </div>
    </section>
  );
}
