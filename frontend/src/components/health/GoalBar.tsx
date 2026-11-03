"use client";

// A family goal's progress (3.4.0): Health, the Sunday check-in and the kitchen display.
import type { ExerciseGoal } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";

/** A goal's amount in its own unit: hours for minutes, km, or workouts. */
export function goalAmount(metric: ExerciseGoal["metric"], value: number, t: (key: TranslationKey, vars?: Record<string, string | number>) => string, locale: string) {
  const n = metric === "minutes" ? Math.round((value / 60) * 10) / 10 : Math.round(value * 10) / 10;
  return t(`health.amount.${metric}` as TranslationKey, { n: n.toLocaleString(locale) });
}

export default function GoalBar({ goal }: { goal: ExerciseGoal }) {
  const { t, dateLocale } = useI18n();
  const share = Math.min(100, (goal.progress / goal.target) * 100);
  const reached = goal.progress >= goal.target;
  return (
    <div className="text-sm">
      <div className="flex justify-between gap-2">
        <span className="font-semibold">{goal.title}</span>
        <span className="shrink-0 text-muted">
          {reached ? t("health.goalReached") : `${goalAmount(goal.metric, goal.progress, t, dateLocale)} / ${goalAmount(goal.metric, goal.target, t, dateLocale)}`}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-base" role="progressbar" aria-label={goal.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share)}>
        <div className={`h-full rounded-full ${reached ? "bg-green-600" : "bg-accent"}`} style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}
