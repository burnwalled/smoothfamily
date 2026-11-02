"use client";

// Who drives and the packing list for one calendar event (#53). Adults take the drop-off or the
// pick-up; anyone can say a ride is needed and tick off the packing list. The list itself is kept
// per title, so every "Football practice" gets the same one.
import { useState } from "react";
import { Backpack, Car } from "lucide-react";
import { api, CalendarEvent, EventPlan, Member, PackingItem } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/components/Shell";
import PackDay from "@/components/PackDay";

type Leg = "drop_off" | "pick_up";

function target(event: CalendarEvent) {
  return { key: event.key, title: event.title ?? "", start: event.start };
}

/** Small badges on the event line: who drives and how much is packed. */
export function EventPlanBadges({ event, members }: { event: CalendarEvent; members: Member[] }) {
  const { t } = useI18n();
  const packing = event.packing ?? [];
  const drivers = [event.drop_off_by, event.pick_up_by]
    .filter((id, i, all): id is string => !!id && all.indexOf(id) === i)
    .map((id) => members.find((m) => m.id === id)?.display_name)
    .filter(Boolean);
  const missing = event.needs_ride && (!event.drop_off_by || !event.pick_up_by);
  if (!drivers.length && !missing && !packing.length) return null;
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-muted">
      {(drivers.length > 0 || missing) && (
        <span className={`flex items-center gap-0.5 ${missing ? "font-semibold text-accent" : ""}`} title={t("rides.title")}>
          <Car className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {drivers.length ? drivers.join(", ") : t("rides.nobody")}
          {drivers.length > 0 && missing && " · ?"}
        </span>
      )}
      {packing.length > 0 && (
        <span className="flex items-center gap-0.5" title={t("packing.title")}>
          <Backpack className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {packing.filter((p) => p.done).length}/{packing.length}
        </span>
      )}
    </span>
  );
}

export default function EventPlanPanel({ event, members, onChanged }: { event: CalendarEvent; members: Member[]; onChanged?: () => void }) {
  const { t } = useI18n();
  const me = useMe();
  const adult = me.role === "admin" || me.role === "adult";
  const [plan, setPlan] = useState<EventPlan>({
    key: event.key ?? "",
    needs_ride: !!event.needs_ride,
    drop_off_by: event.drop_off_by ?? null,
    pick_up_by: event.pick_up_by ?? null,
    packing: event.packing ?? [],
    pack_tasks: event.pack_tasks ?? [],
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.display_name ?? "";

  async function run(action: () => Promise<EventPlan>) {
    setError("");
    try {
      setPlan(await action());
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  function ride(leg: Leg, claim: boolean) {
    return run(() => api.post<EventPlan>("/api/calendar/plan/ride", { ...target(event), leg, claim }));
  }

  async function savePacking() {
    setError("");
    try {
      const items = draft.split("\n").map((line) => line.trim()).filter(Boolean);
      const saved = await api.put<PackingItem[]>("/api/calendar/packing", { title: event.title, items });
      const ticked = new Set(plan.packing.filter((p) => p.done).map((p) => p.text));
      setPlan({ ...plan, packing: saved.map((p) => ({ ...p, done: ticked.has(p.text) })) });
      setEditing(false);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  const legs: { leg: Leg; by: string | null; label: string; take: string }[] = [
    { leg: "drop_off", by: plan.drop_off_by, label: t("rides.dropOff"), take: t("rides.takeDropOff") },
    { leg: "pick_up", by: plan.pick_up_by, label: t("rides.pickUp"), take: t("rides.takePickUp") },
  ];

  return (
    <div className="mt-2 grid gap-3 rounded-lg border border-edge bg-base/50 p-3 text-sm sm:grid-cols-2" aria-label={t("rides.panel", { title: event.title ?? "" })}>
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
          <Car className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {t("rides.title")}
        </p>
        {plan.needs_ride || plan.drop_off_by || plan.pick_up_by ? (
          <ul className="space-y-1.5">
            {legs.map(({ leg, by, label, take }) => (
              <li key={leg} className="flex flex-wrap items-center gap-2">
                <span className="w-16 shrink-0 text-xs text-muted">{label}</span>
                {by ? (
                  <>
                    <span className="font-semibold">{by === me.id ? t("rides.you") : nameOf(by)}</span>
                    {(by === me.id || adult) && (
                      <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => ride(leg, false)}>
                        {t("rides.release")}
                      </button>
                    )}
                  </>
                ) : adult ? (
                  <button className="btn-ghost border border-edge px-2 py-0.5 text-xs" onClick={() => ride(leg, true)}>
                    {take}
                  </button>
                ) : (
                  <span className="text-xs text-accent">{t("rides.nobody")}</span>
                )}
              </li>
            ))}
            {!plan.drop_off_by && !plan.pick_up_by && (
              <li>
                <button
                  className="text-xs text-muted hover:underline"
                  onClick={() => run(() => api.post<EventPlan>("/api/calendar/plan/needs-ride", { ...target(event), needs: false }))}
                >
                  {t("rides.notNeeded")}
                </button>
              </li>
            )}
          </ul>
        ) : (
          <button
            className="btn-ghost border border-edge px-2 py-1 text-xs"
            onClick={() => run(() => api.post<EventPlan>("/api/calendar/plan/needs-ride", { ...target(event), needs: true }))}
          >
            {t("rides.needed")}
          </button>
        )}
      </div>

      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
          <Backpack className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {t("packing.title")}
          {!editing && (
            <button
              className="ml-auto text-xs font-normal normal-case tracking-normal text-accent hover:underline"
              onClick={() => {
                setDraft(plan.packing.map((p) => p.text).join("\n"));
                setEditing(true);
              }}
            >
              {plan.packing.length ? t("packing.edit") : t("packing.add")}
            </button>
          )}
        </p>
        {editing ? (
          <div className="space-y-2">
            <textarea
              className="input min-h-24 w-full"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("packing.placeholder")}
              aria-label={t("packing.items")}
            />
            <p className="text-xs text-muted">{t("packing.sameTitle", { title: event.title ?? "" })}</p>
            <div className="flex gap-2">
              <button className="btn-primary px-3 py-1 text-xs" onClick={savePacking}>{t("profile.save")}</button>
              <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setEditing(false)}>{t("common.cancel")}</button>
            </div>
          </div>
        ) : null}
        {!editing && adult && (
          <div className="mb-2">
            <PackDay
              tasks={plan.pack_tasks ?? []}
              candidates={members}
              defaultIds={event.member_ids?.length ? event.member_ids : []}
              defaultDay={event.start.slice(0, 10)}
              lastDay={event.start.slice(0, 10)}
              onSave={(body) => run(() => api.put<EventPlan>("/api/calendar/plan/pack-task", { ...target(event), ...body }))}
            />
          </div>
        )}
        {editing ? null : plan.packing.length === 0 ? (
          <p className="text-xs text-muted">{t("packing.empty")}</p>
        ) : (
          <ul className="space-y-1">
            {plan.packing.map((item) => (
              <li key={item.text}>
                <label className={`flex items-center gap-2 ${item.done ? "text-muted line-through" : ""}`}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary-700"
                    checked={item.done}
                    onChange={(e) =>
                      run(() => api.post<EventPlan>("/api/calendar/plan/check", { ...target(event), item: item.text, done: e.target.checked }))
                    }
                  />
                  {item.text}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="text-xs text-red-700 sm:col-span-2">{error}</p>}
    </div>
  );
}
