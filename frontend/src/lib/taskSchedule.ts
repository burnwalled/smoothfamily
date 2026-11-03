// Human-readable task schedules ("Every other week · Mon, Thu").
import { Task } from "@/lib/api";
import { TranslationKey } from "@/lib/i18n";

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export function weekdayNames(dateLocale: string, style: "long" | "short" = "long"): string[] {
  // Monday first (2024-01-01 is a Monday).
  return Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(dateLocale, { weekday: style, timeZone: "UTC" })
  );
}

export function monthNames(dateLocale: string): string[] {
  return Array.from({ length: 12 }, (_, i) =>
    new Date(Date.UTC(2024, i, 1)).toLocaleDateString(dateLocale, { month: "long", timeZone: "UTC" })
  );
}

export function taskWeekdays(task: Pick<Task, "weekdays" | "weekday">): number[] {
  if (task.weekdays && task.weekdays.length > 0) return task.weekdays;
  return task.weekday != null ? [task.weekday] : [];
}

export function scheduleLabel(task: Task, t: T, dateLocale: string): string {
  switch (task.recurrence) {
    case "daily":
      return (task.interval_days ?? 1) > 1 ? t(task.interval_days === 2 ? "tasks.everyOtherDay" : "tasks.everyNDays", { n: task.interval_days }) : t("tasks.daily");
    case "weekly": {
      const names = weekdayNames(dateLocale, "short");
      const days = taskWeekdays(task).map((d) => names[d]).join(", ");
      const every = task.interval_weeks > 1 ? t("tasks.everyNWeeks", { n: task.interval_weeks }) : t("tasks.weekly");
      return days ? `${every} · ${days}` : every;
    }
    case "monthly": {
      const every = (task.interval_months ?? 1) > 1 ? t("tasks.everyNMonths", { n: task.interval_months }) : t("tasks.monthly");
      if (task.month_nth) {
        const day = weekdayNames(dateLocale)[taskWeekdays(task)[0] ?? 0];
        return `${every} · ${t(`tasks.nth.${task.month_nth}` as TranslationKey)} ${day}`;
      }
      return `${every} · ${t("tasks.onDay", { n: task.day_of_month ?? 1 })}`;
    }
    case "yearly":
      return `${t("tasks.yearly")} · ${task.day_of_month} ${monthNames(dateLocale)[(task.month ?? 1) - 1]}`;
    default:
      return `${t("tasks.once")}${task.due_date ? ` · ${task.due_date}` : ""}`;
  }
}
