"use client";

// A party's invitation page (3.4.0), for the guests – no account: what, when and where, the
// reply (first and last name, allergies, and a +1 if the hosts allow it), "add to my calendar",
// the wish list if the hosts chose it, and afterwards the thank-you with the day's photos. The
// keys to change your reply and your reservations stay in this browser.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CalendarPlus, ExternalLink, Gift, Heart, MapPin } from "lucide-react";
import { api } from "@/lib/api";
import { isLocale, useI18n } from "@/lib/i18n";

type Reply = { first_name: string; last_name: string; coming: boolean; allergies: string; message: string; plus_first_name: string | null; plus_last_name: string | null; plus_allergies: string };
type Page = {
  language: string;
  title: string; kind: string; emoji: string; color: string; family_name: string; starts_at: string; ends_at: string; place: string; address: string; theme: string;
  invitation: string; rsvp_by: string | null; plus_one: boolean; open: boolean;
  guests: { coming: number; names?: string[] } | null;
  wishes: { id: string; title: string; url: string | null; note: string | null; reserved: boolean; reserved_by_you: boolean }[] | null;
  thanks: { text: string; photos: string[] } | null;
  mine: Reply | null;
};

const EMPTY: Reply = { first_name: "", last_name: "", coming: true, allergies: "", message: "", plus_first_name: "", plus_last_name: "", plus_allergies: "" };

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
  const [plus, setPlus] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

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
          setForm({ ...EMPTY, ...p.mine, plus_first_name: p.mine.plus_first_name ?? "", plus_last_name: p.mine.plus_last_name ?? "" });
          setPlus(!!p.mine.plus_first_name);
        }
      })
      .catch(() => setInvalid(true));
  }, [token, setLocale]);
  useEffect(load, [load]);

  async function send() {
    setError("");
    setSaved(false);
    try {
      const body = { ...form, plus_first_name: plus ? form.plus_first_name : null, plus_last_name: plus ? form.plus_last_name : null, plus_allergies: plus ? form.plus_allergies : "" };
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

  return (
    <main className="min-h-screen bg-base">
      <div className="h-2" style={{ background: page.color }} />
      <div className="mx-auto max-w-xl space-y-5 p-5">
        <header className="pt-4 text-center">
          <p className="text-5xl" aria-hidden>{page.emoji}</p>
          <h1 className="mt-2 text-3xl font-extrabold">{page.title}</h1>
          <p className="mt-1 text-sm text-muted">{t("party.from", { family: page.family_name })}</p>
        </header>

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
          <p className="font-semibold first-letter:uppercase">{when}</p>
          {(page.place || page.address) && (
            <p className="flex items-start gap-1.5 text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />{[page.place, page.address].filter(Boolean).join(", ")}</p>
          )}
          {page.theme && <p className="text-sm text-muted">{t("party.theme", { theme: page.theme })}</p>}
          {page.invitation && <p className="whitespace-pre-line pt-2">{page.invitation}</p>}
          <a className="inline-flex items-center gap-1.5 pt-2 text-sm font-semibold text-accent hover:underline" href={`/api/party/${token}/calendar.ics`}>
            <CalendarPlus className="h-4 w-4" aria-hidden />
            {t("party.addToCalendar")}
          </a>
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
            <div className="flex gap-2" role="radiogroup" aria-label={t("party.reply")}>
              {[true, false].map((v) => (
                <button key={String(v)} role="radio" aria-checked={form.coming === v} className={`flex-1 rounded-xl border-2 px-3 py-2 text-sm font-semibold ${form.coming === v ? "border-accent bg-accent-soft" : "border-edge"}`} onClick={() => setForm({ ...form, coming: v })}>
                  {v ? t("party.coming") : t("party.notComing")}
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label><span className="label">{t("parties.firstName")}</span><input className="input" autoComplete="given-name" value={form.first_name} maxLength={80} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></label>
              <label><span className="label">{t("parties.lastName")}</span><input className="input" autoComplete="family-name" value={form.last_name} maxLength={80} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></label>
            </div>
            {form.coming && (
              <label className="block"><span className="label">{t("parties.allergiesLabel")}</span><input className="input" value={form.allergies} maxLength={300} placeholder={t("parties.allergiesPh")} onChange={(e) => setForm({ ...form, allergies: e.target.value })} /></label>
            )}
            {form.coming && page.plus_one && (
              <div className="space-y-2 rounded-xl border border-edge p-3">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary-700" checked={plus} onChange={(e) => setPlus(e.target.checked)} />{t("party.bringPlusOne")}</label>
                {plus && (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label><span className="label">{t("party.plusFirst")}</span><input className="input" value={form.plus_first_name ?? ""} maxLength={80} onChange={(e) => setForm({ ...form, plus_first_name: e.target.value })} /></label>
                      <label><span className="label">{t("party.plusLast")}</span><input className="input" value={form.plus_last_name ?? ""} maxLength={80} onChange={(e) => setForm({ ...form, plus_last_name: e.target.value })} /></label>
                    </div>
                    <label className="block"><span className="label">{t("party.plusAllergies")}</span><input className="input" value={form.plus_allergies} maxLength={300} placeholder={t("parties.allergiesPh")} onChange={(e) => setForm({ ...form, plus_allergies: e.target.value })} /></label>
                  </>
                )}
              </div>
            )}
            <label className="block"><span className="label">{t("party.message")}</span><input className="input" value={form.message} maxLength={500} onChange={(e) => setForm({ ...form, message: e.target.value })} /></label>
            {error && <p className="text-sm text-red-700">{error}</p>}
            {saved && <p className="text-sm font-semibold text-accent" role="status">{form.coming ? t("party.savedComing") : t("party.savedNot")}</p>}
            <button className="btn-primary w-full" disabled={!form.first_name.trim() || (plus && !form.plus_first_name?.trim())} onClick={send}>{page.mine ? t("party.update") : t("party.send")}</button>
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
