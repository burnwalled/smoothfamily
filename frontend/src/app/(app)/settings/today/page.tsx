"use client";

// Family admin → Today cards: the weather place (SMHI), the waste collection calendar and each
// child's school on skolmaten.se. Only these are used – nothing about the family is sent anywhere.
import { useEffect, useState } from "react";
import { CircleCheck, LocateFixed } from "lucide-react";
import { api, TodaySources } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function TodayCardsSettingsPage() {
  const { t, dateLocale } = useI18n();
  const [sources, setSources] = useState<TodaySources | null>(null);
  const [waste, setWaste] = useState("");
  const [schools, setSchools] = useState<Record<string, string>>({});
  const [place, setPlace] = useState({ name: "", lat: "", lon: "" });
  const [rule, setRule] = useState({ title: "", date: "", weeks: "2", from: "", to: "" });
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .live<TodaySources>("/api/dashboard/sources", (s) => {
        setSources(s);
        setWaste(s.waste_ical_url ?? "");
        setPlace({ name: s.weather_place ?? "", lat: s.weather_lat?.toString() ?? "", lon: s.weather_lon?.toString() ?? "" });
        setSchools(Object.fromEntries(s.schools.map((m) => [m.user_id, m.school ? `https://skolmaten.se/${m.school}/` : ""])));
      })
      .catch(() => {});
  }, []);

  async function run(action: () => Promise<TodaySources>, done: string) {
    setError("");
    setSaved("");
    try {
      setSources(await action());
      setSaved(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  function locate() {
    setError("");
    if (!navigator.geolocation) return setError(t("weather.noLocation"));
    navigator.geolocation.getCurrentPosition(
      (pos) => setPlace((p) => ({ ...p, lat: pos.coords.latitude.toFixed(2), lon: pos.coords.longitude.toFixed(2) })),
      () => setError(t("weather.noLocation"))
    );
  }

  function saveWeather(clear = false) {
    const lat = clear ? null : Number(place.lat.replace(",", "."));
    const lon = clear ? null : Number(place.lon.replace(",", "."));
    if (!clear && (!Number.isFinite(lat) || !Number.isFinite(lon) || !place.lat || !place.lon)) return setError(t("weather.needPlace"));
    return run(() => api.put<TodaySources>("/api/dashboard/sources/weather", { lat, lon, place: place.name.trim() || null }), t("home.saved")).then(() => {
      if (clear) setPlace({ name: "", lat: "", lon: "" });
    });
  }

  const monthName = (m: number) => new Date(2026, m - 1, 1).toLocaleDateString(dateLocale, { month: "short" });

  function seasonMonths(): number[] {
    if (!rule.from || !rule.to) return [];
    const from = Number(rule.from);
    const to = Number(rule.to);
    // A season can run over the new year (e.g. Nov–Mar).
    const months: number[] = [];
    for (let m = from; ; m = (m % 12) + 1) {
      months.push(m);
      if (m === to || months.length === 12) break;
    }
    return months;
  }

  function addRule() {
    if (!rule.title.trim() || !rule.date) return setError(t("cards.scheduleNeed"));
    return run(
      () =>
        api.post<TodaySources>("/api/dashboard/sources/waste-schedules", {
          title: rule.title.trim(),
          anchor_date: rule.date,
          interval_weeks: Number(rule.weeks),
          months: seasonMonths(),
        }),
      t("home.saved")
    ).then(() => setRule({ title: "", date: "", weeks: rule.weeks, from: "", to: "" }));
  }

  function season(months: number[]): string {
    if (!months.length) return t("cards.allYear");
    return `${monthName(months[0])}–${monthName(months[months.length - 1])}`;
  }

  if (!sources) return <p className="text-sm text-muted">{t("common.loading")}</p>;

  return (
    <>
      <section className="card mb-4 p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("weather.title")}</h2>
        <p className="mb-3 text-xs text-muted">{t("weather.help")}</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-40 flex-1 text-xs text-muted">
            {t("weather.place")}
            <input className="input mt-1 w-full" value={place.name} onChange={(e) => setPlace({ ...place, name: e.target.value })} placeholder={t("weather.placePh")} />
          </label>
          <label className="w-24 text-xs text-muted">
            {t("weather.lat")}
            <input className="input mt-1 w-full" inputMode="decimal" value={place.lat} onChange={(e) => setPlace({ ...place, lat: e.target.value })} placeholder="59.33" />
          </label>
          <label className="w-24 text-xs text-muted">
            {t("weather.lon")}
            <input className="input mt-1 w-full" inputMode="decimal" value={place.lon} onChange={(e) => setPlace({ ...place, lon: e.target.value })} placeholder="18.06" />
          </label>
          <button className="btn-ghost flex shrink-0 items-center gap-1.5 border border-edge" onClick={locate}>
            <LocateFixed className="h-4 w-4" strokeWidth={2} aria-hidden />
            {t("weather.locate")}
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn-primary" onClick={() => saveWeather()}>{t("profile.save")}</button>
          {sources.weather_lat !== null && (
            <button className="btn-ghost" onClick={() => saveWeather(true)}>{t("weather.remove")}</button>
          )}
        </div>
      </section>

      <section className="card mb-4 p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("electricity.title")}</h2>
        <p className="mb-3 text-xs text-muted">{t("electricity.help")}</p>
        <select
          className="input w-auto"
          value={sources.electricity_area ?? ""}
          onChange={(e) => run(() => api.put<TodaySources>("/api/dashboard/sources/electricity", { area: e.target.value || null }), t("home.saved"))}
          aria-label={t("electricity.area")}
        >
          <option value="">{t("electricity.off")}</option>
          {["SE1", "SE2", "SE3", "SE4"].map((a) => <option key={a} value={a}>{t(`electricity.areas.${a}` as "electricity.areas.SE1")}</option>)}
        </select>
      </section>

      <section className="card p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("cards.wasteTitle")}</h2>
        <p className="mb-3 text-xs text-muted">{t("cards.wasteHelp")}</p>
        <div className="flex gap-2">
          <input className="input flex-1" type="url" placeholder="https://… .ics" value={waste} onChange={(e) => setWaste(e.target.value)} aria-label={t("cards.wasteTitle")} />
          <button
            className="btn-primary shrink-0"
            onClick={() => run(() => api.put<TodaySources>("/api/dashboard/sources/waste", { url: waste.trim() || null }), t("home.saved"))}
          >
            {t("profile.save")}
          </button>
        </div>

        <h3 className="mb-1 mt-5 text-xs font-bold uppercase tracking-wide text-muted">{t("cards.scheduleTitle")}</h3>
        <p className="mb-1 text-xs text-muted">{t("cards.scheduleHelp")}</p>
        <p className="mb-3 text-xs text-muted">
          {t("cards.scheduleStockholm")}{" "}
          <a
            className="font-semibold text-accent hover:underline"
            href="https://www.stockholmvattenochavfall.se/villa-och-radhus/avfallstjanster/nar-kommer-sopbilen/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("cards.scheduleStockholmLink")} ↗
          </a>
        </p>
        {sources.waste_schedules.length > 0 && (
          <ul className="mb-3 divide-y divide-edge rounded-lg border border-edge">
            {sources.waste_schedules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="font-semibold">{r.title}</span>
                <span className="text-muted">
                  {r.interval_weeks === 1 ? t("cards.everyWeek") : t("cards.everyNWeeks", { n: r.interval_weeks })} · {season(r.months)}
                </span>
                {r.next_date && (
                  <span className="text-xs text-muted">
                    {t("cards.nextPickup", { date: new Date(`${r.next_date}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "short", day: "numeric", month: "short" }) })}
                  </span>
                )}
                <button
                  className="ml-auto text-xs text-red-700 hover:underline"
                  onClick={() => run(() => api.del(`/api/dashboard/sources/waste-schedules/${r.id}`) as unknown as Promise<TodaySources>, t("home.saved"))}
                >
                  {t("common.remove")}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-40 flex-1 text-xs text-muted">
            {t("cards.scheduleName")}
            <input className="input mt-1 w-full" value={rule.title} maxLength={120} onChange={(e) => setRule({ ...rule, title: e.target.value })} placeholder={t("cards.scheduleNamePh")} />
          </label>
          <label className="text-xs text-muted">
            {t("cards.scheduleDate")}
            <input className="input mt-1" type="date" value={rule.date} onChange={(e) => setRule({ ...rule, date: e.target.value })} />
          </label>
          <label className="text-xs text-muted">
            {t("cards.scheduleEvery")}
            <select className="input mt-1" value={rule.weeks} onChange={(e) => setRule({ ...rule, weeks: e.target.value })}>
              {[1, 2, 3, 4, 6, 8, 12].map((n) => (
                <option key={n} value={n}>{n === 1 ? t("cards.everyWeek") : t("cards.everyNWeeks", { n })}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            {t("cards.scheduleFrom")}
            <select className="input mt-1" value={rule.from} onChange={(e) => setRule({ ...rule, from: e.target.value, to: rule.to || e.target.value })}>
              <option value="">{t("cards.allYear")}</option>
              {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthName(i + 1)}</option>)}
            </select>
          </label>
          {rule.from && (
            <label className="text-xs text-muted">
              {t("cards.scheduleTo")}
              <select className="input mt-1" value={rule.to} onChange={(e) => setRule({ ...rule, to: e.target.value })}>
                {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthName(i + 1)}</option>)}
              </select>
            </label>
          )}
          <button className="btn-ghost shrink-0 border border-edge" onClick={addRule}>{t("cards.scheduleAdd")}</button>
        </div>
      </section>

      <section className="card mt-4 p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("cards.lunchTitle")}</h2>
        <p className="mb-3 text-xs text-muted">{t("cards.lunchHelp")}</p>
        <ul className="space-y-2">
          {sources.schools
            .filter((m) => m.role === "child" || m.school)
            .map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center gap-2">
                <span className="w-28 shrink-0 text-sm font-semibold">{m.name}</span>
                <input
                  className="input min-w-48 flex-1"
                  placeholder="https://skolmaten.se/…"
                  value={schools[m.user_id] ?? ""}
                  onChange={(e) => setSchools({ ...schools, [m.user_id]: e.target.value })}
                  aria-label={t("cards.schoolFor", { name: m.name })}
                />
                <button
                  className="btn-ghost shrink-0 border border-edge"
                  onClick={() =>
                    run(
                      () => api.put<TodaySources>(`/api/dashboard/sources/school/${m.user_id}`, { school: schools[m.user_id]?.trim() || null }),
                      t("home.saved")
                    )
                  }
                >
                  {t("profile.save")}
                </button>
              </li>
            ))}
        </ul>
      </section>

      {saved && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-green-700">
          <CircleCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
          {saved}
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </>
  );
}
