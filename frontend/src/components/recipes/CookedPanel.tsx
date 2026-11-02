"use client";

// After cooking (2.8.4): what came from the pantry – all used, some left (how much, in per cent), or
// none – so the pantry counts itself down. Only the items you answer for change.
import { useEffect, useState } from "react";
import { api, PantryItem } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type Match = { ingredient: string; items: PantryItem[] };

export default function CookedPanel({ ingredients, onDone }: { ingredients: string[]; onDone: () => void }) {
  const { t, dateLocale } = useI18n();
  const [matches, setMatches] = useState<Match[] | null>(null);
  // item id → per cent left (0 = all used, 100 = none used)
  const [left, setLeft] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.post<Match[]>("/api/pantry/match", { ingredients }).then(setMatches).catch(() => setMatches([]));
  }, [ingredients]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const items = Object.entries(left).filter(([, pct]) => pct < 100).map(([item_id, left_pct]) => ({ item_id, left_pct }));
      if (items.length) await api.post("/api/pantry/use", { items });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const choice = (id: string, pct: number) => setLeft((prev) => ({ ...prev, [id]: pct }));
  const amount = (i: PantryItem) => (i.amount !== null ? `${i.amount.toLocaleString(dateLocale)} ${i.unit}`.trim() : "");

  if (matches === null) return <p className="mt-4 text-sm text-muted">{t("common.loading")}</p>;
  return (
    <section className="mt-6 rounded-xl border-2 border-accent p-4" aria-label={t("cooked.title")}>
      <h3 className="text-lg font-bold">{t("cooked.title")}</h3>
      {matches.length === 0 ? (
        <p className="mt-1 text-sm text-muted">{t("cooked.nothing")}</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">{t("cooked.hint")}</p>
          <button className="btn-ghost mt-2 border border-edge text-sm" onClick={() => setLeft(Object.fromEntries(matches.flatMap((m) => m.items.slice(0, 1)).map((i) => [i.id, 0])))}>
            {t("cooked.allUsed")}
          </button>
          <ul className="mt-3 space-y-3">
            {matches.flatMap((m) =>
              m.items.map((item) => {
                const pct = left[item.id];
                return (
                  <li key={item.id} className="rounded-lg bg-base p-3">
                    <p className="text-base">
                      <span className="font-semibold">{item.name}</span> <span className="text-sm text-muted">{amount(item)} · {t("cooked.for", { ingredient: m.ingredient })}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={item.name}>
                      <button aria-pressed={pct === 0} className={`min-h-11 rounded-full border px-4 text-sm ${pct === 0 ? "border-accent bg-accent-soft font-semibold" : "border-edge"}`} onClick={() => choice(item.id, 0)}>{t("cooked.usedAll")}</button>
                      <button aria-pressed={pct !== undefined && pct > 0 && pct < 100} className={`min-h-11 rounded-full border px-4 text-sm ${pct !== undefined && pct > 0 && pct < 100 ? "border-accent bg-accent-soft font-semibold" : "border-edge"}`} onClick={() => choice(item.id, 50)}>{t("cooked.someLeft")}</button>
                      <button aria-pressed={pct === 100} className={`min-h-11 rounded-full border px-4 text-sm ${pct === 100 ? "border-accent bg-accent-soft font-semibold" : "border-edge"}`} onClick={() => choice(item.id, 100)}>{t("cooked.notUsed")}</button>
                    </div>
                    {pct !== undefined && pct > 0 && pct < 100 && (
                      <label className="mt-2 flex items-center gap-3 text-sm">
                        {t("cooked.howMuch")}
                        <input type="range" min={10} max={90} step={10} value={pct} onChange={(e) => choice(item.id, Number(e.target.value))} className="flex-1 accent-primary-700" aria-label={t("cooked.howMuchOf", { name: item.name })} />
                        <span className="w-12 text-right tabular-nums">{pct} %</span>
                      </label>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button className="btn-primary min-h-11" disabled={busy} onClick={save}>{busy ? t("common.loading") : t("cooked.save")}</button>
        <button className="btn-ghost min-h-11" onClick={onDone}>{t("cooked.skip")}</button>
      </div>
    </section>
  );
}
