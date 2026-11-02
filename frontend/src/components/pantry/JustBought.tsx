"use client";

// "Just bought" (2.8.4, not fully tested yet): items ticked off in the shop's app, reached through a
// list linked to Home Assistant. Into the pantry – where – or not; nothing goes in by itself.
import { useEffect, useState } from "react";
import { FlaskConical, ShoppingBag } from "lucide-react";
import { api, PantryPlace } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";

type Bought = { id: string; list_name: string; name: string; place: PantryPlace; food: boolean };

export default function JustBought({ onAdded }: { onAdded: () => void }) {
  const { t } = useI18n();
  // From the cache: ticking things on a list (lists are RELATED to pantry) refreshes it.
  const rows = useApi<Bought[]>("/api/pantry/bought").data ?? NONE;
  const [answers, setAnswers] = useState<Record<string, { keep: boolean; place: PantryPlace }>>({});
  // Each bought thing starts as kept (food) in its usual place.
  useEffect(() => {
    setAnswers((prev) => Object.fromEntries(rows.map((b) => [b.id, prev[b.id] ?? { keep: b.food, place: b.place }])));
  }, [rows]);
  const [error, setError] = useState("");


  async function save() {
    setError("");
    try {
      await api.post("/api/pantry/bought", { items: rows.map((b) => ({ item_id: b.id, ...answers[b.id] })) });
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  if (rows.length === 0) return null;
  return (
    <section id="bought" className="card mt-4 border-2 border-accent p-4" aria-label={t("bought.title")}>
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
        <ShoppingBag className="h-4 w-4" aria-hidden />
        {t("bought.title")}
      </h2>
      <p className="mt-1 text-xs text-muted">{t("bought.hint")}</p>
      <ul className="mt-2 divide-y divide-edge text-sm">
        {rows.map((b) => {
          const a = answers[b.id] ?? { keep: b.food, place: b.place };
          return (
            <li key={b.id} className="flex flex-wrap items-center gap-2 py-2">
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={a.keep} onChange={(e) => setAnswers({ ...answers, [b.id]: { ...a, keep: e.target.checked } })} />
                <span className="truncate">{b.name}</span>
                <span className="text-xs text-muted">{b.list_name}</span>
              </label>
              <select className="input w-auto py-1 text-xs" value={a.place} disabled={!a.keep} onChange={(e) => setAnswers({ ...answers, [b.id]: { ...a, place: e.target.value as PantryPlace } })} aria-label={t("bought.where", { name: b.name })}>
                {(["fridge", "freezer", "pantry"] as const).map((p) => <option key={p} value={p}>{t(`pantry.place.${p}` as TranslationKey)}</option>)}
              </select>
            </li>
          );
        })}
      </ul>
      <button className="btn-primary mt-2" onClick={save}>{t("bought.save")}</button>
      <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
        <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {t("lists.haBeta")}
      </p>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
