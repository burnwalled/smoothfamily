"use client";

// A party's invitation page (3.4.0), for the guests – no account: what, when and where, the
// reply (first and last name, allergies, and whoever they bring as far as the hosts allow – a +1
// or the whole family), a vote on the date if it's still open, "add to my calendar",
// the wish list if the hosts chose it, and afterwards the thank-you with the day's photos. The
// keys to change your reply and your reservations stay in this browser.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CalendarPlus, ExternalLink, Gift, Heart, MapPin, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { isLocale, useI18n } from "@/lib/i18n";
import { CustomTheme, customTheme, partyTheme, themeStyle } from "@/lib/partyThemes";
import { MapLinks } from "@/components/AddressInput";

type Companion = { first_name: string; last_name: string; child: boolean; allergies: string };
type Reply = { first_name: string; last_name: string; coming: boolean; allergies: string; message: string; companions: Companion[]; email: string | null; updates: boolean; date_votes: string[] };
type Page = {
  language: string;
  page_theme: string;
  thanks_theme: string;
  // The family's own themes, when "custom", and a picture on the invitation (its version).
  page_custom: CustomTheme | null;
  thanks_custom: CustomTheme | null;
  invite_image: string | null;
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
};

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

export default function PartyInvitation() {
  const { token } = useParams<{ token: string }>();
  const { t, dateLocale, setLocale } = useI18n();
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

  const key = () => stored("sf.party-keys")[token];
  const load = useCallback(() => {
    const replyKey = stored("sf.party-keys")[token];
    const wishKey = stored("sf.party-wish-keys")[token];
    const q = new URLSearchParams();
    if (replyKey) q.set("key", replyKey);
    if (wishKey) q.set("wish_key", wishKey);
    api.get<Page>(`/api/party/${token}${q.toString() ? `?${q}` : ""}`)
      .then((p) => {
        setPage(p);
        // The family's language, unless this browser has chosen one.
        try {
          if (!localStorage.getItem("sf.locale") && isLocale(p.language)) setLocale(p.language);
        } catch {}
        if (p.mine) {
          setForm({ ...EMPTY, ...p.mine, email: p.mine.email ?? "" });
        }
      })
      .catch(() => setInvalid(true));
  }, [token, setLocale]);
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
  const when = `${start.toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "long" })} ${start.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })}–${end.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })}`;
  const mineWish = stored("sf.party-wish-keys");
  // The thank-you's look once it's out, else the invitation's.
  const themeKey = page.thanks ? page.thanks_theme : page.page_theme;
  const own = page.thanks ? page.thanks_custom : page.page_custom;
  const theme = themeKey === "custom" && own ? customTheme(own, (slot, v) => `/api/party/${token}/themes/${own.id}/${slot}?v=${v}`) : partyTheme(themeKey);
  const button = { backgroundColor: theme.accent, borderColor: theme.accent };
  const poll = page.date_poll;
  const coming = poll || form.coming;
  const most = page.bring === "one" ? 1 : page.bring === "family" ? 20 : 0;
  const setCompanion = (i: number, patch: Partial<Companion>) => setForm({ ...form, companions: form.companions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const vote = (option: string, on: boolean) => setForm({ ...form, date_votes: on ? [...form.date_votes, option] : form.date_votes.filter((x) => x !== option) });

  return (
    <main className="min-h-screen" style={themeStyle(theme)}>
      <div className="h-2" style={{ background: theme.band }} />
      {theme.header && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={theme.header} alt="" className="mx-auto h-40 w-full max-w-3xl object-cover sm:h-56 sm:rounded-b-3xl" />
      )}
      <div className="mx-auto max-w-xl space-y-5 p-5">
        <header className="pt-4 text-center" style={{ color: theme.ink }}>
          <p className="text-6xl drop-shadow-sm" aria-hidden>{page.emoji}</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight drop-shadow-sm">{page.title}</h1>
          <p className="mt-1 text-sm opacity-80">{t("party.from", { family: page.family_name })}</p>
          <p className="mt-3 flex justify-center gap-3 text-3xl" aria-hidden>{theme.decor.map((d, i) => <span key={i} className="inline-block" style={{ transform: `rotate(${(i - (theme.decor.length - 1) / 2) * 9}deg) translateY(${i % 2 ? 4 : -4}px)` }}>{d}</span>)}</p>
        </header>
        {stopped && <p className="card p-4 text-sm" role="status">{t("party.stopped")}</p>}

        {page.thanks && (
          <section className="card space-y-3 p-5" aria-label={t("party.thanks")}>
            <h2 className="flex items-center gap-2 text-lg font-bold"><Heart className="h-5 w-5 text-accent" aria-hidden />{t("party.thanks")}</h2>
            {page.thanks.text && <p className="whitespace-pre-line">{page.thanks.text}</p>}
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

        <section className="card space-y-2 p-5" aria-label={t("party.about")}>
          {page.invite_image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/party/${token}/picture?v=${page.invite_image}`} alt="" className="-mx-5 -mt-5 mb-3 max-h-80 w-[calc(100%+2.5rem)] max-w-none rounded-t-xl object-cover" />
          )}
          <p className="font-semibold first-letter:uppercase">{poll ? t("party.datePending") : when}</p>
          {(page.place || page.address) && (
            <>
              <p className="flex items-start gap-1.5 text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />{[page.place, page.address].filter(Boolean).join(", ")}</p>
              <MapLinks address={page.address || page.place} className="pl-6" />
            </>
          )}
          {page.theme && <p className="text-sm text-muted">{t("party.theme", { theme: page.theme })}</p>}
          {page.invitation && <p className="whitespace-pre-line pt-2">{page.invitation}</p>}
          {!poll && (
            <a className="inline-flex items-center gap-1.5 pt-2 text-sm font-semibold text-accent hover:underline" href={`/api/party/${token}/calendar.ics`}>
              <CalendarPlus className="h-4 w-4" aria-hidden />
              {t("party.addToCalendar")}
            </a>
          )}
          {page.guests && (
            <p className="pt-1 text-sm text-muted">
              {t("party.comingN", { n: page.guests.coming })}
              {page.guests.names && page.guests.names.length > 0 && `: ${page.guests.names.join(", ")}`}
            </p>
          )}
        </section>

        {page.open && (
          <section className="card space-y-3 p-5" aria-label={t("party.reply")}>
            <h2 className="text-lg font-bold">{page.mine ? t("party.yourReply") : t("party.reply")}</h2>
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
            {saved && <p className="text-sm font-semibold text-accent" role="status">{poll ? t("party.savedVoted") : form.coming ? t("party.savedComing") : t("party.savedNot")}</p>}
            <button className="btn-primary w-full" style={button} disabled={!form.first_name.trim() || form.companions.some((c) => !c.first_name.trim())} onClick={send}>{page.mine ? t("party.update") : poll ? t("party.vote") : t("party.send")}</button>
          </section>
        )}

        {page.wishes && page.wishes.length > 0 && (
          <section className="card space-y-2 p-5" aria-label={t("party.wishes")}>
            <h2 className="flex items-center gap-2 text-lg font-bold"><Gift className="h-5 w-5 text-accent" aria-hidden />{t("party.wishes")}</h2>
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
      </div>
    </main>
  );
}
