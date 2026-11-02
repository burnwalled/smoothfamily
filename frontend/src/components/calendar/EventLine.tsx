"use client";

// One event in a list (the calendar's agenda and day, the Sunday check-in): the time, the title and
// who it is for, then two buttons of the same size – rides and packing, and edit. The row itself is
// not a button, so a tap on the title doesn't open the editor by mistake (3.2.0).
import { useState } from "react";
import { Car, Pencil } from "lucide-react";
import EventPlanPanel, { EventPlanBadges } from "@/components/EventPlanPanel";
import { CalendarEvent, Member } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export default function EventLine({ event, members, onEdit }: { event: CalendarEvent; members: Member[]; onEdit?: (event: CalendarEvent) => void }) {
  const { t, dateLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const tagged = members.filter((m) => event.member_ids?.includes(m.id));
  const button = "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold";
  return (
    <li>
      <div className="flex items-center gap-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: event.color }} />
          <span className="font-medium">
            {event.all_day ? t("calendar.allDay") : new Date(event.start).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span>{event.busy ? t("calendar.busy") : event.title}</span>
          {!event.busy && event.location && <span className="text-xs text-muted">· {event.location}</span>}
          {/* Subscribed calendars: show which calendar the event comes from. */}
          {event.feed_id && <span className="rounded border border-edge px-1.5 text-[11px] leading-5 text-muted">{event.feed_name}</span>}
          {tagged.length > 0 && (
            <span className="flex -space-x-1" aria-label={tagged.map((m) => m.display_name).join(", ")}>
              {tagged.map((m) => (
                <span
                  key={m.id}
                  title={m.display_name}
                  className="grid h-5 w-5 place-items-center rounded-full border border-surface text-[9px] font-bold text-white"
                  style={{ background: m.color }}
                >
                  {initials(m.display_name)}
                </span>
              ))}
            </span>
          )}
          <EventPlanBadges event={event} members={members} />
        </div>
        {event.key && (
          <button
            className={`${button} ${open ? "border-accent bg-accent-soft text-ink" : "border-edge text-muted hover:bg-base hover:text-ink"}`}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={t("rides.open", { title: event.title ?? "" })}
            title={t("rides.open", { title: event.title ?? "" })}
          >
            <Car className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            <span className="hidden sm:inline">{t("rides.button")}</span>
          </button>
        )}
        {onEdit && (
          <button
            className={`${button} w-9 justify-center border-edge px-0 text-muted hover:bg-base hover:text-ink`}
            onClick={() => onEdit(event)}
            aria-label={`${t("calendar.editEvent")}: ${event.title ?? ""}`}
            title={t("calendar.editEvent")}
          >
            <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
        )}
      </div>
      {open && event.key && <EventPlanPanel event={event} members={members} />}
    </li>
  );
}
