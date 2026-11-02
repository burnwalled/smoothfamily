"use client";

import FamilyGoals from "@/components/FamilyGoals";
import { api, Achievement, AchievementsResponse, LevelInfo } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useApi } from "@/lib/query";
import { CircleCheck, Flame, LucideIcon, Medal, Shapes, Star, Sunrise, Trophy } from "lucide-react";
import PageTitle from "@/components/PageTitle";

const TIER_COLORS: Record<string, string> = {
  bronze: "#B0793F",
  silver: "#9CA3AF",
  gold: "#E0B33D",
};

function LevelBar({ level }: { level: LevelInfo }) {
  const { t } = useI18n();
  const pct = Math.min(100, Math.round((level.points_in_level / level.points_to_next) * 100));

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
          {t("achievements.level", { n: level.level })}
        </h2>
        <span className="text-xs text-muted">
          {t("achievements.levelProgress", {
            current: level.points_in_level,
            total: level.points_to_next,
            next: level.level + 1,
          })}
        </span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-edge overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: "#E0B33D" }}
        />
      </div>
    </div>
  );
}

// Icon per achievement family, keyed by id prefix (the backend's emoji
// "icon" field is kept for API compatibility but no longer rendered).
const FAMILY_ICONS: [string, LucideIcon][] = [
  ["first_task", CircleCheck],
  ["task_", CircleCheck],
  ["streak_", Flame],
  ["points_", Star],
  ["early_bird_", Sunrise],
  ["week_win_", Trophy],
  ["variety_", Shapes],
];

function AchievementIcon({ id, color }: { id: string; color: string }) {
  const Icon = FAMILY_ICONS.find(([prefix]) => id.startsWith(prefix))?.[1] ?? Medal;
  return (
    <span
      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
      style={{ backgroundColor: `${color}26`, color }}
    >
      <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
    </span>
  );
}

function BadgeCard({ ach }: { ach: Achievement }) {
  const { t } = useI18n();
  const isUnlocked = ach.unlocked_at !== null;
  const tierColor = TIER_COLORS[ach.tier];
  const nameKey = `achievements.${ach.id}.name` as Parameters<typeof t>[0];
  const descKey = `achievements.${ach.id}.desc` as Parameters<typeof t>[0];
  const pct = Math.min(100, Math.round((ach.progress.current / ach.progress.target) * 100));

  return (
    <div
      className={`card p-4 flex flex-col gap-2 transition-opacity ${isUnlocked ? "" : "opacity-50 grayscale"}`}
      style={isUnlocked ? { borderColor: tierColor, borderWidth: 2 } : {}}
    >
      <div className="flex items-center gap-2">
        <AchievementIcon id={ach.id} color={tierColor} />
        <div className="min-w-0">
          <div className="text-sm font-bold leading-tight">{t(nameKey)}</div>
          <div className="text-xs text-muted capitalize" style={isUnlocked ? { color: tierColor } : {}}>
            {t(`achievements.${ach.tier}` as Parameters<typeof t>[0])}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted leading-snug">{t(descKey)}</p>

      {isUnlocked ? (
        <div className="text-xs font-medium" style={{ color: tierColor }}>
          {t("achievements.unlocked", {
            date: new Date(ach.unlocked_at!).toLocaleDateString(),
          })}
        </div>
      ) : (
        <div>
          <div className="flex justify-between text-xs text-muted mb-1">
            <span>{t("achievements.progress", { current: ach.progress.current, target: ach.progress.target })}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-edge overflow-hidden">
            <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function AchievementsPage() {
  const { t } = useI18n();
  const data = useApi<AchievementsResponse>("/api/achievements").data ?? null;

  if (!data) {
    return (
      <>
        <p className="text-sm text-muted">{t("common.loading")}</p>
      </>
    );
  }

  const groups: Record<string, Achievement[]> = { bronze: [], silver: [], gold: [] };
  for (const ach of data.achievements) {
    groups[ach.tier].push(ach);
  }

  return (
    <>
      <PageTitle title={t("achievements.title")} className="mb-6" />
      <section className="card mb-4 p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("goals.title")}</h2>
        <FamilyGoals />
      </section>
      <LevelBar level={data.level} />

      {(["gold", "silver", "bronze"] as const).map((tier) => (
        <section key={tier} className="mt-6">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted flex items-center gap-2">
            <Medal className="h-4 w-4" style={{ color: TIER_COLORS[tier] }} strokeWidth={2} aria-hidden />
            {t(`achievements.${tier}` as Parameters<typeof t>[0])}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups[tier].map((ach) => (
              <BadgeCard key={ach.id} ach={ach} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
