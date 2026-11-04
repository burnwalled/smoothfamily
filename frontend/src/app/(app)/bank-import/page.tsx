"use client";

// Import from the bank (2.7.5): upload the bank's CSV export, look over where each purchase goes –
// a vehicle, a home, or nowhere – and import. The file is read on the server and not kept; choices
// can be remembered as rules. For adults (the family's economy).
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, Trash2, Upload } from "lucide-react";
import { api, Property, Vehicle } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";
import { useMe } from "@/components/Shell";
import PageTitle, { EmptyState } from "@/components/PageTitle";

type Suggestion = { target: "vehicle" | "property" | "economy" | "ignore"; target_id: string | null; category: string; source: "rule" | "known" | "none" };
type Row = { day: string; text: string; amount: number; digest: string; imported: boolean; suggestion: Suggestion; pattern: string; has_receipt?: boolean };
type Choice = Row & { keep: boolean; where: string; category: string; name: string; remember: boolean; pat: string };
type Rule = { id: string; pattern: string; target: string; target_id: string | null; category: string };

const VEHICLE_CATS = ["fuel", "charging", "service", "repair", "tyres", "insurance", "tax", "parking", "toll", "other"];
const PROPERTY_CATS = ["maintenance", "renovation", "repair", "tax", "insurance", "utility", "loan", "other"];
// The household's economy (2.8.5): everything that belongs to no home or vehicle.
const ECONOMY_CATS = ["food", "clothes", "children", "health", "leisure", "transport", "subscriptions", "electronics", "gifts", "travel", "insurance", "housing", "savings", "other"];
const catsOf = (kind: string) => (kind === "vehicle" ? VEHICLE_CATS : kind === "property" ? PROPERTY_CATS : kind === "economy" ? ECONOMY_CATS : []);
const catKey = (kind: string, c: string) => (kind === "vehicle" ? `vehicles.cat.${c}` : kind === "property" ? `property.cat.${c}` : `economy.cat.${c}`);

export default function BankImportPage() {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  const [rows, setRows] = useState<Choice[] | null>(null);
  const [suggested, setSuggested] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showDone, setShowDone] = useState(false);

  // From the cache; an import refreshes the rules it learned.
  const cars = useApi<Vehicle[]>(me.apps.includes("vehicles") ? "/api/vehicles" : null).data ?? NONE;
  const homes = useApi<Property[]>(me.apps.includes("property") ? "/api/property/properties" : null).data ?? NONE;
  const rules = useApi<Rule[]>("/api/bank/rules").data ?? NONE;

  const places = useMemo(
    () => [
      ...cars.map((c) => ({ value: `vehicle:${c.id}`, label: `🚗 ${c.name}` })),
      ...homes.map((h) => ({ value: `property:${h.id}`, label: `🏠 ${h.name}` })),
      ...(me.apps.includes("property") ? [{ value: "economy:", label: `💰 ${t("nav.economy")}` }] : []),
    ],
    [cars, homes, me.apps, t],
  );
  const placeName = (target: string, id: string | null) => places.find((p) => p.value === `${target}:${id ?? ""}`)?.label.slice(2) ?? (target === "ignore" ? t("bank.skip") : "–");

  async function upload(file: File) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = new FormData();
      data.append("file", file);
      const resp = await fetch("/api/bank/parse", { method: "POST", body: data, credentials: "same-origin" });
      if (!resp.ok) throw new Error((await resp.json().catch(() => null))?.detail ?? t("common.error"));
      const parsed = (await resp.json()) as Row[];
      // What the file showed of subscriptions is waiting in the overview.
      api.get<{ suggestions: unknown[] }>("/api/subscriptions").then((o) => setSuggested(o.suggestions.length)).catch(() => {});
      setRows(
        parsed.map((r) => {
          const where = r.suggestion.target === "economy" ? "economy:" : r.suggestion.target === "ignore" || !r.suggestion.target_id ? (r.suggestion.target === "ignore" ? "ignore" : "") : `${r.suggestion.target}:${r.suggestion.target_id}`;
          return { ...r, keep: !r.imported && where !== "ignore" && where !== "", where: where || "ignore", category: r.suggestion.category, name: r.text, remember: false, pat: r.pattern };
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const set = (digest: string, patch: Partial<Choice>) => setRows((all) => all?.map((r) => (r.digest === digest ? { ...r, ...patch } : r)) ?? null);

  async function importRows() {
    if (!rows) return;
    setBusy(true);
    setError("");
    try {
      const chosen = rows.filter((r) => (r.keep && r.where !== "ignore") || r.remember);
      const body = chosen.map((r) => {
        const [target, id] = r.where === "ignore" || !r.keep ? ["ignore", null] : r.where.split(":");
        return { day: r.day, text: r.text, amount: r.amount, digest: r.digest, target, target_id: id || null, category: r.category, name: r.name.trim(), remember: r.remember, pattern: r.pat.trim() };
      });
      if (body.length === 0) return;
      const result = await api.post<{ imported: number; skipped: number; rules: number }>("/api/bank/import", { rows: body });
      setMessage(t("bank.done", { n: result.imported, rules: result.rules }));
      setRows(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  if (me.role === "child") return <p className="text-sm text-muted">{t("bank.adultsOnly")}</p>;
  const shown = (rows ?? []).filter((r) => showDone || !r.imported);
  const chosen = (rows ?? []).filter((r) => r.keep && r.where !== "ignore");
  const total = chosen.reduce((sum, r) => sum + r.amount, 0);

  return (
    <>
      <button className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:underline" onClick={() => history.back()}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
        {t("bank.back")}
      </button>
      <PageTitle title={t("bank.title")} />
      {suggested > 0 && <p className="mb-3 rounded-lg bg-accent-soft p-3 text-sm" role="status">{t("subs.foundInFile", { n: suggested })} <Link className="font-semibold underline underline-offset-2" href="/subscriptions">{t("subs.seeThem")}</Link></p>}
      <p className="mt-1 text-sm text-muted">{t("bank.intro")}</p>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer">{t("bank.howTitle")}</summary>
        <p className="mt-1 whitespace-pre-line">{t("bank.how")}</p>
      </details>

      <div className="card mt-4 p-4">
        <label className={`btn-primary inline-flex cursor-pointer items-center gap-1.5 ${busy ? "opacity-60" : ""}`}>
          <Upload className="h-4 w-4" aria-hidden />
          {t("bank.choose")}
          <input type="file" accept=".csv,.txt,text/csv" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
        </label>
        {places.length === 0 && <p className="mt-2 text-xs text-amber-800">{t("bank.noPlaces")}</p>}
        {message && <p className="mt-2 text-sm font-semibold">{message}</p>}
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>

      {rows && (
        <section className="card mt-4 space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">{t("bank.found", { n: rows.length, done: rows.filter((r) => r.imported).length })}</p>
            {rows.some((r) => r.imported) && (
              <label className="flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
                {t("bank.showDone")}
              </label>
            )}
          </div>
          {shown.length === 0 ? (
            <EmptyState>{t("bank.nothingNew")}</EmptyState>
          ) : (
            <ul className="divide-y divide-edge">
              {shown.map((r) => {
                const kind = r.where.split(":")[0];
                const cats = catsOf(kind);
                return (
                  <li key={r.digest} className={`space-y-1.5 py-2 text-sm ${r.imported ? "opacity-50" : ""}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={r.keep} disabled={r.imported} onChange={(e) => set(r.digest, { keep: e.target.checked })} aria-label={t("bank.keep", { text: r.text })} />
                      <span className="w-20 text-xs text-muted">{new Date(`${r.day}T12:00:00`).toLocaleDateString(dateLocale, { day: "numeric", month: "short" })}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{r.text}</span>
                      <span className="tabular-nums">{r.amount.toLocaleString(dateLocale, { minimumFractionDigits: 2 })}</span>
                      {r.imported && <span className="text-xs">{t("bank.alreadyIn")}</span>}
                      <span className={`rounded px-1.5 text-[10px] ${r.has_receipt ? "bg-emerald-100 text-emerald-800" : "bg-base text-muted"}`}>{r.has_receipt ? t("bank.hasReceipt") : t("bank.noReceipt")}</span>
                      {!r.imported && r.suggestion.source !== "none" && <span className="rounded bg-base px-1.5 text-[10px] text-muted">{t(`bank.source.${r.suggestion.source}` as TranslationKey)}</span>}
                    </div>
                    {!r.imported && (
                      <div className="flex flex-wrap items-center gap-2 pl-6">
                        <select
                          className="input w-auto py-1 text-xs"
                          value={r.where}
                          aria-label={t("bank.where", { text: r.text })}
                          onChange={(e) => {
                            const where = e.target.value;
                            const k = where.split(":")[0];
                            const list = catsOf(k).length ? catsOf(k) : PROPERTY_CATS;
                            set(r.digest, { where, keep: where !== "ignore", category: list.includes(r.category) ? r.category : list[list.length - 1] });
                          }}
                        >
                          <option value="ignore">{t("bank.skip")}</option>
                          {places.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                        {cats.length > 0 && (
                          <select className="input w-auto py-1 text-xs" value={r.category} aria-label={t("bank.category")} onChange={(e) => set(r.digest, { category: e.target.value })}>
                            {cats.map((c) => <option key={c} value={c}>{t(catKey(kind, c) as TranslationKey)}</option>)}
                          </select>
                        )}
                        {kind !== "ignore" && <input className="input min-w-32 flex-1 py-1 text-xs" value={r.name} maxLength={200} aria-label={t("bank.name")} onChange={(e) => set(r.digest, { name: e.target.value })} />}
                        <label className="flex items-center gap-1 text-xs text-muted">
                          <input type="checkbox" checked={r.remember} onChange={(e) => set(r.digest, { remember: e.target.checked })} />
                          {t("bank.remember")}
                        </label>
                        {r.remember && <input className="input w-36 py-1 font-mono text-xs" value={r.pat} maxLength={80} aria-label={t("bank.pattern")} title={t("bank.patternHelp")} onChange={(e) => set(r.digest, { pat: e.target.value })} />}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={busy || (chosen.length === 0 && !rows.some((r) => r.remember))} onClick={importRows}>
              {t("bank.import", { n: chosen.length })}
            </button>
            {chosen.length > 0 && <span className="text-sm text-muted">{t("bank.total", { amount: total.toLocaleString(dateLocale, { maximumFractionDigits: 0 }) })}</span>}
          </div>
        </section>
      )}

      {rules.length > 0 && (
        <section className="card mt-4 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted">{t("bank.rules")}</h2>
          <ul className="mt-2 divide-y divide-edge text-sm">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-1.5">
                <span className="font-mono text-xs">{r.pattern}</span>
                <span className="flex-1 text-muted">→ {placeName(r.target, r.target_id)}{r.target !== "ignore" && ` · ${t(catKey(r.target, r.category) as TranslationKey)}`}</span>
                <button className="text-red-700" onClick={() => api.del(`/api/bank/rules/${r.id}`)} aria-label={t("bank.removeRule", { pattern: r.pattern })}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="mt-4 text-xs text-muted">
        <Link className="underline" href="/vehicles">{t("vehicles.title")}</Link> · <Link className="underline" href="/property">{t("property.title")}</Link>
      </p>
    </>
  );
}
