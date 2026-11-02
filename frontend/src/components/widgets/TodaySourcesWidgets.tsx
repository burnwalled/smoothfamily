"use client";

// Today cards from public sources: the next waste collections (the family's iCal calendar),
// this week's school lunch per child (skolmaten.se) and the weather (SMHI). Set up under Family
// admin → Today cards.
import { useState } from "react";
import Link from "next/link";
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, LucideIcon, Sun } from "lucide-react";
import { Electricity, SchoolLunch, WastePickup, Weather, WeatherKind } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";
import { toLocalDateKey } from "@/lib/dateKey";
import { useMe } from "@/components/Shell";

function useDayLabel() {
  const { t, dateLocale } = useI18n();
  const today = toLocalDateKey(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = toLocalDateKey(tomorrowDate);
  return (iso: string) =>
    iso === today
      ? t("notifications.today")
      : iso === tomorrow
        ? t("birthdays.tomorrow")
        : new Date(`${iso}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "short" });
}

function SetUpHint({ text }: { text: string }) {
  const { t } = useI18n();
  const isAdmin = useMe().role === "admin";
  return (
    <p className="text-sm text-muted">
      {text}{" "}
      {isAdmin && (
        <Link href="/settings/today" className="font-semibold text-accent hover:underline">
          {t("cards.setUp")} →
        </Link>
      )}
    </p>
  );
}

export function WasteWidget() {
  const { t } = useI18n();
  const label = useDayLabel();
  const waste = useApi<WastePickup[]>("/api/dashboard/waste");
  const rows = waste.data ?? null;

  if (waste.isError && !rows) return <p className="text-sm text-muted">{t("cards.wasteError")}</p>;
  if (rows === null) return <p className="text-sm text-muted">{t("common.loading")}</p>;
  if (rows.length === 0) return <SetUpHint text={t("cards.wasteEmpty")} />;
  const today = toLocalDateKey(new Date());
  return (
    <ul className="space-y-1.5">
      {rows.slice(0, 5).map((row, i) => {
        const soon = i === 0 && (row.date === today || label(row.date) === t("birthdays.tomorrow"));
        return (
          <li key={`${row.date}-${row.title}`} className={`flex justify-between gap-2 text-sm ${soon ? "font-semibold text-accent" : ""}`}>
            <span className="first-letter:uppercase">{label(row.date)}</span>
            <span className="text-right">{row.title}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function SchoolLunchWidget() {
  const { t } = useI18n();
  const label = useDayLabel();
  const lunch = useApi<SchoolLunch[]>("/api/dashboard/school-lunch");
  const rows = lunch.data ?? (lunch.isError ? NONE : null);

  if (rows === null) return <p className="text-sm text-muted">{t("common.loading")}</p>;
  if (rows.length === 0) return <SetUpHint text={t("cards.lunchEmpty")} />;
  const today = toLocalDateKey(new Date());
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        // Today's lunch, or the next school day's (after school, at weekends).
        const next = row.days.find((d) => d.date >= today);
        return (
          <div key={row.user_id}>
            {rows.length > 1 && <p className="text-xs font-semibold uppercase tracking-wide text-muted">{row.name} · {row.school_name}</p>}
            {row.error ? (
              <p className="text-sm text-muted">{t("cards.lunchError")}</p>
            ) : !next ? (
              <p className="text-sm text-muted">{t("cards.lunchNone")}</p>
            ) : (
              <>
                <p className="text-xs text-muted first-letter:uppercase">{label(next.date)}</p>
                <ul className="text-sm">
                  {next.dishes.map((dish) => <li key={dish}>{dish}</li>)}
                </ul>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

const WEATHER_ICONS: Record<WeatherKind, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  rain: CloudRain,
  thunder: CloudLightning,
  sleet: CloudDrizzle,
  snow: CloudSnow,
};

export function WeatherIcon({ kind, className }: { kind: WeatherKind; className: string }) {
  const { t } = useI18n();
  const Icon = WEATHER_ICONS[kind] ?? Cloud;
  return <Icon className={className} strokeWidth={1.75} aria-label={t(`weather.kind.${kind}` as TranslationKey)} />;
}

const deg = (value: number | null | undefined) => (value === null || value === undefined ? "–" : `${Math.round(value)}°`);

export function WeatherWidget() {
  const { t, dateLocale } = useI18n();
  const weather = useApi<Weather | null>("/api/dashboard/weather");
  const info = weather.data;

  if (weather.isError && info === undefined) return <p className="text-sm text-muted">{t("weather.error")}</p>;
  if (info === undefined) return <p className="text-sm text-muted">{t("common.loading")}</p>;
  if (info === null) return <SetUpHint text={t("weather.empty")} />;
  const today = info.today;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {info.now && <WeatherIcon kind={info.now.kind} className="h-10 w-10 shrink-0 text-accent" />}
        <div className="min-w-0">
          <p className="text-2xl font-extrabold leading-none">{deg(info.now?.temp)}</p>
          <p className="mt-1 text-xs text-muted">
            {info.place ? `${info.place} · ` : ""}
            {today.min !== null && `${deg(today.min)} / ${deg(today.max)}`}
          </p>
        </div>
        <p className={`ml-auto text-right text-sm ${today.wet_from ? "font-semibold text-accent" : "text-muted"}`}>
          {today.wet_from ? t(`weather.wetFrom.${today.kind === "snow" || today.kind === "sleet" ? today.kind : "rain"}` as TranslationKey, { time: today.wet_from }) : t(`weather.kind.${today.kind}` as TranslationKey)}
        </p>
      </div>
      <ul className="-mx-1 flex gap-1 overflow-x-auto pb-1" aria-label={t("weather.hours")}>
        {info.hours.map((hour) => (
          <li key={hour.time} className="flex w-11 shrink-0 flex-col items-center gap-0.5 rounded-md py-1 text-xs">
            <span className="text-muted">{hour.time.slice(0, 2)}</span>
            <WeatherIcon kind={hour.kind} className="h-4 w-4" />
            <span className="font-semibold">{deg(hour.temp)}</span>
          </li>
        ))}
      </ul>
      {info.days.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 border-t border-edge pt-2 text-xs">
          {info.days.map((day) => (
            <li key={day.date} className="flex items-center gap-1.5">
              <WeatherIcon kind={day.kind} className="h-4 w-4 shrink-0 text-muted" />
              <span className="capitalize">{new Date(`${day.date}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "short" })}</span>
              <span className="ml-auto font-semibold">{deg(day.min)}/{deg(day.max)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-muted">{t("weather.source")}</p>
    </div>
  );
}

export function ElectricityWidget() {
  const { t, dateLocale } = useI18n();
  const electricity = useApi<Electricity | null>("/api/dashboard/electricity");
  const info = electricity.data;
  const [day, setDay] = useState<"today" | "tomorrow">("today");

  if (electricity.isError && info === undefined) return <p className="text-sm text-muted">{t("electricity.error")}</p>;
  if (info === undefined) return <p className="text-sm text-muted">{t("common.loading")}</p>;
  if (info === null) return <SetUpHint text={t("electricity.empty")} />;
  const hours = day === "today" ? info.today : info.tomorrow ?? [];
  const max = Math.max(1, ...hours.map((h) => h.ore));
  const cheap = new Set([...hours].sort((a, b) => a.ore - b.ore).slice(0, 3).map((h) => h.start));
  const now = Date.now();
  const time = (iso: string) => new Date(iso).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-2xl font-extrabold leading-none">{info.now !== null ? `${Math.round(info.now)} ${t("electricity.unit")}` : "–"}</p>
          <p className="mt-1 text-xs text-muted">{t("electricity.now", { area: info.area })}</p>
        </div>
        {info.cheapest_ahead.length > 0 && (
          <p className="text-right text-sm">
            <span className="block text-xs text-muted">{t("electricity.cheapestAhead")}</span>
            <span className="font-semibold text-green-700">{info.cheapest_ahead.map(time).join(", ")}</span>
          </p>
        )}
      </div>
      {info.tomorrow && (
        <div className="inline-flex rounded-lg border border-edge p-0.5 text-xs">
          {(["today", "tomorrow"] as const).map((d) => (
            <button key={d} className={`rounded px-2 py-0.5 ${day === d ? "bg-base font-semibold" : "text-muted"}`} onClick={() => setDay(d)}>
              {d === "today" ? t("notifications.today") : t("birthdays.tomorrow")}
            </button>
          ))}
        </div>
      )}
      <div className="flex h-20 items-end gap-px" role="img" aria-label={t("electricity.chart")}>
        {hours.map((h) => {
          const start = new Date(h.start).getTime();
          const current = start <= now && now < start + 3600_000;
          return (
            <span
              key={h.start}
              title={`${time(h.start)} · ${Math.round(h.ore)} ${t("electricity.unit")}`}
              className={`flex-1 rounded-t-sm ${cheap.has(h.start) ? "bg-green-500" : current ? "bg-accent" : "bg-edge"}`}
              style={{ height: `${Math.max(4, (h.ore / max) * 100)}%` }}
            />
          );
        })}
      </div>
      <p className="text-[10px] text-muted">{t("electricity.source")}</p>
    </div>
  );
}
