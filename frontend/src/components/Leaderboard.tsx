"use client";

import { LeaderboardEntry } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Crown, Flame, Star } from "lucide-react";
import { getIsoWeek } from "@/lib/week";

export default function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  const { t } = useI18n();
  if (entries.length === 0) return null;
  const max = Math.max(1, ...entries.map((e) => e.points_week));
  return (
    <>
      {/* The week runs Monday–Sunday; say so, or Monday looks like "today only". */}
      <p className="mb-3 text-xs text-muted">{t("leaderboard.weekCaption", { week: getIsoWeek(new Date()) })}</p>
      <ol className="space-y-3">
        {entries.map((entry, index) => (
          <li key={entry.user_id}>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center font-semibold">
                {index === 0 && entry.points_week > 0 && (
                  <Crown className="mr-1.5 h-4 w-4 text-accent" strokeWidth={2} aria-hidden />
                )}
                {entry.display_name}
                {entry.streak_days > 1 && (
                  <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-accent font-bold">
                    <Flame className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    {t("leaderboard.streak", { days: entry.streak_days })}
                  </span>
                )}
              </span>
              <span className="inline-flex items-center gap-1 font-bold text-ink">
                <span className="mr-1 text-xs font-normal text-muted">{t("leaderboard.total", { points: entry.points_total })}</span>
                {entry.points_week}
                <Star className="h-3.5 w-3.5 fill-accent text-accent" strokeWidth={2} aria-hidden />
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-edge">
              <div
                className="h-2 rounded-full"
                style={{ width: `${(entry.points_week / max) * 100}%`, background: entry.color }}
              />
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
