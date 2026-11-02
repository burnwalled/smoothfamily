// How vehicle numbers are shown: money, the meter (km or hours), dates and consumption.
import { useI18n } from "@/lib/i18n";
import type { Meter } from "@/lib/vehicleKinds";

export function useFormat(currency: string, meter: Meter | string = "km") {
  const { t, dateLocale, locale } = useI18n();
  const money = (value: number) => `${Math.round(value).toLocaleString(dateLocale)} ${currency}`;
  const unit = meter === "hours" ? "h" : "km";
  const reading = (value: number) => `${value.toLocaleString(dateLocale)} ${unit}`;
  const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" });
  // Swedes and Norwegians count consumption per "mil" (10 km); others per 100 km; engines per hour.
  const perMil = locale === "sv" || locale === "nb";
  const consumption = (per100: number, what: string) =>
    meter === "hours"
      ? t("vehicles.perHour", { value: (per100 / 100).toLocaleString(dateLocale, { maximumFractionDigits: 2 }), unit: what })
      : perMil
        ? t("vehicles.perMil", { value: (per100 / 10).toLocaleString(dateLocale, { maximumFractionDigits: 2 }), unit: what })
        : t("vehicles.per100", { value: per100.toLocaleString(dateLocale, { maximumFractionDigits: 1 }), unit: what });
  return { money, reading, day, consumption, unit };
}
