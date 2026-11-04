"use client";

// The household's subscriptions (3.4.0), for the adults: everything paid for regularly, with what it comes
// to, its login from the vault if it has one, and suggestions from the bank's file. It's an overview: what's
// in the household's economy stays there, nothing here is counted twice.
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Copy, ExternalLink, KeyRound, Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import { api, request } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { setApiData, useApi } from "@/lib/query";
import { useMe } from "@/components/Shell";
import PageTitle, { EmptyState } from "@/components/PageTitle";

const PATH = "/api/subscriptions";
const CATEGORIES = ["streaming", "music", "phone", "internet", "insurance", "membership", "software", "news", "other"];
const INTERVALS = ["week", "month", "quarter", "year"];

type Item = {
  id: string; name: string; category: string; amount: number; interval: string; per_month: number; next_payment: string | null; cancel_by: string | null; who: string; url: string;
  login_id: string | null; note: string; private: boolean; ended_on: string | null; from_bank: boolean; seen_amount: number | null; seen_on: string | null; price_changed: boolean; still_paid: boolean;
};
type Idea = { id: string; name: string; category: string; amount: number; interval: string; last_seen: string };
type Overview = { currency: string; per_month: number; per_year: number; items: Item[]; suggestions: Idea[]; dismissed: Idea[] };
type Login = { id: string; title: string; url: string; username: string; has_password: boolean };

const blank = { name: "", category: "streaming", amount: "", interval: "month", next_payment: "", cancel_by: "", who: "", url: "", login_id: "", note: "", private: false };

export default function SubscriptionsPage() {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  const adult = me.role !== "child";
  const view = useApi<Overview>(adult ? PATH : null).data;
  // The vault's own rules decide which logins come back: only those this person may see.
  const logins = useApi<Login[]>(adult ? "/api/vault/logins" : null).data ?? [];
  const [form, setForm] = useState(blank);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const T = (k: string, v?: Record<string, string | number>) => t(k as TranslationKey, v);

  if (!adult) return <EmptyState>{t("subs.adultsOnly")}</EmptyState>;
  const money = (v: number) => `${Math.round(v).toLocaleString(dateLocale)} ${view?.currency ?? ""}`.trim();
  const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" });
  const run = async (action: Promise<Overview>) => {
    setError("");
    try {
      const next = await action;
      setApiData<Overview>(PATH, () => next);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
      return false;
    }
  };
  const close = () => {
    setForm(blank);
    setAdding(false);
    setEditing(null);
  };
  const save = async () => {
    const { login_id, ...rest } = form;
    const body = { ...rest, name: form.name.trim(), amount: Number(form.amount.replace(",", ".")), next_payment: form.next_payment || null, cancel_by: form.cancel_by || null, url: form.url.trim() };
    // The login is chosen on the row when editing: this person may not see the one that's linked.
    const ok = await run(editing ? api.put<Overview>(`${PATH}/${editing}`, body) : api.post<Overview>(PATH, { ...body, login_id: login_id || null }));
    if (ok) close();
  };
  const edit = (x: Item) => {
    setAdding(false);
    setEditing(x.id);
    setForm({ ...blank, name: x.name, category: x.category, amount: String(x.amount), interval: x.interval, next_payment: x.next_payment ?? "", cancel_by: x.cancel_by ?? "", who: x.who, url: x.url, note: x.note, private: x.private });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const copyPassword = async (login: Login) => {
    setError("");
    try {
      const { password } = await request<{ password: string }>(`/api/vault/logins/${login.id}/secret`);
      await navigator.clipboard.writeText(password);
      setCopied(login.id);
      setTimeout(() => setCopied(""), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  };
  const active = view?.items.filter((x) => !x.ended_on) ?? [];
  const ended = view?.items.filter((x) => x.ended_on) ?? [];
  const ideas = view?.suggestions ?? [];

  const row = (x: Item) => {
    const login = logins.find((l) => l.id === x.login_id);
    return (
      <li key={x.id} className="space-y-1 py-3 text-sm [overflow-wrap:anywhere]">
        <div className="flex flex-wrap items-start gap-2">
          <span className="min-w-0 flex-1">
            <span className="font-semibold">{x.name}</span>
            {x.private && <Lock className="ml-1 inline h-3.5 w-3.5 text-muted" aria-label={t("subs.private")} />}
            <span className="block text-xs text-muted">
              {[T(`subs.cat.${x.category}`), x.who, x.next_payment && !x.ended_on ? t("subs.next", { date: day(x.next_payment) }) : "", x.cancel_by && !x.ended_on ? t("subs.cancelBy", { date: day(x.cancel_by) }) : "", x.ended_on ? t("subs.endedOn", { date: day(x.ended_on) }) : ""].filter(Boolean).join(" · ")}
            </span>
          </span>
          <span className="text-right">
            <span className="block font-semibold">{money(x.amount)} {T(`subs.per.${x.interval}`)}</span>
            {x.interval !== "month" && <span className="block text-xs text-muted">{t("subs.perMonthIs", { amount: money(x.per_month) })}</span>}
          </span>
        </div>
        {x.price_changed && x.seen_amount != null && (
          <p className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">{t("subs.priceChanged", { paid: money(x.seen_amount), date: x.seen_on ? day(x.seen_on) : "" })}</span>
            <button className="underline underline-offset-2" onClick={() => run(api.put<Overview>(`${PATH}/${x.id}`, { amount: x.seen_amount }))}>{t("subs.usePrice")}</button>
          </p>
        )}
        {x.still_paid && <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />{t("subs.stillPaid", { date: x.seen_on ? day(x.seen_on) : "" })}</p>}
        {x.note && <p className="whitespace-pre-line text-xs text-muted">{x.note}</p>}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {login ? (
            <>
              <span className="flex items-center gap-1 text-muted"><KeyRound className="h-3.5 w-3.5" aria-hidden />{login.title}{login.username && ` · ${login.username}`}</span>
              {login.has_password && <button className="flex items-center gap-1 underline underline-offset-2" aria-label={t("subs.copyPasswordOf", { name: x.name })} onClick={() => { void copyPassword(login); }}>{copied === login.id ? <Check className="h-3.5 w-3.5 text-accent" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}{copied === login.id ? t("subs.copied") : t("subs.copyPassword")}</button>}
              <Link className="underline underline-offset-2" href="/vault">{t("subs.inVault")}</Link>
            </>
          ) : x.login_id ? <span className="flex items-center gap-1 text-muted"><KeyRound className="h-3.5 w-3.5" aria-hidden />{t("subs.loginElsewhere")}</span> : null}
          {(x.url || login?.url) && <a className="flex items-center gap-1 underline underline-offset-2" href={x.url || login?.url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" aria-hidden />{t("subs.open")}</a>}
          {logins.length > 0 && <label className="flex items-center gap-1 text-muted">
            <span className="sr-only">{t("subs.loginOf", { name: x.name })}</span>
            <select className="input !w-auto py-0 text-xs" aria-label={t("subs.loginOf", { name: x.name })} value={login?.id ?? ""} onChange={(e) => run(api.put<Overview>(`${PATH}/${x.id}`, { login_id: e.target.value || null }))}>
              <option value="">{t("subs.noLogin")}</option>
              {logins.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
          </label>}
          <span className="ml-auto flex items-center gap-3">
            <button className="text-muted hover:text-ink" aria-label={t("subs.editOf", { name: x.name })} onClick={() => edit(x)}><Pencil className="h-4 w-4" aria-hidden /></button>
            {x.ended_on
              ? <button className="underline underline-offset-2" onClick={() => run(api.put<Overview>(`${PATH}/${x.id}`, { ended_on: null }))}>{t("subs.restart")}</button>
              : <button className="underline underline-offset-2" aria-label={t("subs.endOf", { name: x.name })} onClick={() => run(api.put<Overview>(`${PATH}/${x.id}`, { ended_on: new Date().toISOString().slice(0, 10) }))}>{t("subs.end")}</button>}
            <button className="text-muted hover:text-red-700" aria-label={t("subs.removeOf", { name: x.name })} onClick={() => window.confirm(t("subs.removeConfirm", { name: x.name })) && run(api.del(`${PATH}/${x.id}`) as unknown as Promise<Overview>)}><Trash2 className="h-4 w-4" aria-hidden /></button>
          </span>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle title={t("nav.subscriptions")} />
        {!adding && !editing && <button className="btn-primary flex items-center gap-1.5" onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden />{t("subs.add")}</button>}
      </div>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}

      {view && (
        <section className="card grid grid-cols-2 gap-3 p-5 text-center" aria-label={t("subs.total")}>
          <div><p className="text-2xl font-extrabold" data-testid="per-month">{money(view.per_month)}</p><p className="text-xs text-muted">{t("subs.perMonth")}</p></div>
          <div><p className="text-2xl font-extrabold" data-testid="per-year">{money(view.per_year)}</p><p className="text-xs text-muted">{t("subs.perYear")}</p></div>
        </section>
      )}

      {ideas.length > 0 && (
        <section className="card space-y-2 p-5" aria-label={t("subs.suggestions")}>
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("subs.suggestions")}</h2>
          <p className="text-xs text-muted">{t("subs.suggestionsHelp")}</p>
          <ul className="divide-y divide-edge text-sm [overflow-wrap:anywhere]">
            {ideas.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1"><span className="font-semibold">{s.name}</span><span className="block text-xs text-muted">{money(s.amount)} {T(`subs.per.${s.interval}`)} · {t("subs.lastSeen", { date: day(s.last_seen) })}</span></span>
                <button className="btn-ghost flex items-center gap-1 border border-edge text-xs" aria-label={t("subs.acceptOf", { name: s.name })} onClick={() => run(api.post<Overview>(`${PATH}/suggestions/${s.id}/accept`))}><Plus className="h-3.5 w-3.5" aria-hidden />{t("subs.accept")}</button>
                <button className="btn-ghost flex items-center gap-1 text-xs" aria-label={t("subs.dismissOf", { name: s.name })} onClick={() => run(api.post<Overview>(`${PATH}/suggestions/${s.id}/dismiss`))}><X className="h-3.5 w-3.5" aria-hidden />{t("subs.dismiss")}</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(adding || editing) && (
        <form className="card grid gap-3 p-5 sm:grid-cols-2" aria-label={editing ? t("subs.edit") : t("subs.add")} onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <label><span className="label">{t("subs.name")}</span><input className="input" value={form.name} maxLength={120} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label><span className="label">{t("subs.category")}</span><select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{T(`subs.cat.${c}`)}</option>)}</select></label>
          <label><span className="label">{t("subs.amount")}</span><input className="input" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
          <label><span className="label">{t("subs.interval")}</span><select className="input" value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value })}>{INTERVALS.map((c) => <option key={c} value={c}>{T(`subs.interval.${c}`)}</option>)}</select></label>
          <label><span className="label">{t("subs.nextPayment")}</span><input className="input" type="date" value={form.next_payment} onChange={(e) => setForm({ ...form, next_payment: e.target.value })} /></label>
          <label><span className="label">{t("subs.cancelByLabel")}</span><input className="input" type="date" value={form.cancel_by} onChange={(e) => setForm({ ...form, cancel_by: e.target.value })} /></label>
          <label><span className="label">{t("subs.who")}</span><input className="input" value={form.who} maxLength={120} onChange={(e) => setForm({ ...form, who: e.target.value })} /></label>
          <label><span className="label">{t("subs.url")}</span><input className="input" type="url" value={form.url} maxLength={500} placeholder="https://" onChange={(e) => setForm({ ...form, url: e.target.value })} /></label>
          {!editing && <label><span className="label">{t("subs.login")}</span><select className="input" value={form.login_id} onChange={(e) => setForm({ ...form, login_id: e.target.value })}><option value="">{t("subs.noLogin")}</option>{logins.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</select></label>}
          <label><span className="label">{t("subs.note")}</span><input className="input" value={form.note} maxLength={1000} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary-700" checked={form.private} onChange={(e) => setForm({ ...form, private: e.target.checked })} /><span>{t("subs.private")}<span className="block text-xs text-muted">{t("subs.privateHelp")}</span></span></label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button className="btn-primary" type="submit" disabled={!form.name.trim() || !form.amount.trim() || Number.isNaN(Number(form.amount.replace(",", ".")))}>{t("common.save")}</button>
            <button className="btn-ghost" type="button" onClick={close}>{t("common.cancel")}</button>
          </div>
        </form>
      )}

      <section className="card p-5" aria-label={t("nav.subscriptions")}>
        {view && active.length === 0 ? <EmptyState>{t("subs.empty")}</EmptyState> : <ul className="divide-y divide-edge">{active.map(row)}</ul>}
        <p className="mt-2 text-xs text-muted"><Link className="underline underline-offset-2" href="/bank-import">{t("subs.fromBank")}</Link></p>
      </section>

      {ended.length > 0 && (
        <section className="card p-5" aria-label={t("subs.ended")}>
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("subs.ended")}</h2>
          <ul className="divide-y divide-edge">{ended.map(row)}</ul>
        </section>
      )}

      {(view?.dismissed.length ?? 0) > 0 && (
        <details className="card p-5 text-sm">
          <summary className="cursor-pointer font-semibold">{t("subs.dismissed", { n: view!.dismissed.length })}</summary>
          <ul className="mt-2 divide-y divide-edge [overflow-wrap:anywhere]">
            {view!.dismissed.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1">{s.name} <span className="text-xs text-muted">{money(s.amount)}</span></span>
                <button className="text-xs underline underline-offset-2" onClick={() => run(api.post<Overview>(`${PATH}/suggestions/${s.id}/restore`))}>{t("subs.restore")}</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
