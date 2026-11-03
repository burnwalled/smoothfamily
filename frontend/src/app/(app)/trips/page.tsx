"use client";

// Trips and holidays: the trips (coming first), and for each an itinerary, packing per traveller
// (with beach / ski / weekend templates), the budget and a checklist before leaving.
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, BedDouble, CheckSquare, Luggage, MapPin, Plane, Plus, Sparkles, Trash2, Wallet } from "lucide-react";
import { api, FamilyDocument, Member, PackTask } from "@/lib/api";
import PackDay from "@/components/PackDay";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { NONE, setApiData, useApi } from "@/lib/query";
import { useMe } from "@/components/Shell";
import PageTitle, { EmptyState } from "@/components/PageTitle";
import AddressInput from "@/components/AddressInput";

type Summary = {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  member_ids: string[];
  budget: number | null;
  notes: string;
  packed: number;
  to_pack: number;
  checks_left: number;
  spent: number;
};
type Detail = Summary & {
  items: { id: string; kind: string; title: string; starts_at: string | null; ends_at: string | null; place: string; notes: string; document_id: string | null }[];
  packing: { id: string; user_id: string | null; text: string; done: boolean }[];
  expenses: { id: string; title: string; amount: number; paid_by: string | null }[];
  checks: { id: string; text: string; done: boolean }[];
  can_plan: boolean;
  pack_tasks: PackTask[];
};

const KIND_ICON = { travel: Plane, stay: BedDouble, activity: Sparkles, other: MapPin };

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Plane; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
        <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

function TripView({ id, members, onBack }: { id: string; members: Member[]; onBack: () => void }) {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  const [item, setItem] = useState({ kind: "activity", title: "", when: "", place: "", document_id: "" });
  const [pack, setPack] = useState<Record<string, string>>({});
  const [expense, setExpense] = useState({ title: "", amount: "" });
  const [check, setCheck] = useState("");
  const [error, setError] = useState("");

  // From the cache; each change below answers with the whole trip, which goes straight into it.
  const tripPath = `/api/trips/${id}`;
  const tripQuery = useApi<Detail>(tripPath);
  const trip = tripQuery.data ?? null;
  const setTrip = (next: Detail) => setApiData<Detail>(tripPath, () => next);
  // A trip that is gone (removed elsewhere): back to the list.
  useEffect(() => {
    if (tripQuery.isError && !tripQuery.data) onBack();
  }, [tripQuery.isError, tripQuery.data, onBack]);
  const docs = useApi<FamilyDocument[]>(me.apps?.includes("documents") ? "/api/documents" : null).data ?? NONE;

  async function run(action: () => Promise<Detail>) {
    setError("");
    try {
      setTrip(await action());
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  if (!trip) return <p className="text-sm text-muted">{t("common.loading")}</p>;
  const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "short", day: "numeric", month: "short" });
  const going = trip.member_ids.length ? members.filter((m) => trip.member_ids.includes(m.id)) : members;
  const packers: { id: string | null; name: string }[] = [{ id: null, name: t("trips.everyone") }, ...going.map((m) => ({ id: m.id, name: m.display_name }))];
  const mayPackFor = (owner: string | null) => trip.can_plan || owner === me.id;
  const name = (id: string | null) => members.find((m) => m.id === id)?.display_name ?? "";

  return (
    <div className="space-y-4">
      <button className="btn-ghost -ml-2 flex items-center gap-1 px-2 text-sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t("trips.all")}
      </button>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-extrabold">{trip.name}</h2>
          <p className="text-sm text-muted">{[trip.destination, `${day(trip.start_date)} – ${day(trip.end_date)}`].filter(Boolean).join(" · ")}</p>
          <p className="text-xs text-muted">{going.map((m) => m.display_name).join(", ")}</p>
        </div>
        {trip.can_plan && (
          <button className="text-xs text-red-700 hover:underline" onClick={() => window.confirm(t("trips.confirmDelete", { name: trip.name })) && api.del(`/api/trips/${trip.id}`).then(onBack)}>
            {t("trips.delete")}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t("trips.plan")} icon={MapPin}>
          {trip.items.length === 0 && <p className="text-sm text-muted">{t("trips.noPlan")}</p>}
          <ul className="space-y-2">
            {trip.items.map((i) => {
              const Icon = KIND_ICON[i.kind as keyof typeof KIND_ICON] ?? MapPin;
              const doc = docs.find((d) => d.id === i.document_id);
              return (
                <li key={i.id} className="flex items-start gap-2 text-sm">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={2} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{i.title}</p>
                    <p className="text-xs text-muted">
                      {[i.starts_at && new Date(i.starts_at).toLocaleString(dateLocale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), i.place].filter(Boolean).join(" · ")}
                    </p>
                    {doc && <a className="text-xs text-accent hover:underline" href="/documents">{t("trips.booking", { title: doc.title })}</a>}
                  </div>
                  {trip.can_plan && (
                    <button className="text-muted hover:text-red-700" onClick={() => run(() => api.del(`/api/trips/${trip.id}/items/${i.id}`) as unknown as Promise<Detail>)} aria-label={t("common.remove")}>
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {trip.can_plan && (
            <form
              className="mt-3 grid gap-2 border-t border-edge pt-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!item.title.trim()) return;
                run(() =>
                  api.post<Detail>(`/api/trips/${trip.id}/items`, {
                    kind: item.kind, title: item.title.trim(), place: item.place.trim(),
                    starts_at: item.when ? new Date(item.when).toISOString() : null, document_id: item.document_id || null,
                  })
                ).then(() => setItem({ kind: "activity", title: "", when: "", place: "", document_id: "" }));
              }}
            >
              <select className="input" value={item.kind} onChange={(e) => setItem({ ...item, kind: e.target.value })} aria-label={t("trips.kind")}>
                {(["travel", "stay", "activity", "other"] as const).map((k) => <option key={k} value={k}>{t(`trips.kind.${k}` as TranslationKey)}</option>)}
              </select>
              <input className="input" value={item.title} maxLength={200} onChange={(e) => setItem({ ...item, title: e.target.value })} placeholder={t("trips.itemPh")} aria-label={t("trips.itemTitle")} />
              <input className="input" type="datetime-local" value={item.when} onChange={(e) => setItem({ ...item, when: e.target.value })} aria-label={t("trips.when")} />
              <input className="input" value={item.place} maxLength={300} onChange={(e) => setItem({ ...item, place: e.target.value })} placeholder={t("trips.placePh")} aria-label={t("trips.place")} />
              {docs.length > 0 && (
                <select className="input sm:col-span-2" value={item.document_id} onChange={(e) => setItem({ ...item, document_id: e.target.value })} aria-label={t("trips.document")}>
                  <option value="">{t("trips.noDocument")}</option>
                  {docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
              )}
              <button className="btn-ghost border border-edge sm:col-span-2">{t("trips.addItem")}</button>
            </form>
          )}
        </Section>

        <Section title={t("trips.packing")} icon={Luggage}>
          {trip.can_plan && (
            <div className="mb-4">
              <PackDay
                tasks={trip.pack_tasks}
                candidates={going}
                defaultIds={going.filter((m) => m.role === "child").map((m) => m.id)}
                defaultDay={new Date(new Date(`${trip.start_date}T12:00:00`).getTime() - 86400000).toISOString().slice(0, 10)}
                lastDay={trip.start_date}
                onSave={(body) => run(() => api.put<Detail>(`/api/trips/${trip.id}/pack-task`, body))}
              />
            </div>
          )}
          <div className="space-y-4">
            {packers.map((p) => {
              const rows = trip.packing.filter((x) => x.user_id === p.id);
              const key = p.id ?? "shared";
              return (
                <div key={key} aria-label={t("trips.packingFor", { name: p.name })} role="group">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{p.name}</p>
                    <span className="text-xs text-muted">{rows.filter((r) => r.done).length}/{rows.length}</span>
                    {mayPackFor(p.id) && (
                      <span className="ml-auto flex gap-1">
                        {(["beach", "ski", "weekend"] as const).map((tpl) => (
                          <button key={tpl} className="rounded-full border border-edge px-2 py-0.5 text-[11px]" onClick={() => run(() => api.post<Detail>(`/api/trips/${trip.id}/packing/template`, { template: tpl, user_id: p.id }))}>
                            + {t(`trips.template.${tpl}` as TranslationKey)}
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                  <ul className="space-y-1">
                    {rows.map((r) => (
                      <li key={r.id} className="flex items-center gap-2 text-sm">
                        <label className={`flex flex-1 items-center gap-2 ${r.done ? "text-muted line-through" : ""}`}>
                          <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={r.done} disabled={!mayPackFor(r.user_id)} onChange={(e) => run(() => api.put<Detail>(`/api/trips/${trip.id}/packing/${r.id}`, { done: e.target.checked }))} />
                          {r.text}
                        </label>
                        {mayPackFor(r.user_id) && (
                          <button className="text-xs text-muted hover:text-red-700" onClick={() => run(() => api.del(`/api/trips/${trip.id}/packing/${r.id}`) as unknown as Promise<Detail>)} aria-label={t("common.remove")}>×</button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {mayPackFor(p.id) && (
                    <form
                      className="mt-1 flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!pack[key]?.trim()) return;
                        run(() => api.post<Detail>(`/api/trips/${trip.id}/packing`, { text: pack[key].trim(), user_id: p.id })).then(() => setPack({ ...pack, [key]: "" }));
                      }}
                    >
                      <input className="input flex-1 py-1 text-sm" value={pack[key] ?? ""} maxLength={120} onChange={(e) => setPack({ ...pack, [key]: e.target.value })} placeholder={t("trips.packPh")} aria-label={t("trips.packFor", { name: p.name })} />
                      <button className="btn-ghost border border-edge px-2"><Plus className="h-4 w-4" aria-hidden /></button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {trip.can_plan && (
          <Section title={t("trips.budget")} icon={Wallet}>
            <p className="text-sm">
              <span className="text-2xl font-extrabold">{Math.round(trip.spent).toLocaleString(dateLocale)}</span>
              {trip.budget !== null && <span className="text-muted"> / {Math.round(trip.budget).toLocaleString(dateLocale)}</span>}
            </p>
            {trip.budget !== null && trip.budget > 0 && (
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-base">
                <div className={`h-full rounded-full ${trip.spent > trip.budget ? "bg-red-600" : "bg-accent"}`} style={{ width: `${Math.min(100, (trip.spent / trip.budget) * 100)}%` }} />
              </div>
            )}
            <ul className="mt-3 space-y-1 text-sm">
              {trip.expenses.map((x) => (
                <li key={x.id} className="flex items-center gap-2">
                  <span className="flex-1">{x.title}</span>
                  <span className="text-xs text-muted">{name(x.paid_by)}</span>
                  <span className="font-semibold">{x.amount.toLocaleString(dateLocale)}</span>
                  <button className="text-xs text-muted hover:text-red-700" onClick={() => run(() => api.del(`/api/trips/${trip.id}/expenses/${x.id}`) as unknown as Promise<Detail>)} aria-label={t("common.remove")}>×</button>
                </li>
              ))}
            </ul>
            <form
              className="mt-3 flex flex-wrap gap-2 border-t border-edge pt-3"
              onSubmit={(e) => {
                e.preventDefault();
                const amount = Number(expense.amount.replace(",", "."));
                if (!expense.title.trim() || !(amount > 0)) return;
                run(() => api.post<Detail>(`/api/trips/${trip.id}/expenses`, { title: expense.title.trim(), amount })).then(() => setExpense({ title: "", amount: "" }));
              }}
            >
              <input className="input min-w-32 flex-1" value={expense.title} maxLength={120} onChange={(e) => setExpense({ ...expense, title: e.target.value })} placeholder={t("trips.expensePh")} aria-label={t("trips.expense")} />
              <input className="input w-28" inputMode="decimal" value={expense.amount} onChange={(e) => setExpense({ ...expense, amount: e.target.value })} placeholder="0" aria-label={t("trips.amount")} />
              <button className="btn-ghost border border-edge">{t("trips.addExpense")}</button>
            </form>
          </Section>
        )}

        <Section title={t("trips.checklist")} icon={CheckSquare}>
          <ul className="space-y-1">
            {trip.checks.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm">
                <label className={`flex flex-1 items-center gap-2 ${c.done ? "text-muted line-through" : ""}`}>
                  <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={c.done} onChange={(e) => run(() => api.put<Detail>(`/api/trips/${trip.id}/checks/${c.id}`, { done: e.target.checked }))} />
                  {c.text}
                </label>
                <button className="text-xs text-muted hover:text-red-700" onClick={() => run(() => api.del(`/api/trips/${trip.id}/checks/${c.id}`) as unknown as Promise<Detail>)} aria-label={t("common.remove")}>×</button>
              </li>
            ))}
          </ul>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!check.trim()) return;
              run(() => api.post<Detail>(`/api/trips/${trip.id}/checks`, { text: check.trim() })).then(() => setCheck(""));
            }}
          >
            <input className="input flex-1" value={check} maxLength={120} onChange={(e) => setCheck(e.target.value)} placeholder={t("trips.checkPh")} aria-label={t("trips.addCheck")} />
            <button className="btn-ghost border border-edge px-2"><Plus className="h-4 w-4" aria-hidden /></button>
          </form>
        </Section>
      </div>
    </div>
  );
}

export default function TripsPage() {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  const adult = me.role === "admin" || me.role === "adult";
  const tripsQuery = useApi<Summary[]>("/api/trips");
  const trips = tripsQuery.data ?? (tripsQuery.isError ? NONE : null);
  const members = useApi<Member[]>("/api/family/members").data ?? NONE;
  // A packing task links here with ?trip=…
  const [open, setOpen] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("trip")));
  const [form, setForm] = useState<{ name: string; destination: string; start: string; end: string; budget: string; members: string[] } | null>(null);
  const [error, setError] = useState("");

  const back = useCallback(() => setOpen(null), []);

  async function create() {
    if (!form) return;
    setError("");
    try {
      const created = await api.post<Detail>("/api/trips", {
        name: form.name.trim(), destination: form.destination.trim(), start_date: form.start, end_date: form.end || form.start,
        member_ids: form.members, budget: form.budget ? Number(form.budget.replace(",", ".")) : null,
      });
      setForm(null);
      setOpen(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(dateLocale, { day: "numeric", month: "short" });
  const daysTo = (iso: string) => Math.round((new Date(`${iso}T12:00:00`).getTime() - new Date().setHours(12, 0, 0, 0)) / 86_400_000);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle title={t("trips.title")} />
        {adult && !open && !form && (
          <button className="btn-primary flex items-center gap-1.5" onClick={() => setForm({ name: "", destination: "", start: "", end: "", budget: "", members: [] })}>
            <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            {t("trips.new")}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      <div className="mt-4">
        {open ? (
          <TripView id={open} members={members} onBack={back} />
        ) : form ? (
          <section className="card space-y-3 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-muted">{t("trips.name")}<input className="input mt-1 w-full" value={form.name} maxLength={120} placeholder={t("trips.namePh")} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label className="text-xs text-muted">{t("trips.destination")}<AddressInput className="input mt-1 w-full" value={form.destination} maxLength={200} onChange={(destination) => setForm({ ...form, destination })} /></label>
              <label className="text-xs text-muted">{t("trips.from")}<input className="input mt-1 w-full" type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value, end: form.end || e.target.value })} /></label>
              <label className="text-xs text-muted">{t("trips.to")}<input className="input mt-1 w-full" type="date" value={form.end} min={form.start} onChange={(e) => setForm({ ...form, end: e.target.value })} /></label>
              <label className="text-xs text-muted">{t("trips.budget")}<input className="input mt-1 w-full" inputMode="decimal" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></label>
            </div>
            <div>
              <p className="text-xs text-muted">{t("trips.who")}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={form.members.includes(m.id)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${form.members.includes(m.id) ? "border-primary-700 bg-accent-soft font-semibold" : "border-edge"}`}
                    onClick={() => setForm({ ...form, members: form.members.includes(m.id) ? form.members.filter((x) => x !== m.id) : [...form.members, m.id] })}
                  >
                    {m.display_name}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">{t("trips.whoHint")}</p>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary" disabled={!form.name.trim() || !form.start} onClick={create}>{t("trips.create")}</button>
              <button className="btn-ghost" onClick={() => setForm(null)}>{t("common.cancel")}</button>
            </div>
          </section>
        ) : trips === null ? (
          <p className="text-sm text-muted">{t("common.loading")}</p>
        ) : trips.length === 0 ? (
          <EmptyState>{t("trips.empty")}</EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {trips.map((trip) => {
              const until = daysTo(trip.start_date);
              const past = daysTo(trip.end_date) < 0;
              return (
                <li key={trip.id}>
                  <button className={`card w-full p-4 text-left hover:ring-1 hover:ring-accent ${past ? "opacity-60" : ""}`} onClick={() => setOpen(trip.id)}>
                    <p className="font-bold">{trip.name}</p>
                    <p className="text-sm text-muted">{[trip.destination, `${day(trip.start_date)} – ${day(trip.end_date)}`].filter(Boolean).join(" · ")}</p>
                    <p className="mt-2 text-xs font-semibold text-accent">
                      {past ? t("trips.past") : until > 0 ? t("trips.inDays", { n: until }) : t("trips.now")}
                    </p>
                    {!past && (
                      <p className="mt-1 text-xs text-muted">{t("trips.progress", { packed: trip.packed, total: trip.packed + trip.to_pack, checks: trip.checks_left })}</p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
