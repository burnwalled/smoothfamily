"use client";

// Notification centre: everything that was (or would have been) pushed, grouped by day, with a
// link to where it happened. Read state is shared between the member's devices.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, BadgeCheck, CalendarClock, CheckCheck, Lightbulb, MessageCircle, Trophy } from "lucide-react";
import { api, AppNotification } from "@/lib/api";
import { useApi } from "@/lib/query";
import { useI18n } from "@/lib/i18n";
import { toLocalDateKey } from "@/lib/dateKey";

const ICONS: Record<string, typeof Bell> = {
  approval_pending: BadgeCheck,
  approval_reviewed: BadgeCheck,
  task_suggestion: Lightbulb,
  suggestion_reviewed: Lightbulb,
  calendar_reminder: CalendarClock,
  reward_unlocked: Trophy,
  chat: MessageCircle,
};

export default function NotificationsPage() {
  const { t, dateLocale } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: rows, isPending } = useApi<AppNotification[]>("/api/notifications");
  const unread = (rows ?? []).filter((n) => !n.read_at);

  async function markRead(ids: string[] | null) {
    const now = new Date().toISOString();
    queryClient.setQueryData<AppNotification[]>(["api", "notifications", "/api/notifications"], (prev) =>
      prev?.map((n) => (ids === null || ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n))
    );
    await api.post("/api/notifications/read", { ids }).catch(() => {});
  }

  async function open(n: AppNotification) {
    if (!n.read_at) await markRead([n.id]);
    if (n.route) router.push(n.route);
  }

  const todayKey = toLocalDateKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = toLocalDateKey(yesterday);
  const dayLabel = (iso: string) => {
    const key = toLocalDateKey(new Date(iso));
    if (key === todayKey) return t("notifications.today");
    if (key === yesterdayKey) return t("notifications.yesterday");
    return new Date(iso).toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "long" });
  };
  const days: { label: string; items: AppNotification[] }[] = [];
  for (const n of rows ?? []) {
    const label = dayLabel(n.created_at);
    if (days.at(-1)?.label !== label) days.push({ label, items: [] });
    days.at(-1)!.items.push(n);
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex min-h-10 items-center gap-2 text-2xl font-extrabold tracking-tight">
          <Bell className="h-6 w-6 text-accent" strokeWidth={2} aria-hidden />
          {t("notifications.title")}
        </h1>
        {unread.length > 0 && (
          <button className="btn-ghost text-sm" onClick={() => markRead(null)}>
            <CheckCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
            {t("notifications.markAllRead")}
          </button>
        )}
      </div>

      {isPending ? (
        <p className="mt-6 text-sm text-muted">{t("common.loading")}</p>
      ) : days.length === 0 ? (
        <p className="mt-6 text-sm text-muted">{t("notifications.empty")}</p>
      ) : (
        days.map((day) => (
          <section key={day.label} className="mt-6">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted first-letter:uppercase">{day.label}</h2>
            <ul className="card divide-y divide-edge overflow-hidden">
              {day.items.map((n) => {
                const Icon = ICONS[n.kind] ?? Bell;
                return (
                  <li key={n.id}>
                    <button
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-base ${n.read_at ? "" : "bg-accent-soft/40"}`}
                      onClick={() => open(n)}
                    >
                      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${n.read_at ? "text-muted" : "text-accent"}`} strokeWidth={1.75} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm ${n.read_at ? "" : "font-semibold"}`}>{n.title}</span>
                        {n.body && <span className="block text-sm text-muted">{n.body}</span>}
                      </span>
                      <span className="shrink-0 text-xs text-muted">
                        {new Date(n.created_at).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {!n.read_at && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-label={t("notifications.unread")} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <p className="mt-6 text-xs text-muted">
        {t("notifications.footer", { days: 60 })}{" "}
        <Link href="/profile" className="font-semibold text-accent hover:underline">
          {t("notifications.pushSettings")} →
        </Link>
      </p>
    </>
  );
}
