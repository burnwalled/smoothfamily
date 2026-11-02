"use client";

// Family goals: rewards (bowling, a restaurant …) the whole family unlocks with points together.
// `compact` is the dashboard card (progress only); the full view lets adults add and finish goals.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Gift, PartyPopper, Trash2 } from "lucide-react";
import { api, FamilyReward } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/components/Shell";

export default function FamilyGoals({ compact = false }: { compact?: boolean }) {
  const { t, dateLocale } = useI18n();
  const [goals, setGoals] = useState<FamilyReward[] | null>(null);
  const me = useMe();
  const [title, setTitle] = useState("");
  const [points, setPoints] = useState("500");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.live<FamilyReward[]>("/api/rewards", setGoals).catch(() => setGoals([]));
  }, []);

  useEffect(() => {
    load();
  }, [load, compact]);

  const isAdult = me?.role === "admin" || me?.role === "adult";

  async function add() {
    setError("");
    try {
      await api.post("/api/rewards", { title: title.trim(), points_required: Math.round(Number(points)) });
      setTitle("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function redeem(goal: FamilyReward) {
    await api.post(`/api/rewards/${goal.id}/redeem`);
    load();
  }

  async function remove(goal: FamilyReward) {
    if (!confirm(t("common.confirmRemove", { name: goal.title }))) return;
    await api.del(`/api/rewards/${goal.id}`);
    load();
  }

  if (!goals) return <p className="text-sm text-muted">{t("common.loading")}</p>;
  const shown = compact ? goals.filter((g) => !g.redeemed_at).slice(0, 3) : goals;

  return (
    <div className="space-y-3">
      {!compact && <p className="text-sm text-muted">{t("goals.intro")}</p>}
      {shown.length === 0 ? (
        <p className="text-sm text-muted">{compact ? t("goals.noneCompact") : t("goals.none")}</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((goal) => {
            const pct = Math.min(100, Math.round((goal.points / goal.points_required) * 100));
            const unlocked = goal.unlocked_at !== null && goal.redeemed_at === null;
            return (
              <li
                key={goal.id}
                className={`rounded-lg border px-3 py-2.5 ${
                  unlocked ? "border-accent bg-accent-soft" : goal.redeemed_at ? "border-edge opacity-60" : "border-edge"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 font-semibold">
                    {unlocked ? (
                      <PartyPopper className="h-4 w-4 shrink-0 text-accent" strokeWidth={2} aria-hidden />
                    ) : (
                      <Gift className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} aria-hidden />
                    )}
                    <span className="truncate">{goal.title}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {goal.redeemed_at
                      ? t("goals.done", {
                          date: new Date(goal.redeemed_at).toLocaleDateString(dateLocale, { day: "numeric", month: "short" }),
                        })
                      : unlocked
                        ? t("goals.unlocked")
                        : t("goals.progress", { points: goal.points, total: goal.points_required })}
                  </span>
                </div>
                {!goal.redeemed_at && (
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-edge">
                    <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                  </div>
                )}
                {!compact && isAdult && !goal.redeemed_at && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {unlocked && (
                      <button className="btn-accent px-3 py-1 text-xs" onClick={() => redeem(goal)}>
                        {t("goals.markDone")}
                      </button>
                    )}
                    <button className="btn-ghost px-2 py-1 text-xs text-red-700" onClick={() => remove(goal)} aria-label={t("common.remove")}>
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {compact && (
        <Link href="/achievements" className="btn-ghost -ml-2 inline-flex px-2 py-1 text-xs">
          {t("goals.seeAll")}
        </Link>
      )}
      {!compact && isAdult && (
        <form
          className="flex flex-wrap gap-2 border-t border-edge pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input className="input min-w-40 flex-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("goals.titlePh")} maxLength={120} />
          <input
            className="input w-28"
            type="number"
            min={1}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            aria-label={t("goals.pointsLabel")}
          />
          <button className="btn-primary" type="submit" disabled={!title.trim() || !(Number(points) >= 1)}>
            {t("goals.add")}
          </button>
          {error && <p className="w-full text-sm text-red-700">{error}</p>}
        </form>
      )}
    </div>
  );
}
