"use client";

// A party's further tools (3.4.0): what the guests choose and read, helpers from outside and their plan
// of the evening, the check-in, the wording of the mails, and suppliers.
import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Link2, Mail, MessageCircle, MessageSquare, Plus, Printer, Search, Share2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { newId } from "@/lib/poster";
import PartyChat from "@/components/parties/PartyChat";
import { type Change, type Detail, SaveButton, type TabProps, WhenField, localInput } from "@/components/parties/PartiesApp";

// What the guests choose and read: the menu, signing up for a speech, practical information.
export function GuestOptions({ party, change }: { party: Detail; change: Change }) {
  const { t } = useI18n();
  const [dish, setDish] = useState("");
  const [info, setInfo] = useState({ parking: party.practical.parking ?? "", lodging: party.practical.lodging ?? "", travel: party.practical.travel ?? "" });
  return (
    <section className="card space-y-4 p-5" aria-label={t("parties.forGuests")}>
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("parties.forGuests")}</h2>
      <div className="space-y-2">
        <span className="label">{t("parties.menu")}</span>
        <p className="text-xs text-muted">{t("parties.menuHelp")}</p>
        {party.menu.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {party.menu.map((m) => (
              <li key={m.id} className="flex items-center gap-1 rounded-full border border-edge px-3 py-1 text-sm">
                {m.name}
                <button type="button" className="text-muted hover:text-red-700" aria-label={t("parties.menuRemove", { name: m.name })} onClick={() => change({ menu: party.menu.filter((x) => x.id !== m.id) })}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
              </li>
            ))}
          </ul>
        )}
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (dish.trim()) void change({ menu: [...party.menu, { id: newId(), name: dish.trim() }] }).then(() => setDish("")); }}>
          <input className="input min-w-40 flex-1" value={dish} maxLength={60} placeholder={t("parties.menuHint")} aria-label={t("parties.menuAdd")} onChange={(e) => setDish(e.target.value)} />
          <button className="btn-ghost flex items-center gap-1 border border-edge" type="submit" disabled={!dish.trim() || party.menu.length >= 12}><Plus className="h-4 w-4" aria-hidden />{t("parties.menuAdd")}</button>
        </form>
      </div>
      <div className="space-y-2">
        <span className="label">{t("partyChat.chats")}</span>
        {(["guest_chat", "planner_chat"] as const).map((k) => (
          <label key={k} className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary-700" checked={party[k]} onChange={(e) => { if (e.target.checked || window.confirm(t("partyChat.offConfirm"))) void change({ [k]: e.target.checked }); }} />
            <span>{t(`partyChat.${k}`)}<span className="block text-xs text-muted">{t(`partyChat.${k}Help`)}</span></span>
          </label>
        ))}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary-700" checked={party.speech_signup} onChange={(e) => change({ speech_signup: e.target.checked })} />
        <span>{t("parties.speechSignup")}<span className="block text-xs text-muted">{t("parties.speechSignupHelp")}</span></span>
      </label>
      <div className="space-y-2">
        <span className="label">{t("parties.practical")}</span>
        <p className="text-xs text-muted">{t("parties.practicalHelp")}</p>
        {(["parking", "lodging", "travel"] as const).map((k) => (
          <label key={k} className="block"><span className="label">{t(`party.practical.${k}`)}</span><textarea className="input min-h-14" value={info[k]} maxLength={1000} onChange={(e) => setInfo({ ...info, [k]: e.target.value })} /></label>
        ))}
        <div className="flex flex-wrap items-center gap-3"><SaveButton onSave={() => change({ practical: info }, { quiet: true })} /></div>
      </div>
    </section>
  );
}

// Inviting a toastmaster or another helper from outside.
export function Helpers({ party, run, path }: TabProps) {
  const { t, dateLocale } = useI18n();
  const blank = { name: "", role: "toastmaster", email: "", days_after: 3 };
  const [form, setForm] = useState(blank);
  const [shown, setShown] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const invite = async () => {
    setError("");
    setNote("");
    try {
      const out = await api.post<{ mailed: boolean; party: Detail }>(`${path}/helpers`, { ...form, name: form.name.trim(), email: form.email.trim() || null });
      await run(async () => out.party);
      setForm(blank);
      setNote(t(out.mailed ? "helper.mailed" : "helper.copyIt"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  };
  const copy = async (id: string) => {
    const { link } = await api.post<{ link: string }>(`${path}/helpers/${id}/link`);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(id);
    } catch {
      setShown({ ...shown, [id]: link });
    }
  };
  return (
    <section className="card space-y-3 p-5" aria-label={t("helper.title")}>
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("helper.title")}</h2>
      <p className="text-xs text-muted">{t("helper.help")}</p>
      {party.helpers.length > 0 && (
        <ul className="divide-y divide-edge text-sm [overflow-wrap:anywhere]">
          {party.helpers.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{h.name}</span> · {t(`helper.role.${h.role}` as TranslationKey)}
                <span className="block text-xs text-muted">{t("helper.until", { date: new Date(h.ends_at).toLocaleDateString(dateLocale, { day: "numeric", month: "long" }) })}{h.email && ` · ${h.email}`}</span>
              </span>
              <button className="btn-ghost flex items-center gap-1 border border-edge text-xs" aria-label={t("helper.copyOf", { name: h.name })} onClick={() => { copy(h.id).catch((e) => setError(e.message)); }}>
                {copied === h.id ? <Check className="h-4 w-4 text-accent" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}{copied === h.id ? t("parties.linkCopied") : t("helper.copy")}
              </button>
              {party.you.helper_id !== h.id && <button className="text-muted hover:text-red-700" aria-label={t("helper.remove", { name: h.name })} onClick={() => window.confirm(t("helper.removeConfirm", { name: h.name })) && run(() => api.del(`${path}/helpers/${h.id}`).then(() => api.get<Detail>(path)))}><Trash2 className="h-4 w-4" aria-hidden /></button>}
              {shown[h.id] && <input className="input w-full text-xs" readOnly autoFocus value={shown[h.id]} aria-label={t("helper.copyOf", { name: h.name })} onFocus={(e) => e.target.select()} />}
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <label><span className="label">{t("parties.name")}</span><input className="input" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label><span className="label">{t("helper.roleLabel")}</span>
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {["toastmaster", "toastmadame", "helper"].map((r) => <option key={r} value={r}>{t(`helper.role.${r}` as TranslationKey)}</option>)}
          </select>
        </label>
        <label><span className="label">{t("party.email")}</span><input className="input" type="email" value={form.email} maxLength={254} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label><span className="label">{t("helper.ends")}</span>
          <select className="input" value={form.days_after} onChange={(e) => setForm({ ...form, days_after: Number(e.target.value) })}>
            {[1, 3, 7].map((n) => <option key={n} value={n}>{t(`helper.days.${n}` as TranslationKey)}</option>)}
          </select>
        </label>
      </div>
      <button className="btn-primary" disabled={!form.name.trim() || (!!form.email.trim() && !form.email.includes("@"))} onClick={() => { void invite(); }}>{t("helper.invite")}</button>
      {note && <p className="text-sm text-accent" role="status">{note}</p>}
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    </section>
  );
}

// The helpers' plan of the evening: speeches, the serving, games. They choose whom it's kept from.
export function PlanTab({ party, run, path }: TabProps) {
  const { t } = useI18n();
  const blank = { kind: "speech", at: "", minutes: "", title: "", who: "", note: "" };
  const [form, setForm] = useState(blank);
  const add = (extra: Partial<typeof blank> = {}) => {
    const v = { ...form, ...extra };
    return run(() => api.post<Detail>(`${path}/plan`, { kind: v.kind, at: v.at, minutes: v.minutes ? Number(v.minutes) : null, title: v.title.trim(), who: v.who.trim(), note: v.note.trim() })).then(() => setForm(blank));
  };
  const hiddenFrom = (id: string, on: boolean) => run(() => api.put<Detail>(`${path}/plan/hidden`, { user_ids: on ? [...party.plan_hidden, id] : party.plan_hidden.filter((x) => x !== id) }));
  const planned = new Set(party.plan.filter((i) => i.kind === "speech").map((i) => i.who));
  return (
    <div className="space-y-4">
      {party.you.helper ? (
        <section className="card space-y-2 p-5" aria-label={t("plan.hiddenTitle")}>
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("plan.hiddenTitle")}</h2>
          <p className="text-xs text-muted">{t("plan.hiddenHelp")}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {party.adults.filter((a) => party.planners.includes(a.id)).map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary-700" checked={party.plan_hidden.includes(a.id)} onChange={(e) => hiddenFrom(a.id, e.target.checked)} />{a.name}</label>
            ))}
          </div>
        </section>
      ) : <p className="rounded-lg bg-accent-soft p-3 text-sm">{t("plan.hostNote")}</p>}
      {party.speeches.length > 0 && (
        <section className="card space-y-2 p-5" aria-label={t("plan.speeches")}>
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("plan.speeches")}</h2>
          <ul className="divide-y divide-edge text-sm [overflow-wrap:anywhere]">
            {party.speeches.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1"><span className="font-semibold">{s.name}</span>{s.note && <span className="text-muted"> · {s.note}</span>}</span>
                {planned.has(s.name) ? <span className="flex items-center gap-1 text-xs text-accent"><Check className="h-3.5 w-3.5" aria-hidden />{t("plan.inPlan")}</span> : <button className="btn-ghost border border-edge text-xs" aria-label={t("plan.addSpeechOf", { name: s.name })} onClick={() => add({ kind: "speech", title: t("plan.speechBy", { name: s.name }), who: s.name, note: s.note })}>{t("plan.addSpeech")}</button>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {party.planner_chat && (
        <section className="card space-y-2 p-5" aria-label={t("partyChat.planners")}>
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("partyChat.planners")}</h2>
          <PartyChat path={`${path}/chat/planners`} remove label={t("partyChat.planners")} buttonClass="btn-primary" />
        </section>
      )}
      <section className="card space-y-3 p-5" aria-label={t("parties.tab.plan")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("parties.tab.plan")}</h2>
          <a className="btn-ghost flex items-center gap-1 border border-edge text-xs" href={`/party-print/${party.id}/run`} target="_blank" rel="noreferrer"><Printer className="h-4 w-4" aria-hidden />{t("print.run")}</a>
        </div>
        <p className="text-xs text-muted">{t("plan.help")}</p>
        {party.plan.length > 0 && (
          <ol className="divide-y divide-edge text-sm [overflow-wrap:anywhere]">
            {party.plan.map((i) => (
              <li key={i.id} className="flex items-start gap-3 py-2">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary-700" aria-label={i.title} checked={i.done} onChange={(e) => run(() => api.put<Detail>(`${path}/plan/${i.id}`, { done: e.target.checked }))} />
                <span className="w-12 shrink-0 font-semibold tabular-nums">{i.at}</span>
                <span className={`min-w-0 flex-1 ${i.done ? "text-muted line-through" : ""}`}>
                  <span className="font-semibold">{i.title}</span>
                  <span className="ml-1 text-xs text-muted">{t(`plan.kind.${i.kind}` as TranslationKey)}{i.minutes ? ` · ${t("print.minutes", { n: i.minutes })}` : ""}{i.who ? ` · ${i.who}` : ""}</span>
                  {i.note && <span className="block whitespace-pre-line text-xs text-muted">{i.note}</span>}
                </span>
                <button className="text-muted hover:text-red-700" aria-label={t("common.remove")} onClick={() => run(() => api.del(`${path}/plan/${i.id}`).then(() => api.get<Detail>(path)))}><Trash2 className="h-4 w-4" aria-hidden /></button>
              </li>
            ))}
          </ol>
        )}
        <form className="grid gap-2 sm:grid-cols-[8rem_6rem_5rem_1fr]" onSubmit={(e) => { e.preventDefault(); if (form.title.trim()) void add(); }}>
          <label><span className="label">{t("plan.kindLabel")}</span>
            <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {["speech", "serving", "game", "music", "note"].map((k) => <option key={k} value={k}>{t(`plan.kind.${k}` as TranslationKey)}</option>)}
            </select>
          </label>
          <label><span className="label">{t("plan.at")}</span><input className="input" type="time" value={form.at} onChange={(e) => setForm({ ...form, at: e.target.value })} /></label>
          <label><span className="label">{t("plan.minutes")}</span><input className="input" type="number" min={0} max={600} value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} /></label>
          <label><span className="label">{t("plan.title")}</span><input className="input" value={form.title} maxLength={160} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label className="sm:col-span-2"><span className="label">{t("plan.who")}</span><input className="input" value={form.who} maxLength={120} onChange={(e) => setForm({ ...form, who: e.target.value })} /></label>
          <label className="sm:col-span-2"><span className="label">{t("plan.note")}</span><input className="input" value={form.note} maxLength={2000} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <button className="btn-primary flex w-fit items-center gap-1" type="submit" disabled={!form.title.trim()}><Plus className="h-4 w-4" aria-hidden />{t("parties.add")}</button>
        </form>
      </section>
    </div>
  );
}

// The check-in: when the guests' link becomes it, and who's answered.
export function CheckinCard({ party, change }: { party: Detail; change: Change }) {
  const { t } = useI18n();
  const yes = party.guests.filter((g) => g.checkin === "yes");
  const no = party.guests.filter((g) => g.checkin === "no");
  const name = (g: Detail["guests"][number]) => `${g.first_name} ${g.last_name}`.trim();
  return (
    <section className="card space-y-3 p-5 lg:col-span-2" aria-label={t("parties.stage.checkin")}>
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("parties.stage.checkin")}</h2>
      <p className="text-xs text-muted">{t("checkin.help")}</p>
      <WhenField label={t("checkin.at")} help={t("checkin.atHelp")} value={party.checkin_at} suggest={new Date(new Date(party.starts_at).getTime() - 3 * 86_400_000).toISOString()} onSave={(at) => change({ checkin_at: at }, { quiet: !!at })} />
      <p className="text-sm font-semibold">{t("checkin.counts", { yes: yes.length, no: no.length, waiting: party.guests.filter((g) => g.coming && !g.checkin).length })}</p>
      {no.length > 0 && <ul className="divide-y divide-edge text-sm">{no.map((g) => <li key={g.id} className="py-1.5"><span aria-hidden>👎 </span><span className="font-semibold">{name(g)}</span>{g.message && <span className="text-muted"> · {g.message}</span>}</li>)}</ul>}
    </section>
  );
}

// The mails in their order: their wording, a look at them, and when they go.
const SCHEDULED: Record<string, { kind: string; audience: string }> = {
  invited: { kind: "invite", audience: "all" }, checkin: { kind: "checkin", audience: "coming" },
  remind_rsvp: { kind: "remind", audience: "waiting" }, reminder: { kind: "remind", audience: "coming" }, thanks: { kind: "thanks", audience: "coming" },
};
const fillIn = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (all, k: string) => (k in values ? values[k] : all));

// A mail as the guest would get it: the server's own HTML, in a frame that can't run anything.
function MailPreview({ path, subject, text }: { path: string; subject: string; text: string }) {
  const { t } = useI18n();
  const [out, setOut] = useState<{ subject: string; html: string } | null>(null);
  useEffect(() => {
    const wait = setTimeout(() => {
      api.post<{ subject: string; html: string }>(`${path}/mail-preview`, { subject, text, name: t("poster.sampleGuest") }).then(setOut).catch(() => setOut(null));
    }, 350);
    return () => clearTimeout(wait);
  }, [path, subject, text, t]);
  if (!out) return null;
  return (
    <div className="space-y-1">
      <span className="label">{t("mailText.preview")}</span>
      <p className="text-sm font-semibold">{out.subject}</p>
      <iframe title={t("mailText.preview")} sandbox="" srcDoc={out.html} className="h-96 w-full rounded-lg border border-edge bg-white" />
    </div>
  );
}

// The message to send oneself by text or in any app: with the link, ready to share, and the hosts' own
// to change. It's how a save-the-date goes out – nobody's address is known yet.
export function ShareMessage({ party, change }: { party: Detail; change: Change }) {
  const { t, dateLocale } = useI18n();
  const save = party.phase === "save" && party.pages.includes("save");
  const key = save ? "save" : "invite";
  const standard = t(save ? "parties.shareSaveText" : party.date_poll ? "parties.shareVoteText" : "parties.shareText");
  const own = party.share_texts[key];
  const [draft, setDraft] = useState(own || standard);
  useEffect(() => setDraft(own || standard), [own, standard]);
  const [copied, setCopied] = useState<"text" | "link" | null>(null);
  const when = [new Date(party.starts_at).toLocaleString(dateLocale, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }), party.place].filter(Boolean).join(" · ");
  const message = fillIn(draft, { title: party.title, when, link: party.link, emoji: party.emoji });
  const copy = async (text: string, what: "text" | "link") => {
    await navigator.clipboard?.writeText(text);
    setCopied(what);
  };
  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: party.title, text: message });
        return;
      }
    } catch {
      return;
    }
    await copy(message, "text");
  };
  const body = encodeURIComponent(message);
  return (
    <div className="min-w-0 space-y-2 rounded-xl border border-edge p-3">
      <p className="text-sm font-semibold">{t(save ? "parties.stage.save" : "parties.stage.invite")}</p>
      {save && <p className="text-xs text-muted">{t("parties.shareSaveHelp")}</p>}
      <label className="block"><span className="label">{t("parties.shareMessage")}</span><textarea className="input min-h-28" value={draft} maxLength={1000} onChange={(e) => setDraft(e.target.value)} /></label>
      <div className="flex flex-wrap gap-1" aria-label={t("poster.tokens")}>
        {["title", "when", "emoji", "link"].map((k) => <button key={k} type="button" className="rounded border border-edge px-1.5 text-[11px] text-muted hover:text-ink" onClick={() => setDraft(`${draft}{${k}}`)}>{`{${k}}`}</button>)}
      </div>
      <div className="rounded-lg bg-base p-3 text-sm" aria-label={t("mailText.preview")}><p className="whitespace-pre-line [overflow-wrap:anywhere]">{message}</p></div>
      {!draft.includes("{link}") && <p className="text-xs text-red-700" role="alert">{t("parties.shareNoLink")}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary flex items-center gap-1.5" onClick={() => { void share(); }}><Share2 className="h-4 w-4" aria-hidden />{t("parties.shareButton")}</button>
        <button type="button" className="btn-ghost flex items-center gap-1.5 border border-edge" onClick={() => { void copy(message, "text"); }}><Copy className="h-4 w-4" aria-hidden />{t("parties.copyMessage")}</button>
        <a className="btn-ghost flex items-center gap-1.5 border border-edge" href={`sms:?&body=${body}`}><MessageSquare className="h-4 w-4" aria-hidden />{t("parties.shareSms")}</a>
        <a className="btn-ghost flex items-center gap-1.5 border border-edge" href={`https://wa.me/?text=${body}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" aria-hidden />WhatsApp</a>
        <a className="btn-ghost flex items-center gap-1.5 border border-edge" href={`mailto:?subject=${encodeURIComponent(party.title)}&body=${body}`}><Mail className="h-4 w-4" aria-hidden />{t("parties.shareMail")}</a>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SaveButton disabled={draft === (own || standard) || !draft.includes("{link}")} onSave={() => change({ mail_texts: { [`share_${key}`]: { subject: "", text: draft === standard ? "" : draft } } }, { quiet: true })} />
        {own && <button type="button" className="text-xs text-muted hover:underline" onClick={() => change({ mail_texts: { [`share_${key}`]: { subject: "", text: "" } } }, { quiet: true })}>{t("mailText.reset")}</button>}
      </div>
      <input className="input text-xs" readOnly value={party.link} aria-label={t("parties.link")} onFocus={(e) => e.target.select()} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost flex items-center gap-1.5" onClick={() => { void copy(party.link, "link"); }}><Link2 className="h-4 w-4" aria-hidden />{t("parties.copy")}</button>
        <a className="btn-ghost text-sm" href={party.link} target="_blank" rel="noreferrer">{t("parties.preview")}</a>
      </div>
      {copied && <p className="text-xs text-accent" role="status">{t("parties.copied")}</p>}
    </div>
  );
}

export function MailTemplates({ party, run, change, path }: TabProps & { change: Change }) {
  const { t, dateLocale } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState({ subject: "", text: "" });
  const [when, setWhen] = useState(localInput(new Date(Date.now() + 3_600_000).toISOString()));
  const list = party.mail_templates.filter((m) => {
    if (m.kind === "save") return false;
    if (m.kind === "subscribed") return party.pages.includes("save");
    if (m.kind === "checkin") return party.pages.includes("checkin");
    if (m.kind === "thanks") return party.pages.includes("thanks");
    if (m.kind === "decided") return party.date_poll;
    return true;
  });
  const start = (kind: string) => {
    const m = party.mail_templates.find((x) => x.kind === kind)!;
    setDraft({ subject: m.subject || m.default_subject, text: m.text || m.default_text });
    setOpen(kind);
  };
  const save = (kind: string) => {
    const m = party.mail_templates.find((x) => x.kind === kind)!;
    const own = { subject: draft.subject === m.default_subject ? "" : draft.subject, text: draft.text === m.default_text ? "" : draft.text };
    return change({ mail_texts: { [kind]: own } }, { quiet: true });
  };
  const plan = (kind: string, at: Date) => {
    const s = SCHEDULED[kind];
    return run(() => api.post<Detail>(`${path}/mailings`, { kind: s.kind, audience: s.audience, subject: "", text: "", send_at: at.toISOString() }));
  };
  return (
    <section className="card space-y-2 p-5 lg:col-span-2" aria-label={t("mailText.title")}>
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("mailText.title")}</h2>
      <p className="text-xs text-muted">{t("mailText.help")}</p>
      <ul className="divide-y divide-edge">
        {list.map((m) => {
          const s = SCHEDULED[m.kind];
          const planned = s ? party.mailings.filter((x) => x.kind === s.kind && x.audience === s.audience) : [];
          return (
            <li key={m.kind} className="space-y-2 py-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{t(`mailText.name.${m.kind}` as TranslationKey)}</span>
                  {(m.subject || m.text) && <span className="ml-2 rounded bg-accent-soft px-1.5 text-xs">{t("mailText.own")}</span>}
                  <span className="block text-xs text-muted">
                    {s ? (planned.length ? planned.map((x) => (x.sent_at ? t("mailText.sentAt", { when: new Date(x.sent_at).toLocaleString(dateLocale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) }) : t("mailText.goesAt", { when: new Date(x.send_at).toLocaleString(dateLocale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) }))).join(" · ") : t("mailText.notPlanned")) : t(`mailText.auto.${m.kind}` as TranslationKey)}
                  </span>
                </span>
                <button className="btn-ghost border border-edge text-xs" aria-expanded={open === m.kind} aria-label={t("mailText.editOf", { name: t(`mailText.name.${m.kind}` as TranslationKey) })} onClick={() => (open === m.kind ? setOpen(null) : start(m.kind))}>{t("mailText.edit")}</button>
              </div>
              {open === m.kind && (
                <div className="space-y-2 rounded-xl border border-edge p-3">
                  <label className="block"><span className="label">{t("mailText.subject")}</span><input className="input" value={draft.subject} maxLength={160} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></label>
                  <label className="block"><span className="label">{t("mailText.text")}</span><textarea className="input min-h-24" value={draft.text} maxLength={4000} onChange={(e) => setDraft({ ...draft, text: e.target.value })} /></label>
                  <div className="flex flex-wrap gap-1" aria-label={t("poster.tokens")}>
                    {["name", "title", "when", "link"].map((k) => <button key={k} type="button" className="rounded border border-edge px-1.5 text-[11px] text-muted hover:text-ink" onClick={() => setDraft({ ...draft, text: `${draft.text}{${k}}` })}>{`{${k}}`}</button>)}
                  </div>
                  <p className="text-xs text-muted">{t("mailText.linkNote")}</p>
                  <MailPreview path={path} subject={draft.subject} text={draft.text} />
                  <div className="flex flex-wrap items-center gap-3">
                    <SaveButton className="btn-primary" onSave={() => save(m.kind)} />
                    <button className="text-xs text-muted hover:underline" onClick={() => { setDraft({ subject: m.default_subject, text: m.default_text }); void change({ mail_texts: { [m.kind]: { subject: "", text: "" } } }, { quiet: true }); }}>{t("mailText.reset")}</button>
                  </div>
                  {s && party.mail && (
                    <div className="flex flex-wrap items-end gap-2 border-t border-edge pt-2">
                      <label><span className="label">{t("parties.mailWhen")}</span><input className="input !w-auto" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
                      <button className="btn-ghost border border-edge" onClick={() => plan(m.kind, new Date(when))}>{t("parties.mailPlan")}</button>
                      <button className="btn-ghost border border-edge" onClick={() => plan(m.kind, new Date())}>{t("parties.mailNow")}</button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Suppliers: found through the server's own search or added by hand, and the chosen one into the budget.
const CATEGORIES = ["catering", "decoration", "dj", "music", "venue", "photo", "cake", "rental", "other"];
type Hit = { title: string; url: string; site: string; snippet: string };

export function Vendors({ party, run, path }: TabProps) {
  const { t } = useI18n();
  const blank = { category: "catering", name: "", url: "", contact: "", price: "" };
  const [form, setForm] = useState(blank);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState<{ enabled: boolean; hits: Hit[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const category = (c: string) => t(`vendor.cat.${c}` as TranslationKey);
  const find = async (words: string) => {
    setBusy(true);
    setError("");
    try {
      setSearch(await api.get<{ enabled: boolean; hits: Hit[] }>(`${path}/vendors/search?q=${encodeURIComponent(words)}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };
  const add = (v: { category: string; name: string; url?: string; contact?: string; price?: string }) => run(() => api.post<Detail>(`${path}/vendors`, { category: v.category, name: v.name.trim(), url: v.url ?? "", contact: v.contact ?? "", price: v.price ? Number(v.price.replace(",", ".")) : null }));
  const near = party.address || party.place;
  return (
    <section className="card space-y-3 p-5" aria-label={t("vendor.title")}>
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("vendor.title")}</h2>
      <p className="text-xs text-muted">{t("vendor.help")}</p>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim().length > 1) void find(q.trim()); }}>
        <label><span className="label">{t("vendor.category")}</span>
          <select className="input" value={form.category} onChange={(e) => { setForm({ ...form, category: e.target.value }); setQ(`${category(e.target.value)} ${near}`.trim()); }}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{category(c)}</option>)}
          </select>
        </label>
        <label className="min-w-40 flex-1"><span className="label">{t("vendor.search")}</span><input className="input" value={q} maxLength={200} placeholder={`${category(form.category)} ${near}`.trim()} onChange={(e) => setQ(e.target.value)} /></label>
        <button className="btn-ghost flex items-center gap-1 border border-edge" type="submit" disabled={busy || q.trim().length < 2}><Search className="h-4 w-4" aria-hidden />{t("vendor.searchButton")}</button>
      </form>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      {search && !search.enabled && <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">{t("vendor.searchOff")}</p>}
      {search?.enabled && (search.hits.length ? (
        <ul className="divide-y divide-edge rounded-lg border border-edge px-3 text-sm [overflow-wrap:anywhere]" aria-label={t("vendor.hits")}>
          {search.hits.map((h) => (
            <li key={h.url} className="flex items-start gap-2 py-2">
              <span className="min-w-0 flex-1"><a className="font-semibold hover:underline" href={h.url} target="_blank" rel="noreferrer">{h.title}</a><span className="block text-xs text-muted">{h.site}{h.snippet && ` · ${h.snippet.slice(0, 120)}`}</span></span>
              <button className="btn-ghost border border-edge text-xs" aria-label={t("vendor.addOf", { name: h.title })} onClick={() => add({ category: form.category, name: h.title.slice(0, 160), url: h.url })}>{t("parties.add")}</button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">{t("vendor.noHits")}</p>)}
      {party.vendors.length > 0 && (
        <ul className="divide-y divide-edge text-sm [overflow-wrap:anywhere]">
          {party.vendors.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 basis-40 flex-1">
                <span className="font-semibold">{v.name}</span> <span className="text-xs text-muted">{category(v.category)}</span>
                {v.url && <a className="ml-1 inline-flex align-middle text-muted hover:text-ink" href={v.url} target="_blank" rel="noreferrer" aria-label={t("vendor.open", { name: v.name })}><ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>}
                {v.contact && <span className="block text-xs text-muted">{v.contact}</span>}
              </span>
              <input className="input !w-24 py-1 text-sm" inputMode="decimal" key={`${v.id}:${v.price}`} defaultValue={v.price ?? ""} placeholder={t("parties.amount")} aria-label={t("vendor.priceOf", { name: v.name })} onBlur={(e) => { const n = e.target.value.trim() ? Number(e.target.value.replace(",", ".")) : null; if (n !== v.price && !Number.isNaN(n)) void run(() => api.put<Detail>(`${path}/vendors/${v.id}`, { price: n })); }} />
              <select className="input !w-auto py-1 text-sm" aria-label={t("vendor.statusOf", { name: v.name })} value={v.status} onChange={(e) => run(() => api.put<Detail>(`${path}/vendors/${v.id}`, { status: e.target.value }))}>
                {["idea", "asked", "booked", "no"].map((s) => <option key={s} value={s}>{t(`vendor.status.${s}` as TranslationKey)}</option>)}
              </select>
              {v.in_budget ? <span className="flex items-center gap-1 text-xs text-accent"><Check className="h-3.5 w-3.5" aria-hidden />{t("vendor.inBudget")}</span> : <button className="btn-ghost border border-edge text-xs" disabled={v.price == null} onClick={() => run(() => api.post<Detail>(`${path}/vendors/${v.id}/budget`))}>{t("vendor.toBudget")}</button>}
              <button className="text-muted hover:text-red-700" aria-label={t("common.remove")} onClick={() => run(() => api.del(`${path}/vendors/${v.id}`).then(() => api.get<Detail>(path)))}><Trash2 className="h-4 w-4" aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
      <form className="grid gap-2 border-t border-edge pt-3 sm:grid-cols-[1fr_1fr_7rem_auto]" onSubmit={(e) => { e.preventDefault(); if (form.name.trim()) void add(form).then(() => setForm({ ...blank, category: form.category })); }}>
        <label><span className="label">{t("vendor.name")}</span><input className="input" value={form.name} maxLength={160} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label><span className="label">{t("vendor.contact")}</span><input className="input" value={form.contact} maxLength={200} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></label>
        <label><span className="label">{t("parties.amount")}</span><input className="input" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
        <button className="btn-primary flex h-fit items-center gap-1 self-end" type="submit" disabled={!form.name.trim()}><Plus className="h-4 w-4" aria-hidden />{t("parties.add")}</button>
      </form>
    </section>
  );
}
