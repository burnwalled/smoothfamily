"use client";

// A party's invitation page (3.4.0), for the guests – no account: what, when and where, the
// reply (first and last name, allergies, and whoever they bring as far as the hosts allow – a +1
// or the whole family), a vote on the date if it's still open, "add to my calendar",
// the wish list if the hosts chose it, and afterwards the thank-you with the day's photos. The
// keys to change your reply and your reservations stay in this browser. The same link is the guest's
// all the way: a mail's personal link (?key=) ties it to their reply, it shows the reply when opened
// again, opens the party day's portal from its set time, and the thank-you once it's out.
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ExternalLink, Gift, Heart, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { isLocale, useI18n } from "@/lib/i18n";
import { CustomTheme, customTheme, partyTheme, themeStyle } from "@/lib/partyThemes";
import { FONTS } from "@/lib/partyFonts";
import PartySky from "@/components/parties/PartySky";
import Poster from "@/components/parties/Poster";
import PartyChat from "@/components/parties/PartyChat";
import { Block, PosterData, Stage, defaultPoster, withChat } from "@/lib/poster";

type Companion = { first_name: string; last_name: string; child: boolean; allergies: string ; menu_choice?: string | null };
type Reply = { first_name: string; last_name: string; coming: boolean; allergies: string; message: string; companions: Companion[]; email: string | null; updates: boolean; date_votes: string[]; pending?: boolean; wants_speech?: boolean; speech_note?: string; menu_choice?: string | null; checkin?: string | null; for_group?: boolean };
type Page = {
  // What the link shows now, and where the portal is once its time has come.
  stage: Stage;
  portal_token: string | null;
  language: string;
  page_theme: string;
  // The family's own themes, when "custom", and a picture on the invitation (its version).
  page_custom: CustomTheme | null;
  invite_image: string | null;
  // The hosts' own poster (its blocks; none = the theme's) and its pictures.
  layout: Block[] | null;
  assets: { id: string; v: string | null }[];
  // The posters by stage, what the link shows first, and the playlist.
  layouts: Partial<Record<Stage, Block[] | null>>;
  phase: "save" | "invite";
  playlist_url: string | null;
  // The server can send e-mail: the guest may ask for updates.
  mail: boolean;
  // A vote on the date (the options' starts, and how many each suits if the hosts show it).
  date_poll: boolean; date_options: string[]; tally: { option: string; votes: number; people: number }[] | null;
  title: string; kind: string; emoji: string; color: string; family_name: string; starts_at: string; ends_at: string; place: string; address: string; theme: string;
  invitation: string; rsvp_by: string | null; bring: "none" | "one" | "family"; open: boolean;
  guests: { coming: number; names?: string[] } | null;
  wishes: { id: string; title: string; url: string | null; note: string | null; reserved: boolean; reserved_by_you: boolean }[] | null;
  thanks: { text: string; photos: string[] } | null;
  mine: Reply | null;
  // Those the hosts have put together with this guest, each with their own reply.
  together: { name: string; pending: boolean }[];
  guest_chat: boolean;
  menu: { id: string; name: string }[]; speech_signup: boolean; practical: { parking?: string; lodging?: string; travel?: string };
};

// A thumb up or down before the party, by the guest's own link. Down changes their reply.
function CheckIn({ token, mine, guestKey, onDone }: { token: string; mine: Reply | null; guestKey?: string; onDone: () => void }) {
  const { t } = useI18n();
  const [going, setGoing] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  if (!mine || !guestKey) return <p className="text-sm text-muted">{t("party.checkinNeedsLink")}</p>;
  const send = async () => {
    setError("");
    try {
      await api.post(`/api/party/${token}/checkin?key=${encodeURIComponent(guestKey)}`, { going, message });
      setSent(true);
      setGoing(null);
      setMessage("");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-lg font-semibold">{mine.pending ? t("party.checkinWaiting", { name: mine.first_name }) : mine.coming ? t("party.checkinYou", { name: mine.first_name }) : t("party.replyNot", { name: mine.first_name })}</p>
      <div className="flex gap-3" role="radiogroup" aria-label={t("party.checkinHeading")}>
        {[true, false].map((v) => (
          <button key={String(v)} type="button" role="radio" aria-checked={going === v} aria-label={t(v ? "party.checkinYes" : "party.checkinNo")} className={`flex flex-1 flex-col items-center gap-1 rounded-2xl border-2 p-4 text-sm font-semibold ${going === v ? "border-accent" : "border-edge"}`} onClick={() => setGoing(v)}>
            <span className="text-4xl" aria-hidden>{v ? "👍" : "👎"}</span>
            {t(v ? "party.checkinYes" : "party.checkinNo")}
          </button>
        ))}
      </div>
      {going !== null && (
        <>
          <label className="block"><span className="label">{t(going ? "party.checkinNoteYes" : "party.checkinNoteNo")}</span><input className="input" value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} /></label>
          <button className="pt-btn" type="button" onClick={() => { void send(); }}>{t("party.checkinSend")}</button>
        </>
      )}
      {sent && <p className="text-sm font-semibold text-accent" role="status">{t("party.checkinThanks")}</p>}
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    </div>
  );
}

const EMPTY: Reply = { first_name: "", last_name: "", coming: true, allergies: "", message: "", companions: [], email: "", updates: false, date_votes: [] };
const NOBODY: Companion = { first_name: "", last_name: "", child: false, allergies: "" };

function stored(name: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(name) ?? "{}");
  } catch {
    return {};
  }
}

function keep(name: string, key: string, value: string | null) {
  try {
    const all = stored(name);
    if (value) all[key] = value;
    else delete all[key];
    localStorage.setItem(name, JSON.stringify(all));
  } catch {}
}

// From the save-the-date: a name and an e-mail, for the invitation when it's out.
function Subscribe({ token, onDone, mine }: { token: string; onDone: (key: string) => void; mine: boolean }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "" });
  const [done, setDone] = useState(mine);
  const [error, setError] = useState("");
  if (done) return <p className="text-lg font-semibold text-accent" role="status">{t("party.subscribed")}</p>;
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      setError("");
      try {
        const existing = stored("sf.party-keys")[token];
        const r = await api.post<{ key: string }>(`/api/party/${token}/subscribe${existing ? `?key=${encodeURIComponent(existing)}` : ""}`, form);
        onDone(r.key);
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("common.error"));
      }
    }}>
      <p className="text-sm text-muted">{t("party.subscribeHelp")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label><span className="label">{t("parties.firstName")}</span><input className="input" autoComplete="given-name" value={form.first_name} maxLength={80} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></label>
        <label><span className="label">{t("parties.lastName")}</span><input className="input" autoComplete="family-name" value={form.last_name} maxLength={80} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></label>
      </div>
      <label className="block"><span className="label">{t("party.email")}</span><input className="input" type="email" autoComplete="email" value={form.email} maxLength={254} placeholder={t("party.emailPh")} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button className="pt-btn" type="submit" disabled={!form.first_name.trim() || !form.email.includes("@")}>{t("party.subscribeButton")}</button>
    </form>
  );
}

export default function PartyInvitation() {
  const { token } = useParams<{ token: string }>();
  const { t, dateLocale, setLocale } = useI18n();
  const router = useRouter();
  const linkKey = useRef<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [page, setPage] = useState<Page | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [form, setForm] = useState<Reply>(EMPTY);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [stopped, setStopped] = useState(false);

  // The link at the bottom of each mail: no more updates.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("unsubscribe");
    if (code) api.post(`/api/party/${token}/unsubscribe`, { code }).then(() => setStopped(true)).catch(() => {});
  }, [token]);

  const key = () => linkKey.current ?? stored("sf.party-keys")[token];
  const load = useCallback(() => {
    // A personal link from a mail: this browser is that guest from now on, and the key leaves the address.
    const url = new URL(window.location.href);
    const fromLink = url.searchParams.get("key");
    if (fromLink) {
      linkKey.current = fromLink;
      keep("sf.party-keys", token, fromLink);
      url.searchParams.delete("key");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
    const replyKey = linkKey.current ?? stored("sf.party-keys")[token];
    const wishKey = stored("sf.party-wish-keys")[token];
    const q = new URLSearchParams();
    if (replyKey) q.set("key", replyKey);
    if (wishKey) q.set("wish_key", wishKey);
    api.get<Page>(`/api/party/${token}${q.toString() ? `?${q}` : ""}`)
      .then((p) => {
        if (p.stage === "portal" && p.portal_token) {
          router.replace(`/fest/${p.portal_token}`);
          return;
        }
        setPage(p);
        // The family's language, unless this browser has chosen one.
        try {
          if (!localStorage.getItem("sf.locale") && isLocale(p.language)) setLocale(p.language);
        } catch {}
        if (p.mine) {
          // Signed up or invited, no reply yet: the form starts as a yes, with their e-mail kept up to date.
          setForm({ ...EMPTY, ...p.mine, email: p.mine.email ?? "", ...(p.mine.pending ? { coming: true, updates: !!p.mine.email } : {}) });
        }
      })
      .catch(() => setInvalid(true));
  }, [token, setLocale, router]);
  useEffect(load, [load]);

  async function send() {
    setError("");
    setSaved(false);
    try {
      const body = {
        ...form, companions: form.companions.filter((c) => c.first_name.trim()),
        email: form.email?.trim() || null, updates: !!form.email?.trim() && form.updates,
        coming: page?.date_poll ? form.date_votes.length > 0 : form.coming,
      };
      const existing = key();
      const done = await api.post<{ key: string }>(`/api/party/${token}/reply${existing ? `?key=${encodeURIComponent(existing)}` : ""}`, body);
      keep("sf.party-keys", token, done.key);
      try {
        localStorage.setItem("sf.guest-name", form.first_name.trim());
      } catch {}
      setSaved(true);
      setChanging(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function reserve(id: string, on: boolean) {
    setError("");
    try {
      const wishKey = stored("sf.party-wish-keys")[token];
      if (on) {
        const { key: k } = await api.post<{ key: string }>(`/api/party/${token}/wishes/${id}/reserve`, { name: form.first_name.trim() || "?" });
        // One key per wish: kept as token:wish → key, the latest one sent along when reading.
        keep("sf.party-wish-keys", token, k);
        keep("sf.party-wish-keys", `${token}:${id}`, k);
      } else {
        const k = stored("sf.party-wish-keys")[`${token}:${id}`] ?? wishKey;
        await api.del(`/api/party/${token}/wishes/${id}/reserve?key=${encodeURIComponent(k)}`);
        keep("sf.party-wish-keys", `${token}:${id}`, null);
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  if (invalid) return <main className="mx-auto max-w-lg p-6 text-center text-muted">{t("party.invalid")}</main>;
  if (!page) return <main className="mx-auto max-w-lg p-6 text-center text-muted">{t("common.loading")}</main>;
  const start = new Date(page.starts_at);
  const end = new Date(page.ends_at);
  const mineWish = stored("sf.party-wish-keys");
  const themeKey = page.page_theme;
  const own = page.page_custom;
  const theme = themeKey === "custom" && own ? customTheme(own, (slot, v) => `/api/party/${token}/themes/${own.id}/${slot}?v=${v}`) : partyTheme(themeKey);
  const poll = page.date_poll;
  const coming = poll || form.coming;
  const together = page.together ?? [];
  const most = together.length > 0 && page.bring === "one" ? 0 : page.bring === "one" ? 1 : page.bring === "family" ? 20 : 0;
  const waitingWith = together.filter((x) => x.pending);
  const setCompanion = (i: number, patch: Partial<Companion>) => setForm({ ...form, companions: form.companions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const vote = (option: string, on: boolean) => setForm({ ...form, date_votes: on ? [...form.date_votes, option] : form.date_votes.filter((x) => x !== option) });

  const fonts = FONTS[theme.fonts];
  const poster: PosterData = {
    guest: page.mine?.first_name || undefined,
    practical: page.practical,
    title: page.title, family: page.family_name, emoji: page.emoji, start, end, place: page.place, address: page.address, theme: page.theme,
    invitation: page.invitation, rsvp: page.rsvp_by ? new Date(`${page.rsvp_by}T12:00:00`) : null, poll, guests: page.guests, locale: dateLocale,
    inviteImage: page.invite_image ? `/api/party/${token}/picture?v=${page.invite_image}` : null,
    asset: (id) => `/api/party/${token}/assets/${id}?v=${page.assets?.find((x) => x.id === id)?.v ?? ""}`,
    ics: `/api/party/${token}/calendar.ics`, thanks: !!page.thanks, playlist: page.playlist_url, steps: [],
  };
  const stage = page.stage;
  const own_blocks = page.layouts?.[stage] ?? (stage === "invite" ? page.layout : null);
  const drawn = own_blocks?.length ? own_blocks : defaultPoster(theme, poster, t, stage);
  // The save-the-date is where the guests register: a poster without the part still has it.
  const blocks: Block[] = stage === "save" && page.mail && !drawn.some((b) => b.type === "subscribe") ? [...drawn, { id: "subscribe", type: "subscribe", heading: t("party.subscribeHeading"), font: "theme-display", size: "l" }] : drawn;
  const replied = !!page.mine && !page.mine.pending;
  const reply = page.mine;
  const slots = { subscribe: page.mail ? <Subscribe token={token} mine={!!page.mine} onDone={(k) => keep("sf.party-keys", token, k)} /> : null, upload: null, gallery: null, checkin: <CheckIn token={token} mine={page.mine} guestKey={key()} onDone={load} />,
    chat: !page.guest_chat ? null : page.mine && key() ? <PartyChat path={`/api/party/${token}/chat`} query={`?key=${encodeURIComponent(key()!)}`} label={t("partyChat.heading")} /> : <p className="text-sm text-muted">{t("partyChat.needsReply")}</p> };

  return (
    <main className="pt" lang={page.language} style={themeStyle(theme)}>
      <PartySky effect={theme.effect} colors={theme.sparks} />
      <div className="relative z-10 h-2" style={{ background: theme.band }} />
      {theme.header && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={theme.header} alt="" className="relative z-10 mx-auto h-40 w-full max-w-5xl object-cover sm:h-60 sm:rounded-b-3xl" />
      )}
      <div className="relative z-10 mx-auto max-w-5xl space-y-6 px-4 pb-6 sm:px-6">
        <Poster blocks={page.guest_chat && stage !== "save" ? withChat(blocks, t("partyChat.heading")) : blocks} d={poster} theme={theme} slots={slots} />
        {stopped && <p className="pt-card p-4 text-sm" role="status">{t("party.stopped")}</p>}

        {page.thanks && (
          <section className="pt-card space-y-3 p-5 sm:p-8" aria-label={t("party.thanks")}>
            <h2 className="pt-script flex items-center gap-2 text-4xl"><Heart className="h-6 w-6 text-accent" aria-hidden />{t("party.thanks")}</h2>
            {page.thanks.text && <p className="whitespace-pre-line text-lg">{page.thanks.text}</p>}
            {page.thanks.photos.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {page.thanks.photos.map((id) => (
                  <a key={id} href={`/api/party/${token}/photos/${id}?variant=view`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/party/${token}/photos/${id}?variant=thumb`} alt="" className="aspect-square w-full rounded-lg object-cover" loading="lazy" />
                  </a>
                ))}
              </div>
            )}
          </section>
        )}

        {page.open && stage === "invite" && replied && !changing && reply && (
          <section className="pt-card space-y-2 p-5 sm:p-8" aria-label={t("party.yourReply")}>
            <h2 className={`pt-display text-3xl ${fonts.caps ? "uppercase" : ""}`}>{t("party.yourReply")}</h2>
            <p className="text-lg font-semibold">{poll ? t("party.replyVoted", { n: reply.date_votes.length }) : reply.coming ? t("party.replyComing", { name: reply.first_name }) : t("party.replyNot", { name: reply.first_name })}</p>
            {reply.coming && reply.companions.length > 0 && <p className="text-sm text-muted">{t("parties.withThem", { names: reply.companions.map((c) => `${c.first_name} ${c.last_name}`.trim()).join(", ") })}</p>}
            {reply.coming && reply.allergies && <p className="text-sm text-muted">{reply.allergies}</p>}
            {together.length > 0 && <p className="text-sm text-muted">{t("party.togetherWith", { names: together.map((x) => x.name).join(", ") })}</p>}
            {saved && <p className="text-sm font-semibold text-accent" role="status">{poll ? t("party.savedVoted") : reply.coming ? t("party.savedComing") : t("party.savedNot")}</p>}
            <button className="pt-ghost" onClick={() => { setSaved(false); setChanging(true); }}>{t("party.update")}</button>
          </section>
        )}

        {page.open && stage === "invite" && (!replied || changing) && (
          <section className="pt-card space-y-3 p-5 sm:p-8" aria-label={t("party.reply")}>
            <h2 className={`pt-display text-3xl ${fonts.caps ? "uppercase" : ""}`}>{page.mine ? t("party.yourReply") : t("party.reply")}</h2>
            {page.rsvp_by && <p className="text-sm text-muted">{t("party.rsvpBy", { date: new Date(`${page.rsvp_by}T12:00:00`).toLocaleDateString(dateLocale, { day: "numeric", month: "long" }) })}</p>}
            {poll ? (
              <fieldset className="space-y-2">
                <legend className="font-semibold">{t("party.whichDates")}</legend>
                <p className="text-xs text-muted">{t("party.whichDatesHelp")}</p>
                {page.date_options.map((o) => {
                  const on = form.date_votes.includes(o);
                  const count = page.tally?.find((r) => r.option === o)?.people;
                  return (
                    <label key={o} className="flex items-center gap-3 rounded-xl border-2 px-3 py-2 text-sm" style={on ? { borderColor: theme.accent } : undefined}>
                      <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={on} onChange={(e) => vote(o, e.target.checked)} />
                      <span className="flex-1 font-semibold first-letter:uppercase">{new Date(o).toLocaleString(dateLocale, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</span>
                      {count != null && count > 0 && <span className="text-xs text-muted">{t("party.canCome", { n: count })}</span>}
                    </label>
                  );
                })}
                <label className="flex items-center gap-2 px-1 text-sm text-muted">
                  <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={!!page.mine && form.date_votes.length === 0} onChange={(e) => e.target.checked && setForm({ ...form, date_votes: [] })} />
                  {t("party.noDateSuits")}
                </label>
              </fieldset>
            ) : (
              <div className="flex gap-2" role="radiogroup" aria-label={t("party.reply")}>
                {[true, false].map((v) => (
                  <button key={String(v)} role="radio" aria-checked={form.coming === v} style={form.coming === v ? { borderColor: theme.accent } : undefined} className={`flex-1 rounded-xl border-2 px-3 py-2 text-sm font-semibold ${form.coming === v ? "bg-accent-soft" : "border-edge"}`} onClick={() => setForm({ ...form, coming: v })}>
                    {v ? t("party.coming") : t("party.notComing")}
                  </button>
                ))}
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <label><span className="label">{t("parties.firstName")}</span><input className="input" autoComplete="given-name" value={form.first_name} maxLength={80} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></label>
              <label><span className="label">{t("parties.lastName")}</span><input className="input" autoComplete="family-name" value={form.last_name} maxLength={80} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></label>
            </div>
            {coming && (
              <label className="block"><span className="label">{t("parties.allergiesLabel")}</span><input className="input" value={form.allergies} maxLength={300} placeholder={t("parties.allergiesPh")} onChange={(e) => setForm({ ...form, allergies: e.target.value })} /></label>
            )}
            {together.length > 0 && (
              <div className="space-y-2 rounded-xl border border-edge p-3 text-sm">
                <p>{t("party.togetherWith", { names: together.map((x) => x.name).join(", ") })}</p>
                {waitingWith.length > 0 && <label className="flex items-center gap-2 font-semibold"><input type="checkbox" className="h-4 w-4 accent-primary-700" checked={!!form.for_group} onChange={(e) => setForm({ ...form, for_group: e.target.checked })} />{t("party.answerFor", { names: waitingWith.map((x) => x.name).join(", ") })}</label>}
              </div>
            )}
            {coming && page.menu.length > 0 && (
              <label className="block"><span className="label">{t("party.menuChoice")}</span>
                <select className="input" value={form.menu_choice ?? ""} onChange={(e) => setForm({ ...form, menu_choice: e.target.value || null })}>
                  <option value="">{t("party.menuNone")}</option>
                  {page.menu.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
            )}
            {coming && page.speech_signup && (
              <div className="space-y-2 rounded-xl border border-edge p-3">
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-4 w-4 accent-primary-700" checked={!!form.wants_speech} onChange={(e) => setForm({ ...form, wants_speech: e.target.checked })} />{t("party.wantsSpeech")}</label>
                {form.wants_speech && <label className="block"><span className="label">{t("party.speechNote")}</span><input className="input" value={form.speech_note ?? ""} maxLength={200} placeholder={t("party.speechNotePh")} onChange={(e) => setForm({ ...form, speech_note: e.target.value })} /></label>}
              </div>
            )}
            {coming && most > 0 && (
              <fieldset className="space-y-2 rounded-xl border border-edge p-3">
                <legend className="px-1 text-sm font-semibold">{most === 1 ? t("party.plusOne") : t("party.company")}</legend>
                {most > 1 && <p className="text-xs text-muted">{t("party.companyHelp")}</p>}
                {form.companions.map((c, i) => (
                  <div key={i} className="space-y-2 rounded-lg bg-base/60 p-2" role="group" aria-label={t("party.companion", { n: i + 1 })}>
                    <div className="flex items-start gap-2">
                      <div className="grid flex-1 gap-2 sm:grid-cols-2">
                        <label><span className="label">{t("parties.firstName")}</span><input className="input" value={c.first_name} maxLength={80} onChange={(e) => setCompanion(i, { first_name: e.target.value })} /></label>
                        <label><span className="label">{t("parties.lastName")}</span><input className="input" value={c.last_name} maxLength={80} onChange={(e) => setCompanion(i, { last_name: e.target.value })} /></label>
                      </div>
                      <button type="button" className="mt-6 text-muted hover:text-red-700" aria-label={t("party.removeCompanion", { name: c.first_name || String(i + 1) })} onClick={() => setForm({ ...form, companions: form.companions.filter((_, j) => j !== i) })}><X className="h-4 w-4" aria-hidden /></button>
                    </div>
                    <label className="block"><span className="label">{t("parties.allergiesLabel")}</span><input className="input" value={c.allergies} maxLength={300} placeholder={t("parties.allergiesPh")} onChange={(e) => setCompanion(i, { allergies: e.target.value })} /></label>
                    {page.menu.length > 0 && (
                      <label className="block"><span className="label">{t("party.menuChoice")}</span>
                        <select className="input" value={c.menu_choice ?? ""} onChange={(e) => setCompanion(i, { menu_choice: e.target.value || null })}>
                          <option value="">{t("party.menuNone")}</option>
                          {page.menu.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </label>
                    )}
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary-700" checked={c.child} onChange={(e) => setCompanion(i, { child: e.target.checked })} />{t("party.isChild")}</label>
                  </div>
                ))}
                {form.companions.length < most && (
                  <button type="button" className="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 text-sm font-semibold hover:bg-surface" onClick={() => setForm({ ...form, companions: [...form.companions, { ...NOBODY, last_name: form.last_name }] })}>
                    <Plus className="h-4 w-4" aria-hidden />
                    {most === 1 ? t("party.bringPlusOne") : t("party.addCompanion")}
                  </button>
                )}
              </fieldset>
            )}
            <label className="block"><span className="label">{t("party.message")}</span><input className="input" value={form.message} maxLength={500} onChange={(e) => setForm({ ...form, message: e.target.value })} /></label>
            {page.mail && (
              <div className="space-y-2 rounded-xl border border-edge p-3">
                <label className="block"><span className="label">{t("party.email")}</span><input className="input" type="email" autoComplete="email" value={form.email ?? ""} maxLength={254} placeholder={t("party.emailPh")} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary-700" disabled={!form.email?.trim()} checked={!!form.email?.trim() && form.updates} onChange={(e) => setForm({ ...form, updates: e.target.checked })} />
                  <span>{t("party.updates")}<span className="block text-xs text-muted">{t("party.updatesHelp")}</span></span>
                </label>
              </div>
            )}
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button className="pt-btn w-full" disabled={!form.first_name.trim() || form.companions.some((c) => !c.first_name.trim())} onClick={send}>{page.mine ? t("party.update") : poll ? t("party.vote") : t("party.send")}</button>
          </section>
        )}

        {stage !== "save" && page.wishes && page.wishes.length > 0 && (
          <section className="pt-card space-y-2 p-5 sm:p-8" aria-label={t("party.wishes")}>
            <h2 className={`pt-display flex items-center gap-2 text-3xl ${fonts.caps ? "uppercase" : ""}`}><Gift className="h-5 w-5 text-accent" aria-hidden />{t("party.wishes")}</h2>
            <p className="text-xs text-muted">{t("party.wishesHelp")}</p>
            <ul className="divide-y divide-edge text-sm">
              {page.wishes.map((w) => {
                const yours = w.reserved && !!mineWish[`${token}:${w.id}`];
                return (
                  <li key={w.id} className="flex items-center gap-2 py-2">
                    <span className="min-w-0 flex-1">
                      <span className={w.reserved && !yours ? "text-muted line-through" : "font-semibold"}>{w.title}</span>
                      {w.note && <span className="block text-xs text-muted">{w.note}</span>}
                    </span>
                    {w.url && <a href={w.url} target="_blank" rel="noreferrer" className="text-muted hover:text-accent" aria-label={t("party.wishLink", { title: w.title })}><ExternalLink className="h-4 w-4" aria-hidden /></a>}
                    {yours ? (
                      <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => reserve(w.id, false)}>{t("party.unreserve")}</button>
                    ) : w.reserved ? (
                      <span className="text-xs text-muted">{t("party.taken")}</span>
                    ) : (
                      <button className="btn-ghost border border-edge px-2 py-0.5 text-xs" onClick={() => reserve(w.id, true)}>{t("party.reserve")}</button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <footer className="py-10 text-center text-sm uppercase tracking-[.2em] text-muted">
          {t("party.welcomeAll")} <span className="text-accent">♥</span> {page.family_name}
        </footer>
      </div>
    </main>
  );
}
