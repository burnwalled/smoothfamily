"use client";

// Emergency cards: the important facts per member and for the household, readable offline in the
// app. Changed in the family's settings (Safety); in the app each member keeps their own card up to
// date. Guest links (a babysitter, grandparents) are made under the family's settings → Sharing.
import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, Pencil, Plus, Siren, Trash2, UserRoundCheck } from "lucide-react";
import { api, EmergencyCard, EmergencyCards, EmergencyContact, GuestAccess, FamilyList } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/components/Shell";
import { useLive } from "@/lib/live";
import EmergencyCardView from "@/components/EmergencyCardView";
import SettingsLink from "@/components/SettingsLink";

const DURATIONS = [4, 12, 24, 72, 168];

function CardForm({ card, onSaved, onCancel }: { card: EmergencyCard; onSaved: (cards: EmergencyCards) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<EmergencyCard>({ ...card, contacts: card.contacts.length ? card.contacts : [] });
  const [error, setError] = useState("");
  const household = card.user_id === null;

  const field = (key: keyof EmergencyCard, label: string, rows = 2) => (
    <label className="text-xs text-muted">
      {label}
      <textarea
        className="input mt-1 w-full"
        rows={rows}
        value={draft[key] as string}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      />
    </label>
  );

  function setContact(i: number, change: Partial<EmergencyContact>) {
    setDraft({ ...draft, contacts: draft.contacts.map((c, j) => (j === i ? { ...c, ...change } : c)) });
  }

  async function save() {
    setError("");
    const body = {
      allergies: draft.allergies,
      medicines: draft.medicines,
      health_centre: draft.health_centre,
      insurance: draft.insurance,
      contacts: draft.contacts.filter((c) => c.name.trim() && c.phone.trim()),
      routines: draft.routines,
      notes: draft.notes,
      address: draft.address,
    };
    try {
      onSaved(await api.put<EmergencyCards>(household ? "/api/emergency/household" : `/api/emergency/members/${card.user_id}`, body));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {household ? field("address", t("emergency.address")) : field("allergies", t("emergency.allergies"))}
        {!household && field("medicines", t("emergency.medicines"))}
        {!household && field("health_centre", t("emergency.healthCentre"), 1)}
        {!household && field("insurance", t("emergency.insurance"), 1)}
      </div>
      <div>
        <p className="text-xs text-muted">{t("emergency.contacts")}</p>
        <ul className="mt-1 space-y-2">
          {draft.contacts.map((c, i) => (
            <li key={i} className="flex flex-wrap gap-2">
              <input className="input min-w-28 flex-1" placeholder={t("emergency.contactName")} value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} aria-label={t("emergency.contactName")} />
              <input className="input w-36" inputMode="tel" placeholder={t("emergency.contactPhone")} value={c.phone} onChange={(e) => setContact(i, { phone: e.target.value })} aria-label={t("emergency.contactPhone")} />
              <input className="input w-32" placeholder={t("emergency.contactRelation")} value={c.relation} onChange={(e) => setContact(i, { relation: e.target.value })} aria-label={t("emergency.contactRelation")} />
              <button className="btn-ghost px-2" onClick={() => setDraft({ ...draft, contacts: draft.contacts.filter((_, j) => j !== i) })} aria-label={t("common.remove")}>
                <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        {draft.contacts.length < 10 && (
          <button className="mt-2 flex items-center gap-1 text-xs text-accent hover:underline" onClick={() => setDraft({ ...draft, contacts: [...draft.contacts, { name: "", phone: "", relation: "" }] })}>
            <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {t("emergency.addContact")}
          </button>
        )}
      </div>
      {field("routines", household ? t("emergency.houseRoutines") : t("emergency.routines"), 3)}
      {field("notes", t("emergency.notes"))}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary" onClick={save}>{t("profile.save")}</button>
        <button className="btn-ghost" onClick={onCancel}>{t("common.cancel")}</button>
      </div>
    </div>
  );
}

export function GuestLinks() {
  const { t, dateLocale } = useI18n();
  const [guests, setGuests] = useState<GuestAccess[]>([]);
  const [lists, setLists] = useState<FamilyList[]>([]);
  const [form, setForm] = useState({ name: "", hours: 4, calendar: true, lists: [] as string[] });
  const [created, setCreated] = useState<GuestAccess | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.live<GuestAccess[]>("/api/guests", setGuests).catch(() => {});
  }, []);
  useEffect(load, [load]);
  useLive(["guests"], load);
  useEffect(() => {
    api.live<FamilyList[]>("/api/lists", setLists).catch(() => {});
  }, []);

  const when = (iso: string) => new Date(iso).toLocaleString(dateLocale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const duration = (h: number) => (h < 24 ? t("guests.hours", { n: h }) : h === 24 ? t("guests.day") : h === 168 ? t("guests.week") : t("guests.days", { n: h / 24 }));

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  return (
    <section className="card mt-6 p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
        <UserRoundCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
        {t("guests.title")}
      </h2>
      <p className="mb-3 text-xs text-muted">{t("guests.help")}</p>

      {created?.url && (
        <div className="mb-4 rounded-lg border border-accent/40 bg-accent-soft p-3">
          <p className="text-sm font-semibold">{t("guests.created", { name: created.name })}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input className="input min-w-0 flex-1 font-mono text-xs" readOnly value={created.url} aria-label={t("guests.link")} onFocus={(e) => e.target.select()} />
            <button className="btn-ghost flex items-center gap-1 border border-edge" onClick={() => navigator.clipboard?.writeText(created.url ?? "")}>
              <Copy className="h-4 w-4" strokeWidth={2} aria-hidden />
              {t("guests.copy")}
            </button>
          </div>
          {created.qr_svg && (
            // SVG generated by our own backend (qrcode library), not user content.
            <div className="mt-3 h-40 w-40 rounded bg-white p-2 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: created.qr_svg }} />
          )}
          <p className="mt-2 text-xs text-muted">{t("guests.onlyOnce")}</p>
        </div>
      )}

      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.name.trim()) return;
          run(async () => {
            setCreated(await api.post<GuestAccess>("/api/guests", { name: form.name.trim(), hours: form.hours, show_calendar: form.calendar, list_ids: form.lists }));
            setForm({ ...form, name: "" });
          });
        }}
      >
        <label className="text-xs text-muted">
          {t("guests.name")}
          <input className="input mt-1 w-full" value={form.name} maxLength={80} placeholder={t("guests.namePh")} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="text-xs text-muted">
          {t("guests.valid")}
          <select className="input mt-1 w-full" value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })}>
            {DURATIONS.map((h) => <option key={h} value={h}>{duration(h)}</option>)}
          </select>
        </label>
        <div className="text-sm sm:col-span-2">
          <p className="text-xs text-muted">{t("guests.shows")}</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5 text-muted">
              <input type="checkbox" checked disabled className="h-4 w-4" />
              {t("nav.emergency")}
            </span>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={form.calendar} onChange={(e) => setForm({ ...form, calendar: e.target.checked })} />
              {t("guests.calendar")}
            </label>
            {lists.map((l) => (
              <label key={l.id} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary-700"
                  checked={form.lists.includes(l.id)}
                  onChange={(e) => setForm({ ...form, lists: e.target.checked ? [...form.lists, l.id] : form.lists.filter((id) => id !== l.id) })}
                />
                {l.name}
              </label>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <button className="btn-primary flex items-center gap-1.5" disabled={!form.name.trim()}>
            <Link2 className="h-4 w-4" strokeWidth={2} aria-hidden />
            {t("guests.create")}
          </button>
        </div>
      </form>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {guests.length > 0 && (
        <ul className="mt-4 divide-y divide-edge border-t border-edge">
          {guests.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="font-semibold">{g.name}</span>
              <span className={`text-xs ${g.active ? "text-green-700" : "text-muted"}`}>
                {g.revoked_at ? t("guests.revoked") : g.active ? t("guests.until", { when: when(g.expires_at) }) : t("guests.expired")}
              </span>
              <span className="text-xs text-muted">
                {g.visits.length ? t("guests.visits", { n: g.visits.length, when: when(g.visits[0].at) }) : t("guests.notOpened")}
              </span>
              {!g.revoked_at && (
                <span className="ml-auto flex gap-1">
                  <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => run(() => api.post(`/api/guests/${g.id}/extend`, { hours: 24 }))}>
                    {t("guests.extend")}
                  </button>
                  {g.active && (
                    <button className="btn-ghost px-2 py-0.5 text-xs text-red-700" onClick={() => run(() => api.del(`/api/guests/${g.id}`))}>
                      {t("guests.revoke")}
                    </button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Your own card, in the profile (2.9.0). */
export function MyEmergencyCard() {
  const { t } = useI18n();
  const me = useMe();
  const [cards, setCards] = useState<EmergencyCards | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    api.live<EmergencyCards>("/api/emergency", setCards).catch(() => {});
  }, []);
  useEffect(load, [load]);
  useLive(["emergency"], load);

  const card = cards?.members.find((c) => c.user_id === me.id);
  if (!card) return null;
  return (
    <section className="card mt-4 p-5" aria-label={t("emergency.title")}>
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("emergency.title")}</h2>
        {!editing && (
          <button className="btn-ghost ml-auto px-2 py-1" onClick={() => setEditing(true)} aria-label={t("emergency.edit", { name: card.name ?? "" })}>
            <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-muted">{t("profile.emergencyHint")}</p>
      {editing ? (
        <CardForm
          card={card}
          onSaved={(next) => {
            setCards(next);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <EmergencyCardView card={card} />
      )}
    </section>
  );
}

/** The cards: in the app (`manage` off) only your own can be changed; in the settings all of them. */
// `only`: just this member's card (their page in the family's settings, 3.0.4).
export default function Emergency({ manage = false, only }: { manage?: boolean; only?: string }) {
  const { t } = useI18n();
  const me = useMe();
  const adult = me.role === "admin" || me.role === "adult";
  const mayManage = me.role === "admin" || !!me.can_manage_family;
  const [cards, setCards] = useState<EmergencyCards | null>(null);
  // "household", a member id, or null
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(() => {
    api.live<EmergencyCards>("/api/emergency", setCards).catch(() => {});
  }, []);
  useEffect(load, [load]);
  useLive(["emergency", "medicine"], load);

  if (!cards) return <p className="text-sm text-muted">{t("common.loading")}</p>;

  const all: { key: string; title: string; card: EmergencyCard; color?: string | null }[] = [
    { key: "household", title: t("emergency.household"), card: cards.household },
    ...cards.members.map((c) => ({ key: c.user_id as string, title: c.name ?? "", card: c, color: c.color })),
  ].filter((x) => !only || x.key === only);

  return (
    <>
      {!manage && (
        <>
          <h1 className="flex min-h-10 items-center gap-2 text-2xl font-extrabold tracking-tight">
            <Siren className="h-6 w-6 text-red-600" strokeWidth={2} aria-hidden />
            {t("emergency.title")}
          </h1>
          <p className="mt-1 text-sm text-muted">{t("emergency.intro")}</p>
          {mayManage && <SettingsLink href="/settings/members" />}
        </>
      )}
      {manage && <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("emergency.title")}</h2>}

      <div className={only ? "mt-3" : "mt-4 grid gap-4 lg:grid-cols-2"}>
        {all.map(({ key, title, card, color }) => {
          const canEdit = (manage && adult) || key === me.id;
          return (
            <section key={key} className="card p-5" aria-label={title}>
              <div className="mb-3 flex items-center gap-2">
                {color && <span className="h-3 w-3 rounded-full" style={{ background: color }} />}
                <h2 className="text-base font-bold text-ink">{title}</h2>
                {canEdit && editing !== key && (
                  <button className="btn-ghost ml-auto px-2 py-1" onClick={() => setEditing(key)} aria-label={t("emergency.edit", { name: title })}>
                    <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </button>
                )}
              </div>
              {editing === key ? (
                <CardForm
                  card={card}
                  onSaved={(next) => {
                    setCards(next);
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <EmergencyCardView card={card} />
              )}
            </section>
          );
        })}
      </div>

    </>
  );
}
