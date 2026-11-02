// "5 minutes ago", "2 days ago" in the family's language.
export function ago(iso: string | null, locale: string): string {
  if (!iso) return "–";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (minutes < 60) return rtf.format(-Math.max(minutes, 0), "minute");
  if (minutes < 48 * 60) return rtf.format(-Math.round(minutes / 60), "hour");
  return rtf.format(-Math.round(minutes / 1440), "day");
}
