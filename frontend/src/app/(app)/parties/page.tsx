"use client";

// Parties (3.4.0): plan a child's birthday party, a celebration or a dinner together. One shared
// invitation page for the guests (RSVP with an optional +1, the wish list if chosen, the thank-you
// page with the photos afterwards); for the adults the replies with the allergies gathered, a
// checklist with reminders, the budget and the day's timeline. Adults only – the wish list's
// reservations are here.
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CalendarHeart, Check, Copy, Gift, Heart, ListChecks, Plus, Share2, Trash2, Users, Wallet, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { NONE, setApiData, useApi } from "@/lib/query";
import { useMe } from "@/components/Shell";
import PageTitle, { EmptyState } from "@/components/PageTitle";

type Summary = { id: string; title: string; kind: string; emoji: string; color: string; starts_at: string; place: string; coming: number; replies: number; tasks_left: number };
type Guest = { id: string; first_name: string; last_name: string; coming: boolean; allergies: string; message: string; plus_first_name: string | null; plus_last_name: string | null; plus_allergies: string };
type Detail = {
  id: string; title: string; kind: string; person_id: string | null; starts_at: string; ends_at: string; place: string; address: string; theme: string;
  emoji: string; color: string; invitation: string; rsvp_by: string | null; plus_one: boolean; show_guests: "none" | "count" | "names"; wishlist: boolean;
  budget: number | null; spent: number; thanks_text: string; thanks_album_id: string | null; thanks_published: boolean; link: string; qr_svg: string;
  guests: Guest[]; coming: number; not_coming: number; allergies: { name: string; allergies: string }[];
  tasks: { id: string; title: string; due_date: string | null; done: boolean; who: string | null }[];
  expenses: { id: string; title: string; amount: number; paid_by: string | null }[];
  steps: { id: string; at: string; title: string }[];
  wishes: { id: string; title: string; reserved: boolean; reserved_by: string | null }[];
};
type Person = { id: string; name: string };
type Album = { id: string; name: string };

const KINDS = ["child_birthday", "birthday", "party", "dinner"] as const;
const EMOJIS: Record<string, string> = { child_birthday: "🎈", birthday: "🎂", party: "🎉", dinner: "🍽️" };
const TABS = ["invite", "guests", "tasks", "budget", "timeline", "thanks"] as const;
type Tab = (typeof TABS)[number];
const TAB_ICONS: Record<Tab, typeof Users> = { invite: CalendarHeart, guests: Users, tasks: ListChecks, budget: Wallet, timeline: Clock, thanks: Heart };

const localInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function PartiesPage() {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  const params = useSearchParams();
  const router = useRouter();
  const open = params.get("id");
  const parties = useApi<Summary[]>(me.role === "child" ? null : "/api/parties").data;
  const [creating, setCreating] = useState(false);

  if (me.role === "child") return <EmptyState>{t("parties.adultsOnly")}</EmptyState>;
  if (open) return <PartyView id={open} onBack={() => router.push("/parties")} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle title={t("nav.parties")} icon={CalendarHeart} />
        {!creating && (
          <button className="btn-primary flex items-center gap-1.5" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            {t("parties.new")}
          </button>
        )}
      </div>
      <p className="text-sm text-muted">{t("parties.intro")}</p>
      {creating && <NewParty onDone={(id) => (id ? router.push(`/parties?id=${id}`) : setCreating(false))} />}
      {parties && parties.length === 0 && !creating && <EmptyState>{t("parties.none")}</EmptyState>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {(parties ?? NONE).map((p) => (
          <li key={p.id}>
            <button className="card w-full p-4 text-left hover:bg-surface" onClick={() => router.push(`/parties?id=${p.id}`)}>
              <span className="flex items-center gap-2 text-lg font-bold">
                <span aria-hidden>{p.emoji}</span>
                {p.title}
              </span>
              <span className="block text-sm text-muted">
                {new Date(p.starts_at).toLocaleString(dateLocale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                {p.place ? ` · ${p.place}` : ""}
              </span>
              <span className="mt-2 flex gap-3 text-xs text-muted">
                <span>{t("parties.comingN", { n: p.coming })}</span>
                <span>{t("parties.tasksLeft", { n: p.tasks_left })}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewParty({ onDone }: { onDone: (id: string | null) => void }) {
  const { t } = useI18n();
  const people = useApi<Person[]>("/api/birthdays/people").data ?? NONE;
  const start = new Date();
  start.setDate(start.getDate() + 21);
  start.setHours(14, 0, 0, 0);
  const [form, setForm] = useState({ title: "", kind: "child_birthday" as string, person_id: "", starts: localInput(start.toISOString()), hours: 2, place: "", address: "", rsvp: "", plus_one: false, wishlist: false, show_guests: "count" });
  const [error, setError] = useState("");
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function create() {
    setError("");
    try {
      const starts = new Date(form.starts);
      const ends = new Date(starts.getTime() + form.hours * 3_600_000);
      const made = await api.post<Detail>("/api/parties", {
        title: form.title.trim(), kind: form.kind, person_id: form.person_id || null, emoji: EMOJIS[form.kind],
        starts_at: starts.toISOString(), ends_at: ends.toISOString(), place: form.place, address: form.address,
        rsvp_by: form.rsvp || null, plus_one: form.plus_one, wishlist: form.wishlist && !!form.person_id, show_guests: form.show_guests,
      });
      onDone(made.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  return (
    <section className="card grid gap-3 p-5 sm:grid-cols-2" aria-label={t("parties.new")}>
      <label className="sm:col-span-2">
        <span className="label">{t("parties.name")}</span>
        <input className="input" value={form.title} maxLength={160} placeholder={t("parties.namePh")} onChange={(e) => set({ title: e.target.value })} />
      </label>
      <label>
        <span className="label">{t("parties.kind")}</span>
        <select className="input" value={form.kind} onChange={(e) => set({ kind: e.target.value })}>
          {KINDS.map((k) => <option key={k} value={k}>{`${EMOJIS[k]} ${t(`parties.kind.${k}` as TranslationKey)}`}</option>)}
        </select>
      </label>
      <label>
        <span className="label">{t("parties.whose")}</span>
        <select className="input" value={form.person_id} onChange={(e) => set({ person_id: e.target.value })}>
          <option value="">{t("parties.nobody")}</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label>
        <span className="label">{t("parties.when")}</span>
        <input className="input" type="datetime-local" value={form.starts} onChange={(e) => set({ starts: e.target.value })} />
      </label>
      <label>
        <span className="label">{t("parties.hours")}</span>
        <input className="input" type="number" min={1} max={24} step={0.5} value={form.hours} onChange={(e) => set({ hours: Number(e.target.value) })} />
      </label>
      <label>
        <span className="label">{t("parties.place")}</span>
        <input className="input" value={form.place} maxLength={200} onChange={(e) => set({ place: e.target.value })} />
      </label>
      <label>
        <span className="label">{t("parties.address")}</span>
        <input className="input" value={form.address} maxLength={300} onChange={(e) => set({ address: e.target.value })} />
      </label>
      <label>
        <span className="label">{t("parties.rsvpBy")}</span>
        <input className="input" type="date" value={form.rsvp} onChange={(e) => set({ rsvp: e.target.value })} />
      </label>
      <label>
        <span className="label">{t("parties.showGuests")}</span>
        <select className="input" value={form.show_guests} onChange={(e) => set({ show_guests: e.target.value })}>
          {(["none", "count", "names"] as const).map((v) => <option key={v} value={v}>{t(`parties.show.${v}` as TranslationKey)}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={form.plus_one} onChange={(e) => set({ plus_one: e.target.checked })} />
        {t("parties.plusOne")}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-primary-700" disabled={!form.person_id} checked={form.wishlist && !!form.person_id} onChange={(e) => set({ wishlist: e.target.checked })} />
        {t("parties.wishlist")}
      </label>
      {error && <p className="text-sm text-red-700 sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn-primary" disabled={!form.title.trim() || !form.starts} onClick={create}>{t("parties.create")}</button>
        <button className="btn-ghost" onClick={() => onDone(null)}>{t("common.cancel")}</button>
      </div>
    </section>
  );
}

function PartyView({ id, onBack }: { id: string; onBack: () => void }) {
  const { t, dateLocale } = useI18n();
  const path = `/api/parties/${id}`;
  const party = useApi<Detail>(path).data;
  const [tab, setTab] = useState<Tab>("invite");
  const [error, setError] = useState("");

  async function run(action: () => Promise<Detail>) {
    setError("");
    try {
      const next = await action();
      setApiData<Detail>(path, () => next);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }
  const change = (patch: Record<string, unknown>) => run(() => api.put<Detail>(path, patch));

  if (!party) return <p className="text-sm text-muted">{t("common.loading")}</p>;
  const when = new Date(party.starts_at).toLocaleString(dateLocale, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-4">
      <button className="btn-ghost -ml-2 flex items-center gap-1 px-2 text-sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t("parties.all")}
      </button>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold"><span aria-hidden>{party.emoji}</span>{party.title}</h1>
          <p className="text-sm text-muted">{[when, party.place].filter(Boolean).join(" · ")}</p>
          <p className="text-xs text-muted">{t("parties.replies", { coming: party.coming, not: party.not_coming })}</p>
        </div>
        <button className="text-xs text-red-700 hover:underline" onClick={() => window.confirm(t("parties.confirmDelete", { title: party.title })) && api.del(path).then(onBack)}>
          {t("parties.delete")}
        </button>
      </div>
      <nav className="flex flex-wrap gap-1 border-b border-edge" aria-label={t("nav.parties")}>
        {TABS.map((x) => {
          const Icon = TAB_ICONS[x];
          return (
            <button key={x} aria-current={tab === x ? "page" : undefined} onClick={() => setTab(x)} className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${tab === x ? "border-accent font-semibold" : "border-transparent text-muted hover:text-ink"}`}>
              <Icon className="h-4 w-4" aria-hidden />
              {t(`parties.tab.${x}` as TranslationKey)}
            </button>
          );
        })}
      </nav>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {tab === "invite" && <InviteTab party={party} change={change} newLink={() => run(() => api.post<Detail>(`${path}/link`))} />}
      {tab === "guests" && <GuestsTab party={party} run={run} path={path} />}
      {tab === "tasks" && <TasksTab party={party} run={run} path={path} />}
      {tab === "budget" && <BudgetTab party={party} run={run} path={path} change={change} />}
      {tab === "timeline" && <TimelineTab party={party} run={run} path={path} />}
      {tab === "thanks" && <ThanksTab party={party} change={change} />}
    </div>
  );
}

type TabProps = { party: Detail; run: (a: () => Promise<Detail>) => Promise<void>; path: string };

function InviteTab({ party, change, newLink }: { party: Detail; change: (p: Record<string, unknown>) => Promise<void>; newLink: () => void }) {
  const { t, dateLocale } = useI18n();
  const [draft, setDraft] = useState({ title: party.title, invitation: party.invitation, place: party.place, address: party.address, theme: party.theme, starts: localInput(party.starts_at), ends: localInput(party.ends_at), rsvp: party.rsvp_by ?? "" });
  const [copied, setCopied] = useState(false);
  useEffect(() => setDraft({ title: party.title, invitation: party.invitation, place: party.place, address: party.address, theme: party.theme, starts: localInput(party.starts_at), ends: localInput(party.ends_at), rsvp: party.rsvp_by ?? "" }), [party]);
  const when = new Date(party.starts_at).toLocaleString(dateLocale, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const message = t("parties.shareText", { title: party.title, when, link: party.link });

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: party.title, text: message });
        return;
      }
    } catch {
      return;
    }
    await navigator.clipboard?.writeText(message);
    setCopied(true);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
      <section className="card grid gap-3 p-5 sm:grid-cols-2" aria-label={t("parties.tab.invite")}>
        <label className="sm:col-span-2"><span className="label">{t("parties.name")}</span><input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
        <label><span className="label">{t("parties.when")}</span><input className="input" type="datetime-local" value={draft.starts} onChange={(e) => setDraft({ ...draft, starts: e.target.value })} /></label>
        <label><span className="label">{t("parties.ends")}</span><input className="input" type="datetime-local" value={draft.ends} onChange={(e) => setDraft({ ...draft, ends: e.target.value })} /></label>
        <label><span className="label">{t("parties.place")}</span><input className="input" value={draft.place} onChange={(e) => setDraft({ ...draft, place: e.target.value })} /></label>
        <label><span className="label">{t("parties.address")}</span><input className="input" value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></label>
        <label><span className="label">{t("parties.theme")}</span><input className="input" value={draft.theme} onChange={(e) => setDraft({ ...draft, theme: e.target.value })} /></label>
        <label><span className="label">{t("parties.rsvpBy")}</span><input className="input" type="date" value={draft.rsvp} onChange={(e) => setDraft({ ...draft, rsvp: e.target.value })} /></label>
        <label className="sm:col-span-2"><span className="label">{t("parties.invitation")}</span><textarea className="input min-h-28" value={draft.invitation} maxLength={4000} placeholder={t("parties.invitationPh")} onChange={(e) => setDraft({ ...draft, invitation: e.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary-700" checked={party.plus_one} onChange={(e) => change({ plus_one: e.target.checked })} />{t("parties.plusOne")}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary-700" disabled={!party.person_id} checked={party.wishlist} onChange={(e) => change({ wishlist: e.target.checked })} />{t("parties.wishlist")}</label>
        <label>
          <span className="label">{t("parties.showGuests")}</span>
          <select className="input" value={party.show_guests} onChange={(e) => change({ show_guests: e.target.value })}>
            {(["none", "count", "names"] as const).map((v) => <option key={v} value={v}>{t(`parties.show.${v}` as TranslationKey)}</option>)}
          </select>
        </label>
        <div className="flex items-end">
          <button className="btn-primary" onClick={() => change({ title: draft.title, invitation: draft.invitation, place: draft.place, address: draft.address, theme: draft.theme, starts_at: new Date(draft.starts).toISOString(), ends_at: new Date(draft.ends).toISOString(), rsvp_by: draft.rsvp || null })}>
            {t("common.save")}
          </button>
        </div>
      </section>
      <section className="card space-y-3 p-5 lg:w-80" aria-label={t("parties.share")}>
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("parties.share")}</h2>
        <p className="text-xs text-muted">{t("parties.shareHelp")}</p>
        <div className="mx-auto w-44 rounded-lg bg-white p-2" aria-label={t("parties.qr")} dangerouslySetInnerHTML={{ __html: party.qr_svg }} />
        <input className="input text-xs" readOnly value={party.link} aria-label={t("parties.link")} onFocus={(e) => e.target.select()} />
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary flex items-center gap-1.5" onClick={share}><Share2 className="h-4 w-4" aria-hidden />{t("parties.shareButton")}</button>
          <button className="btn-ghost flex items-center gap-1.5" onClick={() => navigator.clipboard?.writeText(party.link).then(() => setCopied(true))}><Copy className="h-4 w-4" aria-hidden />{t("parties.copy")}</button>
        </div>
        {copied && <p className="text-xs text-accent" role="status">{t("parties.copied")}</p>}
        <a className="block text-xs text-accent hover:underline" href={party.link} target="_blank" rel="noreferrer">{t("parties.preview")}</a>
        <button className="text-xs text-muted hover:underline" onClick={() => window.confirm(t("parties.newLinkConfirm")) && newLink()}>{t("parties.newLink")}</button>
      </section>
    </div>
  );
}

function GuestsTab({ party, run, path }: TabProps) {
  const { t } = useI18n();
  const [form, setForm] = useState({ first_name: "", last_name: "", coming: true, allergies: "" });
  const people = party.guests;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <section className="card p-5" aria-label={t("parties.tab.guests")}>
        <p className="mb-3 text-sm font-semibold">{t("parties.replies", { coming: party.coming, not: party.not_coming })}</p>
        {people.length === 0 ? (
          <EmptyState>{t("parties.noReplies")}</EmptyState>
        ) : (
          <ul className="divide-y divide-edge text-sm">
            {people.map((g) => (
              <li key={g.id} className="flex items-start gap-3 py-2">
                <span className={`mt-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${g.coming ? "bg-green-50 text-green-800" : "bg-base text-muted"}`}>{g.coming ? t("parties.yes") : t("parties.no")}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{`${g.first_name} ${g.last_name}`.trim()}</span>
                  {g.allergies && <span className="text-muted"> · {g.allergies}</span>}
                  {g.plus_first_name && <span className="block text-xs text-muted">+1: {`${g.plus_first_name} ${g.plus_last_name ?? ""}`.trim()}{g.plus_allergies ? ` · ${g.plus_allergies}` : ""}</span>}
                  {g.message && <span className="block text-xs italic text-muted">“{g.message}”</span>}
                </span>
                <button className="text-muted hover:text-red-700" aria-label={t("parties.removeGuest", { name: g.first_name })} onClick={() => run(() => api.del(`${path}/guests/${g.id}`).then(() => api.get<Detail>(path)))}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="space-y-4">
        <section className="card p-5" aria-label={t("parties.allergies")}>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{t("parties.allergies")}</h2>
          {party.allergies.length === 0 ? <p className="text-sm text-muted">{t("parties.noAllergies")}</p> : (
            <ul className="space-y-1 text-sm">{party.allergies.map((a) => <li key={a.name}><span className="font-semibold">{a.name}:</span> {a.allergies}</li>)}</ul>
          )}
        </section>
        <section className="card space-y-2 p-5" aria-label={t("parties.addGuest")}>
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("parties.addGuest")}</h2>
          <p className="text-xs text-muted">{t("parties.addGuestHelp")}</p>
          <input className="input" placeholder={t("parties.firstName")} aria-label={t("parties.firstName")} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          <input className="input" placeholder={t("parties.lastName")} aria-label={t("parties.lastName")} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          <input className="input" placeholder={t("parties.allergiesPh")} aria-label={t("parties.allergiesLabel")} value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary-700" checked={form.coming} onChange={(e) => setForm({ ...form, coming: e.target.checked })} />{t("parties.coming")}</label>
          <button className="btn-primary" disabled={!form.first_name.trim()} onClick={() => run(() => api.post<Detail>(`${path}/guests`, form)).then(() => setForm({ first_name: "", last_name: "", coming: true, allergies: "" }))}>{t("parties.add")}</button>
        </section>
      </div>
    </div>
  );
}

function TasksTab({ party, run, path }: TabProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  return (
    <section className="card p-5" aria-label={t("parties.tab.tasks")}>
      <p className="mb-3 text-xs text-muted">{t("parties.tasksHelp")}</p>
      <ul className="divide-y divide-edge">
        {party.tasks.map((task) => (
          <li key={task.id} className="flex items-center gap-3 py-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-primary-700" aria-label={task.title} checked={task.done} onChange={(e) => run(() => api.put<Detail>(`${path}/tasks/${task.id}`, { done: e.target.checked }))} />
            <span className={`flex-1 ${task.done ? "text-muted line-through" : ""}`}>{task.title}</span>
            <input className="input !w-auto py-0.5 text-xs" type="date" aria-label={t("parties.due")} value={task.due_date ?? ""} onChange={(e) => run(() => api.put<Detail>(`${path}/tasks/${task.id}`, { due_date: e.target.value || null }))} />
            <button className="text-muted hover:text-red-700" aria-label={t("common.remove")} onClick={() => run(() => api.del(`${path}/tasks/${task.id}`).then(() => api.get<Detail>(path)))}><Trash2 className="h-4 w-4" aria-hidden /></button>
          </li>
        ))}
      </ul>
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (title.trim()) void run(() => api.post<Detail>(`${path}/tasks`, { title, due_date: due || null })).then(() => { setTitle(""); setDue(""); }); }}>
        <input className="input flex-1" placeholder={t("parties.newTask")} aria-label={t("parties.newTask")} value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="input !w-auto" type="date" aria-label={t("parties.due")} value={due} onChange={(e) => setDue(e.target.value)} />
        <button className="btn-primary flex items-center gap-1" type="submit" disabled={!title.trim()}><Plus className="h-4 w-4" aria-hidden />{t("parties.add")}</button>
      </form>
      {party.tasks.length > 0 && <p className="mt-2 text-xs text-muted">{t("parties.tasksDone", { n: party.tasks.filter((x) => x.done).length, total: party.tasks.length })}</p>}
    </section>
  );
}

function BudgetTab({ party, run, path, change }: TabProps & { change: (p: Record<string, unknown>) => Promise<void> }) {
  const { t, dateLocale } = useI18n();
  const [form, setForm] = useState({ title: "", amount: "" });
  const [budget, setBudget] = useState(party.budget?.toString() ?? "");
  const money = (n: number) => n.toLocaleString(dateLocale, { maximumFractionDigits: 2 });
  const left = party.budget != null ? party.budget - party.spent : null;
  return (
    <section className="card space-y-3 p-5" aria-label={t("parties.tab.budget")}>
      <div className="flex flex-wrap items-end gap-2">
        <label><span className="label">{t("parties.budget")}</span><input className="input !w-40" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
        <button className="btn-ghost border border-edge" onClick={() => change({ budget: budget ? Number(budget.replace(",", ".")) : null })}>{t("common.save")}</button>
      </div>
      <p className="text-sm">
        {t("parties.spent", { spent: money(party.spent) })}
        {left != null && <span className={left < 0 ? "font-semibold text-red-700" : "text-muted"}> · {left < 0 ? t("parties.over", { n: money(-left) }) : t("parties.left", { n: money(left) })}</span>}
      </p>
      {party.budget != null && party.budget > 0 && (
        <div className="h-2 overflow-hidden rounded-full bg-base"><div className={`h-full rounded-full ${left != null && left < 0 ? "bg-red-600" : "bg-accent"}`} style={{ width: `${Math.min(100, (party.spent / party.budget) * 100)}%` }} /></div>
      )}
      <ul className="divide-y divide-edge text-sm">
        {party.expenses.map((x) => (
          <li key={x.id} className="flex items-center gap-2 py-1.5">
            <span className="flex-1">{x.title}</span>
            <span className="tabular-nums">{money(x.amount)}</span>
            <button className="text-muted hover:text-red-700" aria-label={t("common.remove")} onClick={() => run(() => api.del(`${path}/expenses/${x.id}`).then(() => api.get<Detail>(path)))}><Trash2 className="h-4 w-4" aria-hidden /></button>
          </li>
        ))}
      </ul>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); const amount = Number(form.amount.replace(",", ".")); if (form.title.trim() && amount > 0) void run(() => api.post<Detail>(`${path}/expenses`, { title: form.title, amount })).then(() => setForm({ title: "", amount: "" })); }}>
        <input className="input flex-1" placeholder={t("parties.expensePh")} aria-label={t("parties.expense")} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <input className="input !w-28" inputMode="decimal" placeholder={t("parties.amount")} aria-label={t("parties.amount")} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <button className="btn-primary" type="submit">{t("parties.add")}</button>
      </form>
    </section>
  );
}

function TimelineTab({ party, run, path }: TabProps) {
  const { t } = useI18n();
  const [form, setForm] = useState({ at: "", title: "" });
  return (
    <section className="card p-5" aria-label={t("parties.tab.timeline")}>
      <p className="mb-3 text-xs text-muted">{t("parties.timelineHelp")}</p>
      <ol className="space-y-1.5 text-sm">
        {party.steps.map((s) => (
          <li key={s.id} className="flex items-center gap-3">
            <span className="w-12 font-bold tabular-nums">{s.at}</span>
            <span className="flex-1">{s.title}</span>
            <button className="text-muted hover:text-red-700" aria-label={t("common.remove")} onClick={() => run(() => api.del(`${path}/steps/${s.id}`).then(() => api.get<Detail>(path)))}><Trash2 className="h-4 w-4" aria-hidden /></button>
          </li>
        ))}
      </ol>
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (form.at && form.title.trim()) void run(() => api.post<Detail>(`${path}/steps`, form)).then(() => setForm({ at: "", title: "" })); }}>
        <input className="input !w-28" type="time" aria-label={t("parties.time")} value={form.at} onChange={(e) => setForm({ ...form, at: e.target.value })} />
        <input className="input flex-1" placeholder={t("parties.stepPh")} aria-label={t("parties.step")} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <button className="btn-primary" type="submit">{t("parties.add")}</button>
      </form>
    </section>
  );
}

function ThanksTab({ party, change }: { party: Detail; change: (p: Record<string, unknown>) => Promise<void> }) {
  const { t } = useI18n();
  const albums = useApi<Album[]>("/api/albums").data ?? NONE;
  const [text, setText] = useState(party.thanks_text);
  return (
    <section className="card space-y-3 p-5" aria-label={t("parties.tab.thanks")}>
      <p className="text-xs text-muted">{t("parties.thanksHelp")}</p>
      <label className="block"><span className="label">{t("parties.thanksText")}</span><textarea className="input min-h-24" value={text} maxLength={4000} placeholder={t("parties.thanksPh")} onChange={(e) => setText(e.target.value)} /></label>
      <label className="block">
        <span className="label">{t("parties.album")}</span>
        <select className="input" value={party.thanks_album_id ?? ""} onChange={(e) => change({ thanks_album_id: e.target.value || null })}>
          <option value="">{t("parties.noAlbum")}</option>
          {albums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-ghost border border-edge" onClick={() => change({ thanks_text: text })}>{t("common.save")}</button>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary-700" checked={party.thanks_published} onChange={(e) => change({ thanks_text: text, thanks_published: e.target.checked })} />{t("parties.publishThanks")}</label>
        {party.thanks_published && <span className="flex items-center gap-1 text-xs text-accent"><Check className="h-3.5 w-3.5" aria-hidden />{t("parties.thanksLive")}</span>}
      </div>
      {party.wishlist && party.wishes.length > 0 && (
        <div className="border-t border-edge pt-3">
          <h3 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted"><Gift className="h-3.5 w-3.5" aria-hidden />{t("parties.wishesBought")}</h3>
          <ul className="text-sm">{party.wishes.map((w) => <li key={w.id}>{w.title}{w.reserved_by ? <span className="text-muted"> · {w.reserved_by}</span> : w.reserved ? <span className="text-muted"> · ✓</span> : null}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
