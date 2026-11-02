"use client";

// The family's settings → Children: how each child earns their allowance – points per unit of
// money, or a fixed amount for a reached point goal – and per week or month (2.8.2; before that in
// the allowance app).
import { useState } from "react";
import { AllowanceOverviewItem, api } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";

// The rate as points per unit; older installs may only have money per point.
export function pointsPerUnit(item: { points_per_unit: number | null; rate: number | null }): number | null {
  if (item.points_per_unit) return item.points_per_unit;
  if (item.rate) return Math.round(1 / item.rate);
  return null;
}

/** "10 points = 1 kr a week" or "50 kr for 100 points a week". */
export function earningLine(item: AllowanceOverviewItem, t: (key: TranslationKey, vars?: Record<string, string | number>) => string): string {
  const period = item.period === "month" ? t("allowance.perMonth") : t("allowance.perWeek");
  if (item.mode === "goal" && item.min_points && item.amount) return `${t("allowance.earningGoal", { amount: item.amount, currency: item.currency, points: item.min_points })} · ${period}`;
  const ppu = pointsPerUnit(item);
  return ppu ? `${t("allowance.rateLine", { points: ppu, currency: item.currency })} · ${period}` : t("allowance.notSetUp");
}

function ChildRate({ item }: { item: AllowanceOverviewItem }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"points" | "goal">(item.mode ?? "points");
  const [rate, setRate] = useState(pointsPerUnit(item)?.toString() ?? "");
  const [minPoints, setMinPoints] = useState(item.min_points?.toString() ?? "");
  const [goalAmount, setGoalAmount] = useState(item.amount?.toString() ?? "");
  const [period, setPeriod] = useState<"week" | "month">(item.period ?? "week");
  const [message, setMessage] = useState("");

  async function saveRate() {
    const value = rate.trim() === "" ? null : Math.round(Number(rate));
    if (value !== null && (!Number.isFinite(value) || value < 1)) return;
    const goal = Math.round(Number(minPoints));
    const prize = Number(goalAmount.replace(",", "."));
    if (mode === "goal" && !(goal >= 1 && prize > 0)) {
      setMessage(t("allowance.invalidSetup"));
      return;
    }
    await api.put(`/api/allowance/children/${item.user_id}/rate`, {
      mode,
      points_per_unit: value,
      min_points: mode === "goal" ? goal : null,
      amount: mode === "goal" ? prize : null,
      period,
    });
    setMessage(t("home.saved"));
  }

  return (
    <section className="card p-5" aria-label={item.display_name}>
      <h3 className="mb-3 flex items-center gap-2 font-bold">
        <span className="h-3 w-3 rounded-full" style={{ background: item.color }} aria-hidden />
        {item.display_name}
      </h3>
      <div>
          <label className="label">{t("allowance.modeLabel")}</label>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-edge p-1" role="radiogroup">
            {(["points", "goal"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${mode === m ? "bg-primary-800 text-white" : "text-muted hover:bg-surface"}`}
                onClick={() => setMode(m)}
              >
                {m === "points" ? t("allowance.modePoints", { currency: item.currency }) : t("allowance.modeGoal")}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">
            {mode === "points" ? t("allowance.modePointsHint", { currency: item.currency }) : t("allowance.modeGoalHint")}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {mode === "points" ? (
              <div>
                <label className="label">{t("allowance.rateLabel", { currency: item.currency })}</label>
                <input className="input" type="number" min={1} inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="10" />
              </div>
            ) : (
              <>
                <div>
                  <label className="label">{t("allowance.goalSetting")}</label>
                  <input className="input" type="number" min={1} inputMode="numeric" value={minPoints} onChange={(e) => setMinPoints(e.target.value)} placeholder="100" />
                </div>
                <div>
                  <label className="label">{t("allowance.amountLabel", { currency: item.currency })}</label>
                  <input className="input" inputMode="decimal" value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)} placeholder="50" />
                </div>
              </>
            )}
            <div>
              <label className="label">{t("allowance.periodLabel")}</label>
              <select className="input" value={period} onChange={(e) => setPeriod(e.target.value as "week" | "month")}>
                <option value="week">{t("allowance.perWeek")}</option>
                <option value="month">{t("allowance.perMonth")}</option>
              </select>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted">{t("allowance.goalHint")}</p>
          <button className="btn-primary mt-3" onClick={saveRate}>{t("allowance.save")}</button>
        </div>
      {message && (
        <p role="status" className="mt-2 text-sm text-muted">
          {message}
        </p>
      )}
    </section>
  );
}

// `only`: just this child (their page in the family's settings, 3.0.4).
export default function AllowanceRates({ only }: { only?: string } = {}) {
  const { t } = useI18n();
  // From the cache: a saved rate invalidates the allowance, and the overview refreshes.
  const overview = useApi<AllowanceOverviewItem[]>("/api/allowance/overview");
  const children = overview.data ?? (overview.isError ? NONE : null);
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("allowance.title")}</h2>
      {children === null ? (
        <p className="text-sm text-muted">{t("common.loading")}</p>
      ) : children.length === 0 ? (
        <p className="text-sm text-muted">{t("allowance.noChildren")}</p>
      ) : (
        children.filter((item) => !only || item.user_id === only).map((item) => <ChildRate key={item.user_id} item={item} />)
      )}
    </div>
  );
}
