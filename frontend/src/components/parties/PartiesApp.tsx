"use client";

// Parties (3.4.0): plan a child's birthday party, a celebration, a dinner, a match night, a barbecue
// or a day outdoors together. One shared invitation page for the guests (the reply with whoever
// they bring, a vote on the date if it's open, the wish list if chosen, the thank-you
// page with the photos afterwards); for the adults the replies with the allergies gathered, a
// checklist with reminders, the budget and the day's timeline. Adults only – the wish list's
// reservations are here.
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarHeart, Check, Circle, Mic, PartyPopper, Copy, Eye, EyeOff, Gift, ImagePlus, Link2, ListChecks, Mail, Monitor, Palette, Plus, Printer, Share2, Smartphone, Trash2, Users, Wallet, Clock, X } from "lucide-react";
import { api, uploadFile } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { NONE, setApiData, useApi } from "@/lib/query";
import { useMe } from "@/components/Shell";
import PageTitle, { EmptyState } from "@/components/PageTitle";
import ThemePicker from "@/components/parties/ThemePicker";
import { CustomTheme, customTheme, kindTheme, partyTheme, themeStyle } from "@/lib/partyThemes";
import PosterEditor from "@/components/parties/PosterEditor";
import TemplatePicker from "@/components/parties/TemplatePicker";
import GuestImport from "@/components/parties/GuestImport";
import PartyChat from "@/components/parties/PartyChat";
import { CheckinCard, GuestOptions, Helpers, MailTemplates, PlanTab, ShareMessage, Vendors } from "@/components/parties/PartyTools";
import Poster from "@/components/parties/Poster";
import { THEMES_PATH, hostPicture } from "@/components/parties/ThemePicker";
import { STAGES, defaultPoster, fontFamily, newId, type Block, type PosterData, type Stage } from "@/lib/poster";
import AddressInput from "@/components/AddressInput";

type Summary = { id: string; title: string; kind: string; emoji: string; color: string; starts_at: string; place: string; date_poll: boolean; coming: number; replies: number; tasks_left: number };
type Guest = { group_id?: string | null; table_id?: string | null; wants_speech?: boolean; speech_note?: string; menu_choice?: string | null; checkin?: string | null; id: string; first_name: string; last_name: string; coming: boolean; allergies: string; message: string; companions: Companion[]; email: string | null; updates: boolean; date_votes: string[]; pending?: boolean };
type Companion = { first_name: string; last_name: string; child: boolean; allergies: string };
export type Detail = {
  id: string; title: string; kind: string; person_id: string | null; starts_at: string; ends_at: string; place: string; address: string; theme: string;
  emoji: string; color: string; invitation: string; rsvp_by: string | null; bring: "none" | "one" | "family"; person_ids: string[]; show_guests: "none" | "count" | "names"; wishlist: boolean;
  budget: number | null; spent: number; thanks_text: string; thanks_album_id: string | null; thanks_published: boolean; link: string; qr_svg: string;
  page_theme: string; page_custom_id: string | null; invite_image: string | null; mail: boolean; subscribers: number;
  layout: Block[] | null; assets: { id: string; v: string | null }[];
  layouts: Partial<Record<Stage, Block[] | null>>; phase: "save" | "invite"; playlist_url: string | null; signed_up: number;
  stage: Stage; thanks_at: string | null; rsvp_remind_days: number | null; rsvp_reminded_on: string | null; address_set: boolean;
  portal: { open: boolean; at: string | null; until: string | null; link: string; qr_svg: string; album_id: string | null; photos: number; gallery: boolean } | null;
  // A party whose date the guests vote on (the options' starts).
  date_poll: boolean; date_options: string[]; tally: { option: string; votes: number; people: number; names: string[] }[];
  guests: Guest[]; coming: number; children: number; not_coming: number; allergies: { name: string; allergies: string }[];
  tasks: { id: string; title: string; due_date: string | null; done: boolean; who: string | null; helper_id?: string | null; action?: string | null }[];
  guest_chat: boolean; planner_chat: boolean;
  capacity: { coming: number; waiting: number; most: number; open: boolean };
  pages: Stage[]; tables: { id: string; name: string; seats: number }[]; family_name: string;
  checkin_at: string | null; menu: { id: string; name: string }[]; menu_tally: { id: string | null; name: string; people: number }[]; speech_signup: boolean;
  practical: { parking?: string; lodging?: string; travel?: string };
  adults: { id: string; name: string }[]; you: { helper: boolean; helper_id: string | null }; people: Person[];
  helpers: { id: string; name: string; role: string; email: string | null; days_after: number; ends_at: string; last_seen: string | null }[];
  plan_kept: boolean; plan_hidden: string[]; plan: { id: string; kind: string; at: string; minutes: number | null; title: string; who: string; note: string; done: boolean }[];
  speeches: { id: string; name: string; note: string }[];
  vendors: { id: string; category: string; name: string; url: string; contact: string; price: number | null; status: string; note: string; in_budget: boolean }[];
  mail_templates: { kind: string; default_subject: string; default_text: string; subject: string; text: string }[];
  share_texts: { save: string; invite: string };
  expenses: { id: string; title: string; amount: number; paid_by: string | null }[];
  steps: { id: string; at: string; title: string; hidden?: boolean }[];
  mailings: { id: string; kind: "save" | "invite" | "remind" | "thanks" | "custom"; audience: "all" | "waiting" | "coming"; subject: string; text: string; send_at: string; sent_at: string | null; sent_count: number }[];
  wishes: { id: string; title: string; reserved: boolean; reserved_by: string | null }[];
};
type Person = { id: string; name: string };
type Album = { id: string; name: string };

const KINDS = ["child_birthday", "birthday", "party", "dinner", "match", "bbq", "outdoor"] as const;
const EMOJIS: Record<string, string> = { child_birthday: "🎈", birthday: "🎂", party: "🎉", dinner: "🍽️", match: "⚽", bbq: "🔥", outdoor: "☀️" };
// What one reply may bring, to begin with: a child's friends come alone, a dinner's guests as families.
const KIND_BRING: Record<string, string> = { child_birthday: "none", birthday: "one", party: "one", dinner: "family", match: "one", bbq: "family", outdoor: "family" };
// The party as a flow, step by step: what and when and the theme, the pages the guests see, who's
// coming, what to do, what it costs, the day's plan, and the mails.
const TABS = ["details", "design", "guests", "tasks", "budget", "schedule", "plan", "mailings", "party"] as const;
type Tab = (typeof TABS)[number];
const TAB_ICONS: Record<Tab, typeof Users> = { details: CalendarHeart, design: Palette, guests: Users, tasks: ListChecks, budget: Wallet, schedule: Clock, plan: Mic, mailings: Mail, party: PartyPopper };

export const localInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const LONG: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" };

// The dates on offer in a vote: one input each, more to add, any but the last to remove.
function DateOptions({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      {value.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <input className="input" type="datetime-local" aria-label={t("parties.dateOption", { n: i + 1 })} value={v} onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))} />
          {value.length > 1 && (
            <button className="text-muted hover:text-red-700" aria-label={t("parties.removeDate")} onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" aria-hidden /></button>
          )}
        </div>
      ))}
      <button className="btn-ghost flex items-center gap-1 border border-edge text-sm" onClick={() => {
        const last = value[value.length - 1];
        const next = last ? new Date(new Date(last).getTime() + 7 * 86_400_000) : new Date();
        onChange([...value, localInput(next.toISOString())]);
      }}>
        <Plus className="h-4 w-4" aria-hidden />
        {t("parties.addDate")}
      </button>
    </div>
  );
}

export default function PartiesApp() {
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
                {p.date_poll ? t("parties.pollOpen") : new Date(p.starts_at).toLocaleString(dateLocale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
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

// Whose party it is – one or more of the family – as chips to tick.
function WhoseParty({ people, value, onChange }: { people: Person[]; value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useI18n();
  if (people.length === 0) return null;
  return (
    <div role="group" aria-label={t("parties.whose")}>
      <span className="label">{t("parties.whose")}</span>
      <div className="flex flex-wrap gap-1.5">
        {people.map((p) => {
          const on = value.includes(p.id);
          return (
            <button key={p.id} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])} className={`rounded-full border px-3 py-1 text-sm ${on ? "border-accent bg-accent-soft font-semibold" : "border-edge"}`}>
              {on && <Check className="-ml-1 mr-1 inline h-3.5 w-3.5" aria-hidden />}
              {p.name}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-muted">{t("parties.whoseHelp")}</p>
    </div>
  );
}

function WishlistSelect({ people, value, onChange }: { people: Person[]; value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  return (
    <label>
      <span className="label">{t("parties.wishlistPick")}</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t("parties.noWishlist")}</option>
        {people.map((p) => <option key={p.id} value={p.id}>{t("parties.wishlistOf", { name: p.name })}</option>)}
      </select>
    </label>
  );
}

function BringSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  return (
    <label>
      <span className="label">{t("parties.bring")}</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {(["none", "one", "family"] as const).map((v) => <option key={v} value={v}>{t(`parties.bring.${v}` as TranslationKey)}</option>)}
      </select>
    </label>
  );
}

function NewParty({ onDone }: { onDone: (id: string | null) => void }) {
  const { t } = useI18n();
  const people = useApi<Person[]>("/api/birthdays/people").data ?? NONE;
  const start = new Date();
  start.setDate(start.getDate() + 21);
  start.setHours(14, 0, 0, 0);
  const [form, setForm] = useState({ title: "", kind: "child_birthday" as string, person_ids: [] as string[], wishlist_of: "", starts: localInput(start.toISOString()), hours: 2, place: "", address: "", rsvp: "", bring: "none", show_guests: "count", date_poll: false, options: [] as string[] });
  const [error, setError] = useState("");
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function create() {
    setError("");
    try {
      const starts = new Date(form.starts);
      const ends = new Date(starts.getTime() + form.hours * 3_600_000);
      const made = await api.post<Detail>("/api/parties", {
        title: form.title.trim(), kind: form.kind, person_ids: form.person_ids, person_id: form.wishlist_of || null, wishlist: !!form.wishlist_of, emoji: EMOJIS[form.kind],
        starts_at: starts.toISOString(), ends_at: ends.toISOString(), place: form.place, address: form.address,
        rsvp_by: form.rsvp || null, bring: form.bring, show_guests: form.show_guests, page_theme: kindTheme(form.kind),
        date_poll: form.date_poll, date_options: form.date_poll ? form.options.filter(Boolean).map((o) => new Date(o).toISOString()) : [],
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
        <select className="input" value={form.kind} onChange={(e) => set({ kind: e.target.value, bring: KIND_BRING[e.target.value] ?? "one" })}>
          {KINDS.map((k) => <option key={k} value={k}>{`${EMOJIS[k]} ${t(`parties.kind.${k}` as TranslationKey)}`}</option>)}
        </select>
      </label>
      <BringSelect value={form.bring} onChange={(bring) => set({ bring })} />
      <div className="sm:col-span-2">
        <WhoseParty people={people} value={form.person_ids} onChange={(person_ids) => set({ person_ids, wishlist_of: form.wishlist_of && !person_ids.includes(form.wishlist_of) ? "" : form.wishlist_of || (form.kind === "child_birthday" && person_ids.length === 1 ? person_ids[0] : "") })} />
      </div>
      <label>
        <span className="label">{t("parties.when")}</span>
        <input className="input" type="datetime-local" value={form.starts} onChange={(e) => set({ starts: e.target.value })} />
      </label>
      <label>
        <span className="label">{t("parties.hours")}</span>
        <input className="input" type="number" min={1} max={24} step={0.5} value={form.hours} onChange={(e) => set({ hours: Number(e.target.value) })} />
      </label>
      <div className="space-y-2 rounded-xl border border-edge p-3 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={form.date_poll} onChange={(e) => set({ date_poll: e.target.checked, options: form.options.length ? form.options : [localInput(new Date(new Date(form.starts).getTime() + 7 * 86_400_000).toISOString())] })} />
          {t("parties.datePoll")}
        </label>
        {form.date_poll && (
          <>
            <p className="text-xs text-muted">{t("parties.datePollHelp")}</p>
            <DateOptions value={form.options} onChange={(options) => set({ options })} />
          </>
        )}
      </div>
      <label>
        <span className="label">{t("parties.place")}</span>
        <input className="input" value={form.place} maxLength={200} onChange={(e) => set({ place: e.target.value })} />
      </label>
      <label>
        <span className="label">{t("parties.address")}</span>
        <AddressInput value={form.address} onChange={(address) => set({ address })} />
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
      <WishlistSelect people={people} value={form.wishlist_of} onChange={(wishlist_of) => set({ wishlist_of })} />
      <p className="self-end text-xs text-muted">{t("parties.inCalendar")}</p>
      {error && <p className="text-sm text-red-700 sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn-primary" disabled={!form.title.trim() || !form.starts || (form.date_poll && !form.options.some(Boolean))} onClick={create}>{t("parties.create")}</button>
        <button className="btn-ghost" onClick={() => onDone(null)}>{t("common.cancel")}</button>
      </div>
    </section>
  );
}

// A party as the browser may have kept it from an older version: what's missing gets its default,
// so the page shows it until the fresh one comes.
function withDefaults(d: Detail): Detail {
  return {
    ...d,
    bring: d.bring ?? "none",
    person_ids: d.person_ids ?? (d.person_id ? [d.person_id] : []),
    page_custom_id: d.page_custom_id ?? null,
    invite_image: d.invite_image ?? null,
    layout: d.layout ?? null,
    assets: d.assets ?? [],
    layouts: d.layouts ?? { invite: d.layout ?? null },
    phase: d.phase ?? "invite",
    playlist_url: d.playlist_url ?? null,
    signed_up: d.signed_up ?? 0,
    portal: d.portal ?? null,
    mailings: d.mailings ?? [],
    pages: d.pages ?? STAGES.filter((st) => st !== "checkin"),
    tables: d.tables ?? [],
    guest_chat: d.guest_chat ?? false,
    planner_chat: d.planner_chat ?? false,
    capacity: d.capacity ?? { coming: d.coming ?? 0, waiting: 0, most: d.coming ?? 0, open: false },
    family_name: d.family_name ?? "",
    checkin_at: d.checkin_at ?? null,
    menu: d.menu ?? [],
    menu_tally: d.menu_tally ?? [],
    speech_signup: d.speech_signup ?? false,
    practical: d.practical ?? {},
    adults: d.adults ?? [],
    you: d.you ?? { helper: false, helper_id: null },
    people: d.people ?? [],
    helpers: d.helpers ?? [],
    plan_kept: d.plan_kept ?? false,
    plan_hidden: d.plan_hidden ?? [],
    plan: d.plan ?? [],
    speeches: d.speeches ?? [],
    vendors: d.vendors ?? [],
    mail_templates: d.mail_templates ?? [],
    share_texts: d.share_texts ?? { save: "", invite: "" },
    stage: d.stage ?? d.phase ?? "invite",
    thanks_at: d.thanks_at ?? null,
    rsvp_remind_days: d.rsvp_remind_days ?? null,
    rsvp_reminded_on: d.rsvp_reminded_on ?? null,
    address_set: d.address_set ?? true,
    date_poll: d.date_poll ?? false,
    date_options: d.date_options ?? [],
    tally: d.tally ?? [],
    children: d.children ?? 0,
    guests: (d.guests ?? []).map((g) => ({ ...g, companions: g.companions ?? [], date_votes: g.date_votes ?? [] })),
  };
}

export function PartyView({ id, onBack }: { id: string; onBack?: () => void }) {
  const { t, dateLocale } = useI18n();
  const path = `/api/parties/${id}`;
  const fetched = useApi<Detail>(path).data;
  const party = fetched && withDefaults(fetched);
  const [tab, setTab] = useState<Tab>("details");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<{ failed: boolean; text: string } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  async function run(action: () => Promise<Detail>) {
    setError("");
    try {
      const next = await action();
      setApiData<Detail>(path, () => next);
      return null;
    } catch (e) {
      const message = e instanceof Error ? e.message : t("common.error");
      setError(message);
      return message;
    }
  }
  const change: Change = async (patch, options) => {
    const failed = await run(() => api.put<Detail>(path, patch));
    if (!options?.quiet) {
      clearTimeout(flashTimer.current);
      setFlash({ failed: !!failed, text: failed ?? t("common.saved") });
      flashTimer.current = setTimeout(() => setFlash(null), failed ? 6000 : 2500);
    }
    return failed;
  };

  if (!party) return <p className="text-sm text-muted">{t("common.loading")}</p>;
  // The plan is there once someone's invited to help; those it's kept from see it greyed out.
  const steps = TABS.filter((x) => x !== "plan" || party.helpers.length > 0 || party.you.helper || party.planner_chat);
  const open = steps.filter((x) => x !== "plan" || !party.plan_kept);
  const when = party.date_poll ? t("parties.pollOpen") : new Date(party.starts_at).toLocaleString(dateLocale, LONG);

  return (
    <div className="space-y-4">
      {onBack && <button className="btn-ghost -ml-2 flex items-center gap-1 px-2 text-sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t("parties.all")}
      </button>}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold"><span aria-hidden>{party.emoji}</span>{party.title}</h1>
          <p className="text-sm text-muted">{[when, party.place].filter(Boolean).join(" · ")}</p>
          <p className="text-xs text-muted">{t("parties.replies", { coming: party.coming, not: party.not_coming })}</p>
        </div>
        {!party.you.helper && onBack && <button className="text-xs text-red-700 hover:underline" onClick={() => window.confirm(t("parties.confirmDelete", { title: party.title })) && api.del(path).then(onBack)}>
          {t("parties.delete")}
        </button>}
      </div>
      <nav aria-label={t("parties.flow")}>
        <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
          {steps.map((x, i) => {
            const Icon = TAB_ICONS[x];
            const here = tab === x;
            const kept = x === "plan" && party.plan_kept;
            return (
              <li key={x}>
                <button aria-current={here ? "step" : undefined} disabled={kept} title={kept ? t("plan.kept") : undefined} onClick={() => setTab(x)} className={`flex h-full w-full disabled:cursor-not-allowed disabled:opacity-40 items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-sm ${here ? "border-accent bg-accent-soft font-semibold" : "border-edge text-muted hover:text-ink"}`}>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${here ? "bg-accent text-white" : "bg-base"}`}>{i + 1}</span>
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 truncate">{t(`parties.tab.${x}` as TranslationKey)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {flash && <p role={flash.failed ? "alert" : "status"} className={`fixed bottom-20 left-1/2 z-40 flex max-w-[90vw] -translate-x-1/2 items-center gap-1.5 rounded-full border border-edge bg-surface px-4 py-2 text-sm font-semibold shadow-lg lg:bottom-6 ${flash.failed ? "text-red-700" : "text-accent"}`}>{!flash.failed && <Check className="h-4 w-4 shrink-0" aria-hidden />}{flash.text}</p>}
      {tab === "details" && (
        <div className="space-y-4">
          <InviteTab party={party} change={change} />
          <GuestOptions party={party} change={change} />
          <Helpers party={party} run={run} path={path} />
        </div>
      )}
      {tab === "design" && (
        <div className="space-y-4">
          <PosterTab party={party} change={change} />
          {party.pages.includes("thanks") && <ThanksTab party={party} change={change} />}
        </div>
      )}
      {tab === "guests" && <GuestsTab party={party} run={run} change={change} path={path} />}
      {tab === "tasks" && <TasksTab party={party} run={run} path={path} />}
      {tab === "budget" && (
        <div className="space-y-4">
          <BudgetTab party={party} run={run} path={path} change={change} />
          <Vendors party={party} run={run} path={path} />
        </div>
      )}
      {tab === "schedule" && <TimelineTab party={party} run={run} path={path} />}
      {tab === "mailings" && <MailingsTab party={party} run={run} change={change} path={path} newLink={() => run(() => api.post<Detail>(`${path}/link`))} />}
      {tab === "party" && <FinalTab party={party} run={run} path={path} go={(to) => { setTab(to); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}
      {tab === "plan" && !party.plan_kept && <PlanTab party={party} run={run} path={path} />}
      {open.indexOf(tab) < open.length - 1 && (
        <div className="flex justify-end">
          <button className="btn-ghost flex items-center gap-1.5 border border-edge" onClick={() => { setTab(open[open.indexOf(tab) + 1]); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
            {t("parties.next", { step: t(`parties.tab.${open[open.indexOf(tab) + 1]}` as TranslationKey) })}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

// Changing a party: a choice takes effect at once and says so; quiet when a button shows it itself.
export type Change = (patch: Record<string, unknown>, options?: { quiet?: boolean }) => Promise<string | null>;
export type TabProps = { party: Detail; run: (a: () => Promise<Detail>) => Promise<string | null>; path: string };

function InviteTab({ party, change }: { party: Detail; change: Change }) {
  const { t } = useI18n();
  const family = useApi<Person[]>(party.you.helper ? null : "/api/birthdays/people").data ?? NONE;
  const people = party.you.helper ? party.people : family;
  const [draft, setDraft] = useState({ title: party.title, invitation: party.invitation, place: party.place, address: party.address, theme: party.theme, starts: localInput(party.starts_at), ends: localInput(party.ends_at), rsvp: party.rsvp_by ?? "" });
  useEffect(() => setDraft({ title: party.title, invitation: party.invitation, place: party.place, address: party.address, theme: party.theme, starts: localInput(party.starts_at), ends: localInput(party.ends_at), rsvp: party.rsvp_by ?? "" }), [party]);
  return (
    <div className="space-y-4">
      <DatePoll party={party} change={change} />
      <section className="card grid gap-3 p-5 sm:grid-cols-2" aria-label={t("parties.tab.details")}>
        <label className="sm:col-span-2"><span className="label">{t("parties.name")}</span><input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
        <label><span className="label">{t("parties.when")}</span><input className="input" type="datetime-local" value={draft.starts} onChange={(e) => setDraft({ ...draft, starts: e.target.value })} /></label>
        <label><span className="label">{t("parties.ends")}</span><input className="input" type="datetime-local" value={draft.ends} onChange={(e) => setDraft({ ...draft, ends: e.target.value })} /></label>
        <label><span className="label">{t("parties.place")}</span><input className="input" value={draft.place} onChange={(e) => setDraft({ ...draft, place: e.target.value })} /></label>
        <label><span className="label">{t("parties.address")}</span><AddressInput value={draft.address} onChange={(address) => setDraft({ ...draft, address })} /></label>
        <label><span className="label">{t("parties.theme")}</span><input className="input" value={draft.theme} onChange={(e) => setDraft({ ...draft, theme: e.target.value })} /></label>
        <label><span className="label">{t("parties.rsvpBy")}</span><input className="input" type="date" value={draft.rsvp} onChange={(e) => setDraft({ ...draft, rsvp: e.target.value })} /></label>
        <label className="sm:col-span-2"><span className="label">{t("parties.invitation")}</span><textarea className="input min-h-28" value={draft.invitation} maxLength={4000} placeholder={t("parties.invitationPh")} onChange={(e) => setDraft({ ...draft, invitation: e.target.value })} /></label>
        <div className="sm:col-span-2">
          <WhoseParty people={people} value={party.person_ids} onChange={(person_ids) => change({ person_ids })} />
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="label">{t("parties.pagesLabel")}</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {STAGES.map((st) => (
              <label key={st} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-primary-700" disabled={st === "invite"} checked={party.pages.includes(st)} onChange={(e) => change({ pages: e.target.checked ? [...party.pages, st] : party.pages.filter((x) => x !== st) })} />
                {t(`parties.stage.${st}` as TranslationKey)}
              </label>
            ))}
          </div>
          <span className="mt-1 block text-xs text-muted">{t("parties.pagesHelp")}</span>
        </fieldset>
        <BringSelect value={party.bring} onChange={(bring) => change({ bring })} />
        <WishlistSelect people={people} value={party.wishlist && party.person_id ? party.person_id : ""} onChange={(id) => change({ person_id: id || null, wishlist: !!id })} />
        <label>
          <span className="label">{t("parties.showGuests")}</span>
          <select className="input" value={party.show_guests} onChange={(e) => change({ show_guests: e.target.value })}>
            {(["none", "count", "names"] as const).map((v) => <option key={v} value={v}>{t(`parties.show.${v}` as TranslationKey)}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <SaveButton className="btn-primary" onSave={() => change({ title: draft.title, invitation: draft.invitation, place: draft.place, address: draft.address, theme: draft.theme, starts_at: new Date(draft.starts).toISOString(), ends_at: new Date(draft.ends).toISOString(), rsvp_by: draft.rsvp || null }, { quiet: true })} />
        </div>
      </section>
    </div>
  );
}

// A save button that says how it went, beside itself: the error at the top of the page may be out of
// sight. onSave gives the error's text, or nothing when it went well.
export function SaveButton({ onSave, label, className = "btn-ghost border border-edge", disabled }: { onSave: () => Promise<string | null | void> | void; label?: string; className?: string; disabled?: boolean }) {
  const { t } = useI18n();
  const [state, setState] = useState<{ kind: "idle" | "saving" | "saved" } | { kind: "failed"; message: string }>({ kind: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const save = async () => {
    clearTimeout(timer.current);
    setState({ kind: "saving" });
    const failed = await onSave();
    if (failed) {
      setState({ kind: "failed", message: failed });
      return;
    }
    setState({ kind: "saved" });
    timer.current = setTimeout(() => setState({ kind: "idle" }), 3000);
  };
  return (
    <>
      <button type="button" className={className} disabled={disabled || state.kind === "saving"} onClick={() => { void save(); }}>{state.kind === "saving" ? t("common.saving") : label ?? t("common.save")}</button>
      {state.kind === "saved" && <span className="flex items-center gap-1 text-sm font-semibold text-accent" role="status"><Check className="h-4 w-4" aria-hidden />{t("common.saved")}</span>}
      {state.kind === "failed" && <span className="text-sm text-red-700" role="alert">{state.message}</span>}
    </>
  );
}

// A moment for the guests' link to change, or none.
export function WhenField({ label, help, value, suggest, onSave }: { label: string; help: string; value: string | null; suggest: string; onSave: (iso: string | null) => Promise<string | null> }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(localInput(value ?? suggest));
  useEffect(() => setDraft(localInput(value ?? suggest)), [value, suggest]);
  return (
    <div className="space-y-1">
      <span className="label">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input !w-auto" type="datetime-local" aria-label={label} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <SaveButton disabled={!draft} label={value ? t("common.save") : t("parties.setWhen")} onSave={() => onSave(new Date(draft).toISOString())} />
        {value && <button type="button" className="text-xs text-muted hover:underline" onClick={() => onSave(null)}>{t("parties.clearWhen")}</button>}
      </div>
      <span className="block text-xs text-muted">{help}</span>
    </div>
  );
}

// The party's posters (save the date, the invitation, the day's portal, the thank-you), what the
// link shows, the playlist, and the portal with its QR code.
function PosterTab({ party, change }: { party: Detail; change: Change }) {
  const { t, dateLocale } = useI18n();
  const own = useApi<CustomTheme[]>(party.page_theme === "custom" ? THEMES_PATH : null).data;
  const [editing, setEditing] = useState<Stage | null>(null);
  const [previewing, setPreviewing] = useState<Stage | null>(null);
  const pages = STAGES.filter((st) => party.pages.includes(st));
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [playlist, setPlaylist] = useState(party.playlist_url ?? "");
  const [error, setError] = useState("");
  const path = `/api/parties/${party.id}`;
  const custom = own?.find((x) => x.id === party.page_custom_id);
  if (party.page_theme === "custom" && !own) return null;
  const theme = party.page_theme === "custom" && custom ? customTheme(custom, hostPicture(custom.id)) : partyTheme(party.page_theme);
  const keep = (r: unknown) => setApiData<Detail>(path, () => withDefaults(r as Detail));
  const run = (p: Promise<unknown>) => {
    setError("");
    return p.then(keep).then(() => null).catch((e) => {
      const message: string = e instanceof Error ? e.message : t("common.error");
      setError(message);
      return message;
    });
  };
  const data: PosterData = {
    title: party.title, family: party.family_name, emoji: party.emoji, start: new Date(party.starts_at), end: new Date(party.ends_at), place: party.place, address: party.address,
    theme: party.theme, invitation: party.invitation, rsvp: party.rsvp_by ? new Date(`${party.rsvp_by}T12:00:00`) : null, poll: party.date_poll,
    guests: party.show_guests === "none" ? null : { coming: party.coming, names: party.show_guests === "names" ? party.guests.filter((g) => g.coming).map((g) => `${g.first_name} ${g.last_name}`.trim()) : undefined },
    locale: dateLocale, inviteImage: party.invite_image ? `${path}/picture?v=${party.invite_image}` : null, asset: () => "", ics: `/api/parties/${party.id}`, thanks: false,
    playlist: party.playlist_url, steps: party.steps.map((st) => ({ at: st.at, title: st.title })), guest: t("poster.sampleGuest"), practical: party.practical,
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <TemplatePicker party={party} data={data} customId={party.page_custom_id} onApplied={keep} />
      <section className="card space-y-4 p-5 lg:col-span-2" aria-label={t("parties.look")}>
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("parties.look")}</h2>
        <ThemePicker label={t("parties.pageTheme")} kind={party.kind} value={party.page_theme} customId={party.page_custom_id} onChange={(key, id) => change({ page_theme: key, page_custom_id: id })} />
        <InvitePicture party={party} />
      </section>
      <section className="card space-y-3 p-5" aria-label={t("parties.posters")}>
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("parties.posters")}</h2>
        <p className="text-xs text-muted">{t("parties.postersHelp")}</p>
        <ul className="divide-y divide-edge">
          {pages.map((st) => (
            <li key={st} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{t(`parties.stage.${st}` as TranslationKey)}</span>
                <span className="block text-xs text-muted">{party.layouts[st]?.length ? t("parties.stageOwn") : t("parties.stageTheme")}</span>
              </span>
              <button className="btn-ghost flex items-center gap-1 border border-edge text-sm" aria-label={t("parties.previewGuestOf", { page: t(`parties.stage.${st}` as TranslationKey) })} onClick={() => setPreviewing(st)}><Eye className="h-4 w-4" aria-hidden />{t("parties.previewGuest")}</button>
              <button className="btn-ghost border border-edge text-sm" onClick={() => setEditing(st)}>{t("parties.editPoster")}</button>
            </li>
          ))}
        </ul>
        {party.pages.includes("save") && <label className="block">
          <span className="label">{t("parties.phase")}</span>
          <select className="input" value={party.phase} onChange={(e) => change({ phase: e.target.value })}>
            <option value="save">{t("parties.phase.save")}</option>
            <option value="invite">{t("parties.phase.invite")}</option>
          </select>
          <span className="mt-1 block text-xs text-muted">{party.phase === "save" ? t(party.mail ? "parties.phaseSaveHelp" : "parties.phaseSaveNoMail") : t("parties.phaseInviteHelp", { n: party.signed_up })}</span>
        </label>}
        <form className="space-y-1" onSubmit={(e) => { e.preventDefault(); run(api.put(path, { playlist_url: playlist.trim() })); }}>
          <span className="label">{t("parties.playlist")}</span>
          <div className="flex flex-wrap items-center gap-2">
            <input className="input min-w-0 flex-1" type="url" value={playlist} placeholder="https://open.spotify.com/playlist/…" aria-label={t("parties.playlist")} onChange={(e) => setPlaylist(e.target.value)} />
            <SaveButton onSave={() => run(api.put(path, { playlist_url: playlist.trim() }))} />
          </div>
          <span className="block text-xs text-muted">{t("parties.playlistHelp")}</span>
        </form>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </section>
      {previewing && <GuestPreview party={party} stage={previewing} pages={pages} theme={theme} data={data} onClose={() => setPreviewing(null)} onStage={setPreviewing} />}
      {editing && (
        <div className="fixed inset-0 z-50 overflow-auto bg-base p-3 sm:p-5" role="dialog" aria-modal="true" aria-label={t("parties.editPoster")}>
          <div className="mx-auto max-w-[1600px] space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-bold">{party.title}</h2>
              <div role="tablist" aria-label={t("parties.posters")} className="inline-flex overflow-hidden rounded-lg border border-edge">
                {pages.map((st) => (
                  <button key={st} role="tab" aria-selected={editing === st} className={`px-3 py-1.5 text-sm ${editing === st ? "bg-accent-soft font-semibold" : "hover:bg-surface"}`} onClick={() => setEditing(st)}>{t(`parties.stage.${st}` as TranslationKey)}</button>
                ))}
              </div>
              <div role="radiogroup" aria-label={t("parties.device")} className="inline-flex overflow-hidden rounded-lg border border-edge">
                <button role="radio" aria-checked={device === "desktop"} className={`flex items-center gap-1 px-3 py-1.5 text-sm ${device === "desktop" ? "bg-accent-soft font-semibold" : ""}`} onClick={() => setDevice("desktop")}><Monitor className="h-4 w-4" aria-hidden />{t("parties.device.desktop")}</button>
                <button role="radio" aria-checked={device === "phone"} className={`flex items-center gap-1 px-3 py-1.5 text-sm ${device === "phone" ? "bg-accent-soft font-semibold" : ""}`} onClick={() => setDevice("phone")}><Smartphone className="h-4 w-4" aria-hidden />{t("parties.device.phone")}</button>
              </div>
              <button className="ml-auto flex items-center gap-1 rounded-lg border border-edge px-3 py-1.5 text-sm hover:bg-surface" onClick={() => setEditing(null)}><X className="h-4 w-4" aria-hidden />{t("common.close")}</button>
            </div>
            <PosterEditor key={`${editing}:${party.page_theme}:${party.page_custom_id ?? ""}`} stage={editing} device={device} partyId={party.id} theme={theme} data={data} layout={party.layouts[editing] ?? null} assets={party.assets} onSaved={keep} />
          </div>
        </div>
      )}
    </div>
  );
}

// A page as a guest will see it, with this party's details and a sample name, on either screen.
function GuestPreview({ party, stage, pages, theme, data, onClose, onStage }: { party: Detail; stage: Stage; pages: Stage[]; theme: ReturnType<typeof partyTheme>; data: PosterData; onClose: () => void; onStage: (s: Stage) => void }) {
  const { t } = useI18n();
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const d = { ...data, thanks: stage === "thanks", asset: (id: string) => `/api/parties/${party.id}/assets/${id}?v=${party.assets.find((a) => a.id === id)?.v ?? ""}` };
  const own = party.layouts[stage];
  const blocks = own?.length ? own : defaultPoster(theme, d, (k, v) => t(k, v), stage);
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-base p-3 sm:p-5" role="dialog" aria-modal="true" aria-label={t("parties.previewGuest")}>
      <div className="mx-auto max-w-5xl space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold">{party.title}</h2>
          <div role="tablist" aria-label={t("parties.posters")} className="inline-flex overflow-hidden rounded-lg border border-edge">
            {pages.map((st) => <button key={st} role="tab" aria-selected={stage === st} className={`px-3 py-1.5 text-sm ${stage === st ? "bg-accent-soft font-semibold" : "hover:bg-surface"}`} onClick={() => onStage(st)}>{t(`parties.stage.${st}` as TranslationKey)}</button>)}
          </div>
          <div role="radiogroup" aria-label={t("parties.device")} className="inline-flex overflow-hidden rounded-lg border border-edge">
            {(["desktop", "phone"] as const).map((x) => <button key={x} role="radio" aria-checked={device === x} className={`flex items-center gap-1 px-3 py-1.5 text-sm ${device === x ? "bg-accent-soft font-semibold" : ""}`} onClick={() => setDevice(x)}>{x === "phone" ? <Smartphone className="h-4 w-4" aria-hidden /> : <Monitor className="h-4 w-4" aria-hidden />}{t(`parties.device.${x}` as TranslationKey)}</button>)}
          </div>
          <button className="ml-auto flex items-center gap-1 rounded-lg border border-edge px-3 py-1.5 text-sm hover:bg-surface" onClick={onClose}><X className="h-4 w-4" aria-hidden />{t("common.close")}</button>
        </div>
        <p className="text-xs text-muted">{t("parties.previewGuestHelp", { name: data.guest ?? "" })}</p>
        <div className={`pt overflow-hidden rounded-2xl border border-edge ${device === "phone" ? "mx-auto w-[390px] max-w-full" : "w-full"}`} style={{ ...themeStyle(theme), minHeight: 0 }}>
          <div className="h-2" style={{ background: theme.band }} />
          {theme.header && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={theme.header} alt="" className="h-40 w-full object-cover" />
          )}
          <div className="px-4 py-6 sm:px-8">
            <Poster blocks={blocks} d={d} theme={theme} device={device} />
            {stage === "invite" && <p className="pt-card mt-6 p-4 text-center text-sm text-muted">{t("poster.replyBelow")}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// The portal: when it opens and when its link ends, its QR code and the guests' photos.
function PortalCard({ party, run, change, path }: { party: Detail; run: TabProps["run"]; change: Change; path: string }) {
  const { t, dateLocale } = useI18n();
  const [copied, setCopied] = useState(false);
  const share = async (link: string) => {
    try {
      if (navigator.share) {
        await navigator.share({ title: party.title, text: t("parties.sharePortalText", { title: party.title, link }) });
        return;
      }
    } catch {
      return;
    }
    await navigator.clipboard?.writeText(t("parties.sharePortalText", { title: party.title, link }));
    setCopied(true);
  };
  return (
    <section className="card space-y-3 p-5 lg:col-span-2" aria-label={t("parties.portal")}>
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("parties.portal")}</h2>
      <p className="text-xs text-muted">{t("parties.portalHelp")}</p>
      <WhenField label={t("parties.portalAt")} help={t("parties.portalAtHelp")} value={party.portal?.at ?? null} suggest={party.starts_at} onSave={(at) => change({ portal_at: at }, { quiet: !!at })} />
      {party.portal ? (
        <>
          <WhenField label={t("parties.portalUntil")} help={t("parties.portalUntilHelp")} value={party.portal.until} suggest={new Date(new Date(party.ends_at).getTime() + 3 * 3_600_000).toISOString()} onSave={(at) => change({ portal_until: at }, { quiet: !!at })} />
          {!party.portal.until && <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">{t("parties.portalNoEnd")}</p>}
          {!party.portal.open && <p className="text-sm font-semibold">{party.portal.at ? t("parties.portalOpensAt", { when: new Date(party.portal.at).toLocaleString(dateLocale, LONG) }) : t("parties.portalClosed")}</p>}
          <div className="mx-auto w-44 rounded-lg bg-white p-2 [&>svg]:h-auto [&>svg]:w-full" aria-label={t("parties.qr")} dangerouslySetInnerHTML={{ __html: party.portal.qr_svg }} />
          <input className="input text-xs" readOnly value={party.portal.link} aria-label={t("parties.portalLink")} onFocus={(e) => e.target.select()} />
          <div className="flex flex-wrap gap-2">
            <a className="btn-ghost flex items-center gap-1.5 border border-edge" href={`/party-qr/${party.id}`} target="_blank" rel="noreferrer"><Printer className="h-4 w-4" aria-hidden />{t("parties.portalPrintButton")}</a>
            <button className="btn-ghost flex items-center gap-1.5 border border-edge" onClick={() => { void share(party.portal!.link); }}><Share2 className="h-4 w-4" aria-hidden />{t("parties.shareButton")}</button>
            <button className="btn-ghost flex items-center gap-1.5 border border-edge" onClick={() => navigator.clipboard?.writeText(party.portal!.link).then(() => setCopied(true))}><Copy className="h-4 w-4" aria-hidden />{t("parties.copy")}</button>
            {party.portal.open && <a className="btn-ghost border border-edge" href={party.portal.link} target="_blank" rel="noreferrer">{t("parties.preview")}</a>}
          </div>
          {copied && <p className="text-xs text-accent" role="status">{t("parties.copied")}</p>}
          <p className="text-sm">{t("parties.portalPhotos", { n: party.portal.photos })}{party.portal.album_id && !party.you.helper && <> · <a className="text-accent hover:underline" href="/vault">{t("parties.portalAlbum")}</a></>}</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary-700" checked={party.portal.gallery} onChange={(e) => change({ portal_gallery: e.target.checked })} />{t("parties.portalGallery")}</label>
          <div className="flex flex-wrap items-center gap-3">
            {!party.portal.open && <button className="btn-ghost border border-edge" onClick={() => run(() => api.post<Detail>(`${path}/portal`))}>{t("parties.portalOpen")}</button>}
            {(party.portal.open || party.portal.at) && <button className="text-xs text-red-700 hover:underline" onClick={() => run(() => api.del(`${path}/portal`).then(() => api.get<Detail>(path)))}>{t("parties.portalClose")}</button>}
          </div>
        </>
      ) : (
        <button className="btn-primary" onClick={() => run(() => api.post<Detail>(`${path}/portal`))}>{t("parties.portalOpen")}</button>
      )}
    </section>
  );
}

// The seating: tables with their places, each guest's company at one – they sit together.
function Seating({ party, run, change, path }: { party: Detail; run: TabProps["run"]; change: Change; path: string }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: "", seats: "8" });
  const people = party.guests.filter((g) => g.coming || g.pending);
  const size = (g: Guest) => 1 + g.companions.length;
  const free = people.filter((g) => !g.table_id || !party.tables.some((x) => x.id === g.table_id));
  const seat = (g: Guest, table_id: string | null) => run(() => api.put<Detail>(`${path}/guests/${g.id}/table`, { table_id }));
  const row = (g: Guest) => (
    <li key={g.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm [overflow-wrap:anywhere]">
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{`${g.first_name} ${g.last_name}`.trim()}</span>
        {g.companions.length > 0 && <span className="text-muted"> +{g.companions.length}</span>}
        {g.pending && <span className="ml-1 text-xs text-muted">({t("parties.seatWaiting")})</span>}
      </span>
      <select className="input !w-auto py-1 text-xs" aria-label={t("parties.seatOf", { name: g.first_name })} value={g.table_id ?? ""} onChange={(e) => seat(g, e.target.value || null)}>
        <option value="">{t("parties.noTable")}</option>
        {party.tables.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
    </li>
  );
  return (
    <section className="card space-y-3 p-5" aria-label={t("parties.seating")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("parties.seating")}</h2>
        {party.guests.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <a className="btn-ghost flex items-center gap-1 border border-edge text-xs" href={`/party-print/${party.id}/tables`} target="_blank" rel="noreferrer"><Printer className="h-4 w-4" aria-hidden />{t("print.tables")}</a>
            <a className="btn-ghost flex items-center gap-1 border border-edge text-xs" href={`/party-print/${party.id}/cards`} target="_blank" rel="noreferrer"><Printer className="h-4 w-4" aria-hidden />{t("print.cards")}</a>
          </div>
        )}
      </div>
      <p className="text-xs text-muted">{t("parties.seatingHelp")}</p>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
        e.preventDefault();
        const seats = Number(form.seats);
        if (!form.name.trim() || !(seats >= 1)) return;
        void change({ tables: [...party.tables, { id: newId(), name: form.name.trim(), seats }] }, { quiet: true }).then(() => setForm({ name: "", seats: form.seats }));
      }}>
        <label className="min-w-40 flex-1"><span className="label">{t("parties.tableName")}</span><input className="input" value={form.name} maxLength={40} placeholder={t("parties.tableHint", { n: party.tables.length + 1 })} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="w-24"><span className="label">{t("parties.tableSeats")}</span><input className="input" type="number" min={1} max={500} value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} /></label>
        <button className="btn-ghost flex items-center gap-1 border border-edge" type="submit" disabled={!form.name.trim()}><Plus className="h-4 w-4" aria-hidden />{t("parties.addTable")}</button>
      </form>
      {party.tables.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {party.tables.map((table) => {
            const here = people.filter((g) => g.table_id === table.id);
            const taken = here.reduce((n, g) => n + size(g), 0);
            return (
              <div key={table.id} className="rounded-xl border border-edge p-3">
                <div className="flex items-center gap-2">
                  <h3 className="min-w-0 flex-1 truncate font-semibold">{table.name}</h3>
                  <span className={`text-xs font-semibold ${taken > table.seats ? "text-red-700" : "text-muted"}`}>{t("parties.seatsTaken", { n: taken, seats: table.seats })}</span>
                  <button className="text-muted hover:text-red-700" aria-label={t("parties.removeTable", { name: table.name })} onClick={() => change({ tables: party.tables.filter((x) => x.id !== table.id) }, { quiet: true })}><Trash2 className="h-4 w-4" aria-hidden /></button>
                </div>
                {taken > table.seats && <p className="text-xs text-red-700" role="alert">{t("parties.tableFull", { n: taken - table.seats })}</p>}
                {here.length > 0 && <ul className="divide-y divide-edge">{here.map(row)}</ul>}
              </div>
            );
          })}
        </div>
      )}
      {party.tables.length > 0 && free.length > 0 && (
        <div className="rounded-xl border border-dashed border-edge p-3">
          <h3 className="font-semibold">{t("parties.unseated", { n: free.reduce((n, g) => n + size(g), 0) })}</h3>
          <ul className="divide-y divide-edge">{free.map(row)}</ul>
        </div>
      )}
    </section>
  );
}

// Step 8, the party itself: what's left, a last look at everything, and have fun.
function FinalTab({ party, run, path, go }: TabProps & { go: (tab: Tab) => void }) {
  const { t } = useI18n();
  const own = useApi<CustomTheme[]>(party.page_theme === "custom" ? THEMES_PATH : null).data;
  const custom = own?.find((x) => x.id === party.page_custom_id);
  const theme = party.page_theme === "custom" && custom ? customTheme(custom, hostPicture(custom.id)) : partyTheme(party.page_theme);
  const open = party.tasks.filter((x) => !x.done);
  const waiting = party.guests.filter((g) => g.pending).length;
  const unseated = party.guests.filter((g) => (g.coming || g.pending) && !party.tables.some((x) => x.id === g.table_id)).length;
  const has = (st: Stage) => party.pages.includes(st);
  const invited = party.guests.length > 0 || party.mailings.some((m) => m.kind === "invite" && m.sent_at);
  const checks: { key: string; ok: boolean; label: string; to: Tab }[] = [
    { key: "tasks", ok: open.length === 0, label: open.length ? t("parties.check.tasks", { n: open.length }) : t("parties.check.tasksDone"), to: "tasks" },
    { key: "guests", ok: invited, label: invited ? t("parties.check.guests", { n: party.coming }) : t("parties.check.noGuests"), to: "guests" },
    { key: "capacity", ok: true, label: t("parties.capacity", { coming: party.capacity.coming, waiting: party.capacity.waiting, most: party.capacity.most }), to: "guests" },
    { key: "waiting", ok: waiting === 0, label: waiting ? t("parties.check.waiting", { n: waiting }) : t("parties.check.noWaiting"), to: "mailings" },
    { key: "allergies", ok: true, label: party.allergies.length ? t("parties.check.allergies", { n: party.allergies.length }) : t("parties.check.noAllergies"), to: "guests" },
    { key: "plan", ok: party.steps.length > 0, label: party.steps.length ? t("parties.check.plan", { n: party.steps.length }) : t("parties.check.noPlan"), to: "schedule" },
    ...(party.menu.length ? [{ key: "menu", ok: !party.menu_tally.some((m) => !m.id && m.people > 0), label: party.menu_tally.some((m) => !m.id && m.people > 0) ? t("parties.check.menuOpen", { n: party.menu_tally.find((m) => !m.id)?.people ?? 0 }) : t("parties.check.menuDone"), to: "guests" as Tab }] : []),
    ...(party.tables.length ? [{ key: "seating", ok: unseated === 0, label: unseated ? t("parties.check.unseated", { n: unseated }) : t("parties.check.seated"), to: "guests" as Tab }] : []),
    ...(has("checkin") ? [{ key: "checkin", ok: !party.guests.some((g) => g.coming && !g.checkin), label: t("checkin.counts", { yes: party.guests.filter((g) => g.checkin === "yes").length, no: party.guests.filter((g) => g.checkin === "no").length, waiting: party.guests.filter((g) => g.coming && !g.checkin).length }), to: "mailings" as Tab }] : []),
    ...(has("portal") ? [{ key: "portal", ok: !!party.portal?.at, label: party.portal?.at ? t("parties.check.portal") : t("parties.check.noPortal"), to: "mailings" as Tab }] : []),
    ...(has("thanks") ? [{ key: "thanks", ok: !!party.thanks_at || party.thanks_published, label: party.thanks_at || party.thanks_published ? t("parties.check.thanks") : t("parties.check.noThanks"), to: "design" as Tab }] : []),
  ];
  const left = checks.filter((c) => !c.ok).length;
  return (
    <div className="space-y-4">
      <section className="pt overflow-hidden rounded-2xl border border-edge text-center" style={{ ...themeStyle(theme), minHeight: 0 }} aria-label={t("parties.tab.party")}>
        <div className="h-2" style={{ background: theme.band }} />
        <div className="space-y-2 px-4 py-10">
          <p className="text-5xl" aria-hidden>{party.emoji}</p>
          <h2 className="pt-gold text-5xl leading-none sm:text-6xl" style={{ fontFamily: fontFamily("theme-script", theme, "script") }}>{t("parties.haveFun")}</h2>
          <p className="text-lg">{left ? t("parties.almostReady", { n: left }) : t("parties.allReady")}</p>
        </div>
      </section>
      <section className="card space-y-2 p-5" aria-label={t("parties.lastCheck")}>
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("parties.lastCheck")}</h2>
        <ul className="divide-y divide-edge">
          {checks.map((c) => (
            <li key={c.key} className="flex items-center gap-3 py-2 text-sm">
              {c.ok ? <Check className="h-5 w-5 shrink-0 text-accent" aria-label={t("parties.checkOk")} /> : <Circle className="h-5 w-5 shrink-0 text-muted" aria-label={t("parties.checkOpen")} />}
              <span className="min-w-0 flex-1">{c.label}</span>
              <button className="text-xs text-accent hover:underline" onClick={() => go(c.to)}>{t(`parties.tab.${c.to}` as TranslationKey)}</button>
            </li>
          ))}
        </ul>
      </section>
      {open.length > 0 && (
        <section className="card space-y-2 p-5" aria-label={t("parties.lastTasks")}>
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("parties.lastTasks")}</h2>
          <ul className="divide-y divide-edge">
            {open.map((task) => (
              <li key={task.id} className="flex items-center gap-3 py-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-primary-700" aria-label={task.title} checked={false} onChange={() => run(() => api.put<Detail>(`${path}/tasks/${task.id}`, { done: true }))} />
                <span className="min-w-0 flex-1">{task.title}</span>
                {task.action === "print_qr" && <a className="flex items-center gap-1 text-xs text-accent hover:underline" href={`/party-qr/${party.id}`} target="_blank" rel="noreferrer"><Printer className="h-4 w-4" aria-hidden />{t("parties.printIt")}</a>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// A picture on the invitation – the birthday child, the place, anything.
function InvitePicture({ party }: { party: Detail }) {
  const { t } = useI18n();
  const path = `/api/parties/${party.id}`;
  const [error, setError] = useState("");
  const keep = (p: Promise<unknown>) => p.then((next) => setApiData<Detail>(path, () => next as Detail)).catch((e) => setError(e instanceof Error ? e.message : t("common.error")));
  return (
    <div className="space-y-1">
      <span className="label">{t("parties.invitePicture")}</span>
      <span className="block text-xs text-muted">{t("parties.invitePictureHelp")}</span>
      {party.invite_image ? (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${path}/picture?v=${party.invite_image}`} alt="" className="h-14 w-20 rounded object-cover" />
          <button className="text-muted hover:text-red-700" aria-label={t("parties.removePicture")} onClick={() => keep(api.del(`${path}/picture`))}><Trash2 className="h-4 w-4" aria-hidden /></button>
        </div>
      ) : (
        <label className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-edge px-2 py-1.5 text-sm hover:bg-surface">
          <ImagePlus className="h-4 w-4" aria-hidden />
          {t("parties.addPicture")}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) keep(uploadFile<Detail>(`${path}/picture`, f)); e.target.value = ""; }} />
        </label>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

// A vote on the date: start one, see which dates suit how many, and choose.
function DatePoll({ party, change }: { party: Detail; change: Change }) {
  const { t, dateLocale } = useI18n();
  const initial = () => (party.date_poll ? party.date_options.map(localInput) : [localInput(party.starts_at), localInput(new Date(new Date(party.starts_at).getTime() + 7 * 86_400_000).toISOString())]);
  const [options, setOptions] = useState<string[]>(initial);
  const [starting, setStarting] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setOptions(initial()), [party.date_poll, party.date_options.join()]);
  const iso = () => options.filter(Boolean).map((o) => new Date(o).toISOString());
  const best = Math.max(0, ...party.tally.map((r) => r.votes));
  const decide = (option: string) => api.post<Detail>(`/api/parties/${party.id}/decide`, { option }).then((next) => setApiData<Detail>(`/api/parties/${party.id}`, () => next)).catch((e) => window.alert(e instanceof Error ? e.message : t("common.error")));

  if (!party.date_poll) {
    return (
      <section className="card space-y-2 p-5 lg:col-start-1" aria-label={t("parties.poll")}>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-4 w-4 accent-primary-700" checked={starting} onChange={(e) => setStarting(e.target.checked)} />{t("parties.datePoll")}</label>
        {starting && (
          <>
            <p className="text-xs text-muted">{t("parties.datePollHelp")}</p>
            <DateOptions value={options} onChange={setOptions} />
            <button className="btn-primary" disabled={iso().length < 2} onClick={() => change({ date_poll: true, date_options: iso() }).then(() => setStarting(false))}>{t("parties.startPoll")}</button>
          </>
        )}
      </section>
    );
  }
  return (
    <section className="card space-y-3 p-5 lg:col-start-1" aria-label={t("parties.poll")}>
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("parties.poll")}</h2>
      <ul className="space-y-3">
        {party.tally.map((r) => {
          const label = new Date(r.option).toLocaleString(dateLocale, LONG);
          return (
            <li key={r.option} className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className={`flex-1 first-letter:uppercase ${r.votes === best && best > 0 ? "font-bold" : "font-semibold"}`}>{label}</span>
                <span className="text-xs text-muted">{t("parties.votesN", { n: r.votes, people: r.people })}</span>
                <button className="btn-ghost border border-edge px-2 py-0.5 text-xs" onClick={() => window.confirm(t("parties.pickConfirm", { when: label })) && decide(r.option)}>
                  {t("parties.pick")}
                </button>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-base"><div className="h-full rounded-full bg-accent" style={{ width: `${best ? (r.votes / best) * 100 : 0}%` }} /></div>
              {r.names.length > 0 && <p className="text-xs text-muted">{r.names.join(", ")}</p>}
            </li>
          );
        })}
      </ul>
      {party.mail && <p className="text-xs text-muted">{t("parties.pollMail")}</p>}
      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-muted">{t("parties.addDate")}</summary>
        <div className="mt-2 space-y-2">
          <DateOptions value={options} onChange={setOptions} />
          <SaveButton disabled={iso().length < 2} onSave={() => change({ date_options: iso() }, { quiet: true })} />
        </div>
      </details>
    </section>
  );
}

// A guest's and their company's personal link, to send oneself. Fetched when asked for: the keys stay
// out of the page's data and its cache. Where the browser won't copy, the link is shown to copy by hand.
function GuestLink({ path, name }: { path: string; name: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<{ copied?: boolean; link?: string; error?: string }>({});
  const copy = async () => {
    try {
      const { link } = await api.post<{ link: string }>(path);
      try {
        await navigator.clipboard.writeText(link);
        setState({ copied: true });
        setTimeout(() => setState({}), 2500);
      } catch {
        setState({ link });
      }
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : t("common.error") });
    }
  };
  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <button className="flex items-center gap-1 text-xs text-muted hover:text-ink" title={t("parties.copyGuestLink", { name })} aria-label={t("parties.copyGuestLink", { name })} onClick={() => { void copy(); }}>
        {state.copied ? <><Check className="h-4 w-4 text-accent" aria-hidden /><span className="font-semibold text-accent" role="status">{t("parties.linkCopied")}</span></> : <Link2 className="h-4 w-4" aria-hidden />}
      </button>
      {state.link && <input className="input w-48 text-xs" readOnly autoFocus value={state.link} aria-label={t("parties.copyGuestLink", { name })} onFocus={(e) => e.target.select()} />}
      {state.error && <span className="text-xs text-red-700" role="alert">{state.error}</span>}
    </span>
  );
}

const low = (s?: string) => (s ?? "").trim().toLowerCase();
const samePerson = (c: { first_name: string; last_name: string }, o: { first_name: string; last_name: string }) =>
  !!low(c.first_name) && low(c.first_name) === low(o.first_name) && (!low(c.last_name) || !low(o.last_name) || low(c.last_name) === low(o.last_name));

// Who a guest belongs together with: each keeps their own reply and link, and they count as one company.
function GuestGroup({ guest, guests, link }: { guest: Guest; guests: Guest[]; link: (withId: string | null) => void }) {
  const { t } = useI18n();
  const name = (g: Guest) => `${g.first_name} ${g.last_name}`.trim();
  const others = guests.filter((g) => g.id !== guest.id);
  const with_them = guest.group_id ? others.filter((g) => g.group_id === guest.group_id) : [];
  const free = others.filter((g) => !guest.group_id || g.group_id !== guest.group_id);
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
      {with_them.length > 0 && <><span>🔗 {t("parties.togetherWith", { names: with_them.map(name).join(", ") })}</span><button className="underline underline-offset-2 hover:text-ink" aria-label={t("parties.unlinkOf", { name: guest.first_name })} onClick={() => link(null)}>{t("parties.unlink")}</button></>}
      {free.length > 0 && (
        <select className="input !w-auto py-0 text-xs" aria-label={t("parties.linkOf", { name: guest.first_name })} value="" onChange={(e) => e.target.value && link(e.target.value)}>
          <option value="">{t("parties.linkWith")}</option>
          {free.map((g) => <option key={g.id} value={g.id}>{name(g)}</option>)}
        </select>
      )}
    </span>
  );
}

function GuestsTab({ party, run, change, path }: TabProps & { change: Change }) {
  const { t, dateLocale } = useI18n();
  const blank = { first_name: "", last_name: "", email: "", allergies: "", status: "invited" as "invited" | "coming" | "not" };
  const [form, setForm] = useState(blank);
  const people = party.guests;
  const emails = people.filter((g) => g.email).map((g) => g.email).join(", ");
  // Someone's +1 who's also on the list by themselves: counted twice until they're put together.
  const doubles = people.flatMap((g) => people.filter((o) => o.id !== g.id && (!g.group_id || g.group_id !== o.group_id) && g.companions.some((c) => samePerson(c, o))).map((o) => [g, o] as const));
  return (
    <div className="space-y-4">
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <section className="card p-5" aria-label={t("parties.tab.guests")}>
        <p className="mb-3 text-sm font-semibold">{t("parties.replies", { coming: party.coming, not: party.not_coming })}{party.children > 0 && <span className="font-normal text-muted"> · {t("parties.childrenN", { n: party.children })}</span>}{party.signed_up > 0 && <span className="font-normal text-muted"> · {t("parties.waitingN", { n: party.signed_up })}</span>}</p>
        <p className="mb-3 text-sm" data-testid="capacity">{t("parties.capacity", { coming: party.capacity.coming, waiting: party.capacity.waiting, most: party.capacity.most })}{party.capacity.open && <span className="text-muted"> {t("parties.capacityOpen")}</span>}</p>
        {doubles.length > 0 && (
          <ul className="mb-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" aria-label={t("parties.doubles")}>
            {doubles.map(([g, o]) => (
              <li key={`${g.id}:${o.id}`} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1">{t("parties.doubleGuest", { guest: g.first_name, other: `${o.first_name} ${o.last_name}`.trim() })}</span>
                <button className="btn-ghost border border-amber-300 text-xs" onClick={() => run(() => api.put<Detail>(`${path}/guests/${g.id}/group`, { with_id: o.id }))}>{t("parties.linkThem")}</button>
              </li>
            ))}
          </ul>
        )}
        {people.length === 0 ? (
          <EmptyState>{t("parties.noReplies")}</EmptyState>
        ) : (
          <ul className="divide-y divide-edge text-sm [overflow-wrap:anywhere]">
            {people.map((g) => (
              <li key={g.id} className="flex items-start gap-3 py-2">
                <span className={`mt-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${g.coming ? "bg-green-50 text-green-800" : g.pending ? "bg-amber-50 text-amber-800" : "bg-base text-muted"}`}>{g.coming ? t("parties.yes") : g.pending ? t("parties.awaitingReply") : t("parties.no")}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{`${g.first_name} ${g.last_name}`.trim()}</span>
                  {g.email && <span className={`ml-1 text-xs ${g.updates ? "text-muted" : "text-muted line-through"}`} title={g.updates ? g.email : t("parties.noMails")}>✉ {g.email}</span>}
                  {g.allergies && <span className="text-muted"> · {g.allergies}</span>}
                  {g.menu_choice && <span className="text-muted"> · {party.menu.find((m) => m.id === g.menu_choice)?.name}</span>}
                  {g.wants_speech && <span className="ml-1 text-xs text-muted" title={g.speech_note}>🎤 {t("party.wantsSpeech")}</span>}
                  {g.checkin && <span className="ml-1" title={t(g.checkin === "yes" ? "party.checkinYes" : "party.checkinNo")} aria-label={t(g.checkin === "yes" ? "party.checkinYes" : "party.checkinNo")}>{g.checkin === "yes" ? "👍" : "👎"}</span>}
                  {party.date_poll && g.date_votes.length > 0 && <span className="block text-xs text-muted first-letter:uppercase">{t("parties.voted", { dates: g.date_votes.map((d) => new Date(d).toLocaleDateString(dateLocale, { weekday: "short", day: "numeric", month: "short" })).join(", ") })}</span>}
                  {g.companions.length > 0 && (
                    <span className="block text-xs text-muted">
                      {t("parties.withThem", { names: g.companions.map((c) => `${c.first_name} ${c.last_name}`.trim() + (c.child ? ` (${t("parties.child")})` : "") + (c.allergies ? ` · ${c.allergies}` : "")).join(", ") })}
                    </span>
                  )}
                  {g.message && <span className="block text-xs italic text-muted">“{g.message}”</span>}
                  <GuestGroup guest={g} guests={people} link={(with_id) => run(() => api.put<Detail>(`${path}/guests/${g.id}/group`, { with_id }))} />
                </span>
                <GuestLink path={`${path}/guests/${g.id}/link`} name={g.first_name} />
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
        {party.menu.length > 0 && (
          <section className="card p-5" aria-label={t("parties.menuTally")}>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{t("parties.menuTally")}</h2>
            <ul className="space-y-1 text-sm">
              {party.menu_tally.filter((m) => m.id || m.people > 0).map((m) => <li key={m.id ?? "none"} className="flex justify-between gap-2"><span>{m.id ? m.name : t("parties.menuUnchosen")}</span><span className="font-semibold">{m.people}</span></li>)}
            </ul>
          </section>
        )}
        {emails && (
          <section className="card space-y-2 p-5" aria-label={t("parties.emails")}>
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("parties.emails")}</h2>
            <textarea className="input min-h-16 text-xs" readOnly value={emails} aria-label={t("parties.emails")} onFocus={(e) => e.target.select()} />
            <button className="btn-ghost flex items-center gap-1.5 border border-edge text-sm" onClick={() => navigator.clipboard?.writeText(emails)}><Copy className="h-4 w-4" aria-hidden />{t("parties.copy")}</button>
          </section>
        )}
        <section className="card space-y-2 p-5" aria-label={t("parties.addGuest")}>
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("parties.addGuest")}</h2>
          <p className="text-xs text-muted">{t("parties.addGuestHelp")}</p>
          <input className="input" placeholder={t("parties.firstName")} aria-label={t("parties.firstName")} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          <input className="input" placeholder={t("parties.lastName")} aria-label={t("parties.lastName")} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          <input className="input" type="email" placeholder={t("party.email")} aria-label={t("party.email")} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="input" placeholder={t("parties.allergiesPh")} aria-label={t("parties.allergiesLabel")} value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} />
          <select className="input" aria-label={t("parties.guestStatus")} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}>
            <option value="invited">{t("parties.status.invited")}</option>
            <option value="coming">{t("parties.status.coming")}</option>
            <option value="not">{t("parties.status.not")}</option>
          </select>
          <button className="btn-primary" disabled={!form.first_name.trim() || (!!form.email && !form.email.includes("@"))} onClick={() => run(() => api.post<Detail>(`${path}/guests`, { first_name: form.first_name, last_name: form.last_name, email: form.email.trim() || null, allergies: form.allergies, coming: form.status === "coming", invited: form.status === "invited", updates: !!form.email.trim() })).then(() => setForm(blank))}>{t("parties.add")}</button>
        </section>
        <GuestImport path={path} onDone={(detail) => run(async () => detail as Detail)} />
      </div>
    </div>
    <Seating party={party} run={run} change={change} path={path} />
    {party.guest_chat && (
      <section className="card space-y-2 p-5" aria-label={t("partyChat.heading")}>
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("partyChat.heading")}</h2>
        <PartyChat path={`${path}/chat/guests`} remove label={t("partyChat.heading")} buttonClass="btn-primary" />
      </section>
    )}
    </div>
  );
}

function TasksTab({ party, run, path }: TabProps) {
  const { t } = useI18n();
  const assign = (id: string, value: string) => run(() => api.put<Detail>(`${path}/tasks/${id}`, { who: value.startsWith("u:") ? value.slice(2) : null, helper_id: value.startsWith("h:") ? value.slice(2) : null }));
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  return (
    <section className="card p-5" aria-label={t("parties.tab.tasks")}>
      <p className="mb-3 text-xs text-muted">{t("parties.tasksHelp")}</p>
      {(["before", "day", "after", "none"] as const).map((when) => {
        const day = localInput(party.starts_at).slice(0, 10);
        const list = party.tasks.filter((x) => (!x.due_date ? "none" : x.due_date < day ? "before" : x.due_date === day ? "day" : "after") === when);
        if (!list.length) return null;
        return (
          <div key={when} className="mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted">{t(`parties.when.${when}` as TranslationKey)}</h3>
      <ul className="divide-y divide-edge">
        {list.map((task) => (
          <li key={task.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-primary-700" aria-label={task.title} checked={task.done} onChange={(e) => run(() => api.put<Detail>(`${path}/tasks/${task.id}`, { done: e.target.checked }))} />
            <span className={`min-w-40 flex-1 ${task.done ? "text-muted line-through" : ""}`}>{task.title}</span>
            {task.action === "print_qr" && <a className="btn-ghost flex items-center gap-1 border border-edge text-xs" href={`/party-qr/${party.id}`} target="_blank" rel="noreferrer"><Printer className="h-4 w-4" aria-hidden />{t("parties.printIt")}</a>}
            <select className="input !w-auto py-0.5 text-xs" aria-label={t("parties.taskWho", { task: task.title })} value={task.helper_id ? `h:${task.helper_id}` : task.who ? `u:${task.who}` : ""} onChange={(e) => assign(task.id, e.target.value)}>
              <option value="">{t("parties.taskAnyone")}</option>
              {party.adults.map((a) => <option key={a.id} value={`u:${a.id}`}>{a.name}</option>)}
              {party.helpers.map((h) => <option key={h.id} value={`h:${h.id}`}>{h.name}</option>)}
            </select>
            <input className="input !w-auto py-0.5 text-xs" type="date" aria-label={t("parties.due")} value={task.due_date ?? ""} onChange={(e) => run(() => api.put<Detail>(`${path}/tasks/${task.id}`, { due_date: e.target.value || null }))} />
            <button className="text-muted hover:text-red-700" aria-label={t("common.remove")} onClick={() => run(() => api.del(`${path}/tasks/${task.id}`).then(() => api.get<Detail>(path)))}><Trash2 className="h-4 w-4" aria-hidden /></button>
          </li>
        ))}
      </ul>
          </div>
        );
      })}
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (title.trim()) void run(() => api.post<Detail>(`${path}/tasks`, { title, due_date: due || null })).then(() => { setTitle(""); setDue(""); }); }}>
        <input className="input flex-1" placeholder={t("parties.newTask")} aria-label={t("parties.newTask")} value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="input !w-auto" type="date" aria-label={t("parties.due")} value={due} onChange={(e) => setDue(e.target.value)} />
        <button className="btn-primary flex items-center gap-1" type="submit" disabled={!title.trim()}><Plus className="h-4 w-4" aria-hidden />{t("parties.add")}</button>
      </form>
      {party.tasks.length > 0 && <p className="mt-2 text-xs text-muted">{t("parties.tasksDone", { n: party.tasks.filter((x) => x.done).length, total: party.tasks.length })}</p>}
    </section>
  );
}

function BudgetTab({ party, run, path, change }: TabProps & { change: Change }) {
  const { t, dateLocale } = useI18n();
  const [form, setForm] = useState({ title: "", amount: "" });
  const [budget, setBudget] = useState(party.budget?.toString() ?? "");
  const money = (n: number) => n.toLocaleString(dateLocale, { maximumFractionDigits: 2 });
  const left = party.budget != null ? party.budget - party.spent : null;
  return (
    <section className="card space-y-3 p-5" aria-label={t("parties.tab.budget")}>
      <div className="flex flex-wrap items-end gap-2">
        <label><span className="label">{t("parties.budget")}</span><input className="input !w-40" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
        <SaveButton onSave={() => change({ budget: budget ? Number(budget.replace(",", ".")) : null }, { quiet: true })} />
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
  const [form, setForm] = useState({ at: "", title: "", hidden: false });
  return (
    <section className="card p-5" aria-label={t("parties.tab.schedule")}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-xs text-muted">{t("parties.timelineHelp")}</p>
        <a className="btn-ghost flex items-center gap-1 border border-edge text-xs" href={`/party-print/${party.id}/run`} target="_blank" rel="noreferrer"><Printer className="h-4 w-4" aria-hidden />{t("print.run")}</a>
      </div>
      <ol className="space-y-1.5 text-sm">
        {party.steps.map((s) => (
          <li key={s.id} className="flex items-center gap-3">
            <span className="w-12 font-bold tabular-nums">{s.at}</span>
            <span className={`flex-1 ${s.hidden ? "text-muted" : ""}`}>{s.title}{s.hidden && <span className="ml-2 text-xs">({t("parties.hiddenStep")})</span>}</span>
            <button className="text-muted hover:text-ink" aria-label={s.hidden ? t("parties.showStep", { title: s.title }) : t("parties.hideStep", { title: s.title })} title={s.hidden ? t("parties.showStepShort") : t("parties.hideStepShort")} onClick={() => run(() => api.put<Detail>(`${path}/steps/${s.id}`, { hidden: !s.hidden }))}>{s.hidden ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}</button>
            <button className="text-muted hover:text-red-700" aria-label={t("common.remove")} onClick={() => run(() => api.del(`${path}/steps/${s.id}`).then(() => api.get<Detail>(path)))}><Trash2 className="h-4 w-4" aria-hidden /></button>
          </li>
        ))}
      </ol>
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (form.at && form.title.trim()) void run(() => api.post<Detail>(`${path}/steps`, form)).then(() => setForm({ at: "", title: "", hidden: false })); }}>
        <input className="input !w-28" type="time" aria-label={t("parties.time")} value={form.at} onChange={(e) => setForm({ ...form, at: e.target.value })} />
        <input className="input flex-1" placeholder={t("parties.stepPh")} aria-label={t("parties.step")} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary-700" checked={form.hidden} onChange={(e) => setForm({ ...form, hidden: e.target.checked })} />{t("parties.hideStepShort")}</label>
        <button className="btn-primary" type="submit">{t("parties.add")}</button>
      </form>
    </section>
  );
}

function MailingsTab({ party, run, change, path, newLink }: TabProps & { change: Change; newLink: () => void }) {
  const { t, dateLocale } = useI18n();
  const soon = new Date(Date.now() + 3_600_000);
  const [form, setForm] = useState({ kind: "custom", audience: "all", subject: "", text: "", when: localInput(soon.toISOString()) });
  const add = (sendAt: Date) => run(() => api.post<Detail>(`${path}/mailings`, { kind: form.kind, audience: form.audience, subject: form.subject, text: form.text, send_at: sendAt.toISOString() })).then(() => setForm({ ...form, subject: "", text: "" }));
  const reach = (aud: string) => party.guests.filter((g) => g.email && g.updates && (aud === "all" || (aud === "waiting" ? g.pending : g.coming))).length;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card space-y-2 p-5 lg:col-span-2" aria-label={t("parties.journey")}>
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("parties.journey")}</h2>
        <p className="text-xs text-muted">{t("parties.journeyHelp")}</p>
        <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {STAGES.filter((st) => party.pages.includes(st)).map((st) => {
            const at = st === "checkin" ? party.checkin_at : st === "portal" ? party.portal?.at : st === "thanks" ? party.thanks_at : null;
            return (
              <li key={st} aria-current={party.stage === st ? "step" : undefined} className={`rounded-xl border p-3 text-sm ${party.stage === st ? "border-accent bg-accent-soft" : "border-edge"}`}>
                <span className="block font-semibold">{t(`parties.stage.${st}` as TranslationKey)}</span>
                <span className="block text-xs text-muted">{party.stage === st ? t("parties.stageNow") : at ? new Date(at).toLocaleString(dateLocale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : t(`parties.stageNext.${st}` as TranslationKey)}</span>
              </li>
            );
          })}
        </ol>
      </section>
      <section className="card min-w-0 space-y-3 p-5" aria-label={t("parties.mailings")}>
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("parties.mailings")}</h2>
        {party.mail && !party.address_set && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t("parties.noAddress")}</p>}
        {party.mail && (
          <label className="block">
            <span className="label">{t("parties.remindWaiting")}</span>
            <select className="input" value={party.rsvp_remind_days ?? 0} onChange={(e) => change({ rsvp_remind_days: Number(e.target.value) || null })}>
              <option value={0}>{t("parties.remindOff")}</option>
              {[1, 2, 3, 5, 7, 14].map((n) => <option key={n} value={n}>{t("parties.remindDays", { n })}</option>)}
            </select>
            <span className="mt-1 block text-xs text-muted">{party.rsvp_reminded_on ? t("parties.remindSent", { date: party.rsvp_reminded_on }) : t("parties.remindHelp")}</span>
          </label>
        )}
        {!party.mail ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t("parties.noMailService")}</p>
        ) : (
          <>
            <p className="text-xs text-muted">{t("parties.mailingsHelp")}</p>
            {party.mailings.length > 0 && (
              <ul className="divide-y divide-edge text-sm">
                {party.mailings.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{m.kind === "custom" ? m.subject : t(`parties.mail.${m.kind}` as TranslationKey)}</span>
                      <span className="block text-xs text-muted">
                        {t(`parties.audience.${m.audience}` as TranslationKey)} · {m.sent_at ? t("parties.mailSent", { n: m.sent_count, when: new Date(m.sent_at).toLocaleString(dateLocale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) }) : t("parties.mailPlanned", { when: new Date(m.send_at).toLocaleString(dateLocale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}
                      </span>
                    </span>
                    {!m.sent_at && <button className="text-muted hover:text-red-700" aria-label={t("common.remove")} onClick={() => run(() => api.del(`${path}/mailings/${m.id}`).then(() => api.get<Detail>(path)))}><Trash2 className="h-4 w-4" aria-hidden /></button>}
                  </li>
                ))}
              </ul>
            )}
            <div className="space-y-2 rounded-xl border border-edge p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <label><span className="label">{t("parties.mailTo")}</span>
                  <select className="input" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
                    {(["all", "waiting", "coming"] as const).map((k) => <option key={k} value={k}>{`${t(`parties.audience.${k}` as TranslationKey)} (${reach(k)})`}</option>)}
                  </select>
                </label>
              </div>
              {form.kind === "custom" && (
                <>
                  <input className="input" placeholder={t("parties.announceSubject")} aria-label={t("parties.announceSubject")} value={form.subject} maxLength={120} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
                  <textarea className="input min-h-20" placeholder={t("parties.announceText")} aria-label={t("parties.announceText")} value={form.text} maxLength={4000} onChange={(e) => setForm({ ...form, text: e.target.value })} />
                </>
              )}
              <label className="block"><span className="label">{t("parties.mailWhen")}</span><input className="input" type="datetime-local" value={form.when} onChange={(e) => setForm({ ...form, when: e.target.value })} /></label>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" disabled={form.kind === "custom" && (!form.subject.trim() || !form.text.trim())} onClick={() => add(new Date(form.when))}>{t("parties.mailPlan")}</button>
                <button className="btn-ghost border border-edge" disabled={form.kind === "custom" && (!form.subject.trim() || !form.text.trim())} onClick={() => add(new Date())}>{t("parties.mailNow")}</button>
              </div>
            </div>
          </>
        )}
      </section>
      <section className="card min-w-0 space-y-3 p-5" aria-label={t("parties.share")}>
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("parties.share")}</h2>
        <p className="text-xs text-muted">{party.mail ? t("parties.shareHelp") : t("parties.shareHelpNoMail")}</p>
        <ShareMessage party={party} change={change} />
        <figure className="m-0 space-y-1 text-center">
          <div className="mx-auto w-40 rounded-lg bg-white p-2 [&>svg]:h-auto [&>svg]:w-full" aria-label={t("parties.qrInvite")} dangerouslySetInnerHTML={{ __html: party.qr_svg }} />
          <figcaption className="text-xs text-muted">{t("parties.qrInvite")}</figcaption>
        </figure>
        <button className="text-xs text-muted hover:underline" onClick={() => window.confirm(t("parties.newLinkConfirm")) && newLink()}>{t("parties.newLink")}</button>
      </section>
      {party.pages.includes("checkin") && <CheckinCard party={party} change={change} />}
      {party.pages.includes("portal") && <PortalCard party={party} run={run} change={change} path={path} />}
      <MailTemplates party={party} run={run} change={change} path={path} />
    </div>
  );
}

function ThanksTab({ party, change }: { party: Detail; change: Change }) {
  const { t } = useI18n();
  const albums = useApi<Album[]>(party.you.helper ? null : "/api/albums").data ?? NONE;
  const [text, setText] = useState(party.thanks_text);
  return (
    <section className="card space-y-3 p-5" aria-label={t("parties.thanksSection")}>
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("parties.thanksSection")}</h2>
      <p className="text-xs text-muted">{t("parties.thanksHelp")}</p>
      <label className="block"><span className="label">{t("parties.thanksText")}</span><textarea className="input min-h-24" value={text} maxLength={4000} placeholder={t("parties.thanksPh")} onChange={(e) => setText(e.target.value)} /></label>
      {!party.you.helper && <label className="block">
        <span className="label">{t("parties.album")}</span>
        <select className="input" value={party.thanks_album_id ?? ""} onChange={(e) => change({ thanks_album_id: e.target.value || null })}>
          <option value="">{t("parties.noAlbum")}</option>
          {albums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>}
      <WhenField label={t("parties.thanksAt")} help={t("parties.thanksAtHelp")} value={party.thanks_at} suggest={new Date(new Date(party.ends_at).getTime() + 86_400_000).toISOString()} onSave={(at) => change({ thanks_text: text, thanks_at: at }, { quiet: !!at })} />
      <div className="flex flex-wrap items-center gap-3">
        <SaveButton onSave={() => change({ thanks_text: text }, { quiet: true })} />
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
