"use client";

// What a guest link and the other parent's account show (the child's schedule between the homes,
// the emergency cards, the calendar and the lists picked) – one place for both.
import { CalendarDays, ListChecks, Siren } from "lucide-react";
import { GuestView, Member } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import EmergencyCardView from "@/components/EmergencyCardView";
import { EventPlanBadges } from "@/components/EventPlanPanel";
import { toLocalDateKey } from "@/lib/dateKey";
import CustodyStrip from "@/components/custody/CustodyStrip";

export default function GuestBody({ view, offline = false, tick }: { view: GuestView; offline?: boolean; tick: (itemId: string, done: boolean) => void }) {
  const { t, dateLocale } = useI18n();
  // The family's members as far as the guest needs them: names for who drives.
  const members: Member[] = view.emergency.members.map((m) => ({ id: m.user_id ?? "", username: "", display_name: m.name ?? "", role: m.role ?? "", color: m.color ?? "" }));
  const days = new Map<string, NonNullable<GuestView["calendar"]>>();
  for (const event of view.calendar ?? []) {
    const key = toLocalDateKey(new Date(event.start));
    days.set(key, [...(days.get(key) ?? []), event]);
  }
  return (
    <>
    {(view.custody ?? []).map((c, i) => (
      <section key={c.name} className="card p-5" aria-label={t("custody.title")}>
        <h2 className="mb-1 text-base font-bold">{c.name}</h2>
        <p className="mb-3 text-sm">
          <span className="font-semibold">{c.place === "other" ? t("custody.guestWithYou") : t("custody.guestWithUs", { family: view.family_name })}</span>
          {c.next_handover && <span className="text-muted"> · {t("custody.guestNext", { day: new Date(`${c.next_handover}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "short" }), time: c.handover_time })}</span>}
        </p>
        <CustodyStrip days={c.days} color={view.emergency.members[i]?.color ?? "#4F7A5B"} otherHome={c.other_home} />
      </section>
    ))}

    <section className="card border-red-200 p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-red-700">
        <Siren className="h-4 w-4" strokeWidth={2} aria-hidden />
        {t("emergency.title")}
      </h2>
      <p className="mb-3 text-sm font-semibold">{t("guests.call112")}</p>
      <EmergencyCardView card={view.emergency.household} />
    </section>
    {view.emergency.members.map((card) => (
      <section key={card.user_id} className="card p-5" aria-label={card.name ?? ""}>
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
          <span className="h-3 w-3 rounded-full" style={{ background: card.color ?? undefined }} />
          {card.name}
        </h2>
        <EmergencyCardView card={card} />
      </section>
    ))}

    {view.calendar && (
      <section className="card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
          <CalendarDays className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t("guests.calendarTitle")}
        </h2>
        {days.size === 0 ? (
          <p className="text-sm text-muted">{t("guests.nothingPlanned")}</p>
        ) : (
          <ul className="space-y-3">
            {[...days.entries()].map(([day, events]) => (
              <li key={day}>
                <p className="text-xs font-semibold capitalize text-muted">
                  {new Date(`${day}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "short" })}
                </p>
                <ul className="mt-1 space-y-1">
                  {events.map((e, i) => (
                    <li key={`${e.key ?? e.title}-${i}`} className="text-sm">
                      <span className="flex flex-wrap items-center gap-x-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: e.color }} />
                        <span className="text-muted">
                          {e.all_day ? t("calendar.allDay") : new Date(e.start).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span>{e.title}</span>
                        <EventPlanBadges event={e} members={members} />
                      </span>
                      {(e.packing ?? []).length > 0 && (
                        <span className="ml-4 block text-xs text-muted">
                          {t("packing.title")}: {(e.packing ?? []).map((p) => p.text).join(", ")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    )}

    {view.lists.map((list) => (
      <section key={list.id} className="card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
          <ListChecks className="h-4 w-4" strokeWidth={2} aria-hidden />
          {list.name}
        </h2>
        {list.items.length === 0 ? (
          <p className="text-sm text-muted">{t("lists.empty")}</p>
        ) : (
          <ul className="space-y-1">
            {list.items.map((item) => (
              <li key={item.id}>
                <label className={`flex items-center gap-2 text-sm ${item.done ? "text-muted line-through" : ""}`}>
                  <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={item.done} disabled={offline} onChange={(e) => tick(item.id, e.target.checked)} />
                  {item.name}
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>
    ))}
    </>
  );
}
