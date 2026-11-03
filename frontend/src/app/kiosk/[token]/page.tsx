"use client";

// The kitchen display (#50): the family's day on a tablet on the wall, signed in with the screen's
// own link. Refreshes every minute, keeps the screen awake, dims at night, and shows what it saw
// last if the network drops. Shared flow buttons can be pressed; nothing private is shown.
// 3.0.3: full screen, the day's dinner, tasks ticked off by whoever did them (several for a task
// done together), and a screensaver with a theme chosen per screen.
// 3.0.4: the screen's own theme and language, the week's meals and the recipe book in the cooking
// mode, the smart home devices chosen for it, and tasks made for fingers.
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Barcode, CalendarDays, Car, CheckCircle2, ChefHat, Circle, HeartPulse, House, Lightbulb, Maximize2, Minimize2, Repeat, Siren, Soup, Star, Trash2, Users, UtensilsCrossed, WifiOff, X, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, EmergencyCards, KIOSK_WIDGETS, KioskView, KioskWidget, Member, request } from "@/lib/api";
import { apiKey, shouldRetry } from "@/lib/queryClient";
import { Locale, useI18n } from "@/lib/i18n";
import { NONE, refreshApi, useApi } from "@/lib/query";
import { isTheme, useTheme } from "@/lib/theme";
import { LATEST_VERSION } from "@/lib/releaseNotes";
import CookingView from "@/components/CookingView";
import KioskDevices from "@/components/kiosk/KioskDevices";
import KioskRecipes from "@/components/kiosk/KioskRecipes";
import EmergencyCardView from "@/components/EmergencyCardView";
import { EventPlanBadges } from "@/components/EventPlanPanel";
import { WeatherIcon } from "@/components/widgets/TodaySourcesWidgets";
import { toLocalDateKey } from "@/lib/dateKey";
import ScanSession, { ScanBackend } from "@/components/BarcodeScan";
import EasyHome from "@/components/easy/EasyHome";
import GoalBar from "@/components/health/GoalBar";
import { EasyBackend, EasyDay } from "@/lib/easy";
import Screensaver from "@/components/kiosk/Screensaver";
import WhoDidIt from "@/components/tasks/WhoDidIt";

async function kioskCall<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!resp.ok) throw new Error((await resp.json().catch(() => null))?.detail ?? String(resp.status));
  return (resp.status === 204 ? undefined : await resp.json()) as T;
}

function Card({ title, icon: Icon, children, className = "", tone = "bg-accent/10 text-accent" }: { title: string; icon: typeof House; children: React.ReactNode; className?: string; tone?: string }) {
  return (
    <section className={`rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-edge/60 ${className}`}>
      <h2 className="mb-4 flex items-center gap-2.5 text-sm font-bold uppercase tracking-wide text-muted">
        <span className={`grid h-8 w-8 place-items-center rounded-xl ${tone}`}>
          <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function KioskPage() {
  const { token } = useParams<{ token: string }>();
  const { t, dateLocale, locale, setLocale } = useI18n();
  // The screen from the cache, kept on the device: without a connection it shows what it had, and it
  // is read again every minute. A link that is gone (404) is not kept.
  const viewPath = `/api/kiosk/${token}`;
  const viewQuery = useQuery<KioskView, Error, KioskView, readonly string[]>({
    queryKey: apiKey(viewPath),
    // The screen tells its app version (3.1.0), for the family's overview of devices.
    queryFn: () => request<KioskView>(viewPath, { cache: "no-store", headers: { "X-SF-App": LATEST_VERSION } }),
    refetchInterval: 60_000,
    retry: shouldRetry,
  });
  const invalid = viewQuery.error instanceof ApiError && viewQuery.error.status === 404;
  const view = invalid ? null : (viewQuery.data ?? null);
  const offline = viewQuery.isError && !invalid;
  const [now, setNow] = useState(() => new Date());
  const [emergency, setEmergency] = useState<EmergencyCards | null>(null);
  const [pressed, setPressed] = useState<string | null>(null);
  const [saver, setSaver] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [doing, setDoing] = useState<KioskView["tasks"][number] | null>(null);
  const [full, setFull] = useState(false);
  // The cooking mode: a dinner of the week or a recipe from the book.
  const [cooking, setCooking] = useState<{ name: string; servings: number; ingredients: { name: string; amount: number | null; unit: string | null }[]; steps: string[] } | null>(null);
  const { theme, setTheme } = useTheme();
  const [canFull, setCanFull] = useState(false);
  // The little ones' mode: their faces; tapped, their routines.
  const easyAllowed = view?.easy_mode === true;
  const little = useApi<{ id: string; name: string; color: string }[]>(easyAllowed ? `/api/kiosk/${token}/easy` : null, { refetchInterval: 60_000 }).data ?? NONE;
  const [littleOpen, setLittleOpen] = useState<string | null>(null);
  const littleBackend = useMemo<EasyBackend | null>(() => {
    if (!littleOpen) return null;
    const base = `/api/kiosk/${token}/easy/${littleOpen}`;
    return {
      load: () => kioskCall<EasyDay>(base),
      step: (id, undo) => kioskCall<EasyDay>(`${base}/steps/${id}/done`, { method: undo ? "DELETE" : "POST" }),
      task: (id) => kioskCall<EasyDay>(`${base}/tasks/${id}/done`, { method: "POST" }),
    };
  }, [token, littleOpen]);
  const scanBackend = useMemo<ScanBackend>(
    () => ({
      lookup: (code) => kioskCall(`/api/kiosk/${token}/pantry/barcode/${encodeURIComponent(code)}`),
      save: (body) => kioskCall(`/api/kiosk/${token}/pantry/scan`, { method: "POST", body: JSON.stringify(body) }),
      remove: (id) => kioskCall(`/api/kiosk/${token}/pantry/${id}`, { method: "DELETE" }),
    }),
    [token],
  );

  useEffect(() => {
    // Every second: the flip clock turns on the minute, not up to a quarter later.
    const clock = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(clock);
  }, []);

  // The screen speaks its own language (or the family admin's), and wears its own theme.
  useEffect(() => {
    if (view?.language && view.language !== locale) setLocale(view.language as Locale);
  }, [view?.language, locale, setLocale]);
  useEffect(() => {
    if (!view) return;
    const wanted = isTheme(view.theme) ? view.theme : "forest";
    if (wanted !== theme) setTheme(wanted);
  }, [view, theme, setTheme]);

  // Keep the tablet awake (where the browser allows it); ask again when it comes back into view.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
    const ask = () => nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    ask();
    const onVisible = () => document.visibilityState === "visible" && ask();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, []);

  // A wall screen has no scrollbar to keep room for (the app does): the screensaver fills it all.
  useEffect(() => {
    const html = document.documentElement;
    html.style.scrollbarGutter = "auto";
    return () => {
      html.style.scrollbarGutter = "";
    };
  }, []);

  // Full screen: a button while the browser allows it (an iPad's Safari doesn't – there, adding
  // the screen to the home screen gives full screen instead).
  useEffect(() => {
    setCanFull(!!document.fullscreenEnabled);
    const onChange = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});

  // The photos, for the photo screensaver.
  const photosOn = view ? (view.widgets ?? KIOSK_WIDGETS).includes("slideshow") && view.screensaver === "photos" : false;
  const photos = useApi<{ id: string }[]>(photosOn ? `/api/kiosk/${token}/photos` : null).data;
  const slides = useMemo<string[]>(() => (photosOn && photos ? photos.map((r) => r.id) : NONE), [photosOn, photos]);

  // Untouched for the screen's minutes: the screensaver – not while something is open.
  const idleMs = (view?.idle_minutes ?? 5) * 60_000;
  const busy = scanning || !!littleOpen || !!emergency || !!doing || !!cooking;
  const last = useRef(Date.now());
  useEffect(() => {
    const touch = () => (last.current = Date.now());
    const events = ["pointerdown", "keydown", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const id = window.setInterval(() => {
      if (!busy && Date.now() - last.current >= idleMs) setSaver(true);
    }, 5_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      window.clearInterval(id);
    };
  }, [idleMs, busy]);
  const wake = () => {
    last.current = Date.now();
    setSaver(false);
  };

  async function press(id: string) {
    setPressed(id);
    await fetch(`/api/kiosk/${token}/flows/${id}/run`, { method: "POST" }).catch(() => {});
    window.setTimeout(() => setPressed(null), 2000);
  }

  async function undoTask(task: KioskView["tasks"][number]) {
    if (!task.id || !confirm(t("tasks.undoConfirm", { title: task.title }))) return;
    await kioskCall(`/api/kiosk/${token}/tasks/${task.id}/done`, { method: "DELETE" }).catch((e) => alert(e instanceof Error ? e.message : t("common.error")));
    await refreshApi(viewPath);
  }

  async function cook(url: string) {
    setCooking(await kioskCall<NonNullable<typeof cooking>>(url).catch(() => null));
  }

  async function openEmergency() {
    const resp = await fetch(`/api/kiosk/${token}/emergency`, { cache: "no-store" }).catch(() => null);
    if (resp?.ok) setEmergency(await resp.json());
  }

  // Dimmed at night, as set for this screen in the family's settings (22–06 unless changed).
  const hour = now.getHours();
  const from = view?.night_from ?? 22;
  const to = view?.night_to ?? 6;
  const night = view?.night_dim !== false && from !== to && (from < to ? hour >= from && hour < to : hour >= from || hour < to);

  if (invalid) {
    return (
      <div className="grid min-h-screen place-items-center bg-base p-6 text-center">
        <div>
          <h1 className="text-xl font-bold">{t("kiosk.invalidTitle")}</h1>
          <p className="mt-2 text-sm text-muted">{t("kiosk.invalidText")}</p>
        </div>
      </div>
    );
  }
  if (!view) return <div className="grid min-h-screen place-items-center bg-base text-muted">{t("common.loading")}</div>;

  const shows = (w: KioskWidget) => (view.widgets ?? KIOSK_WIDGETS).includes(w);
  const members: Member[] = view.members.map((m) => ({ id: m.id, username: "", display_name: m.name, role: "", color: m.color }));
  const todayKey = toLocalDateKey(now);
  const upcoming = view.events.filter((e) => new Date(e.end) > now);
  const todays = upcoming.filter((e) => toLocalDateKey(new Date(e.start)) <= todayKey);
  const tomorrows = upcoming.filter((e) => toLocalDateKey(new Date(e.start)) > todayKey);
  const time = (iso: string) => new Date(iso).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" });
  const meals = view.meals ?? [];
  const eventList = (events: typeof upcoming) => (
    <ul className="space-y-3">
      {events.map((e, i) => (
        <li key={`${e.key ?? e.title}-${i}`} className="flex items-start gap-3">
          <span className="mt-1 w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-muted">{e.all_day ? "" : time(e.start)}</span>
          <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: e.color }} />
          <div className="min-w-0">
            <p className="text-xl font-semibold leading-tight">{e.title}</p>
            <p className="text-sm text-muted">{e.all_day ? t("calendar.allDay") : `${time(e.start)}–${time(e.end)}`}{e.location ? ` · ${e.location}` : ""}</p>
            <EventPlanBadges event={e} members={members} />
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <div className={`min-h-screen bg-base p-4 transition-[filter] duration-1000 sm:p-6 ${night && !saver ? "brightness-[0.45]" : ""}`}>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-7xl font-extrabold leading-none tabular-nums tracking-tight">{now.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })}</p>
          <p className="mt-2 text-xl capitalize text-muted">{now.toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "long" })} · {view.family_name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {shows("weather") && view.weather?.now && (
            <div className="flex items-center gap-2 rounded-3xl bg-surface px-4 py-2 shadow-sm ring-1 ring-edge/60">
              <WeatherIcon kind={view.weather.now.kind} className="h-12 w-12 text-accent" />
              <div>
                <p className="text-4xl font-extrabold">{Math.round(view.weather.now.temp)}°</p>
                {view.weather.today.wet_from && <p className="text-sm font-semibold text-accent">{t("weather.wetFrom.rain", { time: view.weather.today.wet_from })}</p>}
              </div>
            </div>
          )}
          {view.pantry_scan && (
            <button className="flex items-center gap-2 rounded-2xl bg-accent px-4 py-3 text-lg font-bold text-white" onClick={() => setScanning(true)}>
              <Barcode className="h-6 w-6" strokeWidth={2} aria-hidden />
              {t("scan.open")}
            </button>
          )}
          {shows("emergency") && (
            <button className="flex items-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-lg font-bold text-white" onClick={openEmergency}>
              <Siren className="h-6 w-6" strokeWidth={2} aria-hidden />
              {t("emergency.title")}
            </button>
          )}
          {canFull && (
            <button className="grid h-12 w-12 place-items-center rounded-2xl bg-surface text-muted shadow-sm ring-1 ring-edge/60 hover:text-ink" onClick={toggleFull} aria-label={full ? t("kiosk.exitFullscreen") : t("kiosk.fullscreen")}>
              {full ? <Minimize2 className="h-6 w-6" aria-hidden /> : <Maximize2 className="h-6 w-6" aria-hidden />}
            </button>
          )}
        </div>
      </header>
      {offline && (
        <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-amber-800">
          <WifiOff className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t("guests.offline")}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {shows("calendar") && (
          <Card title={t("calendar.today")} icon={House} className="lg:row-span-2">
            {todays.length === 0 ? <p className="text-lg text-muted">{t("guests.nothingPlanned")}</p> : eventList(todays)}
            {tomorrows.length > 0 && (
              <>
                <p className="mb-3 mt-6 text-sm font-bold uppercase tracking-wide text-muted">{t("calendar.tomorrow")}</p>
                {eventList(tomorrows)}
              </>
            )}
          </Card>
        )}

        {shows("tasks") && (
          <Card title={t("nav.tasks")} icon={CheckCircle2} tone="bg-green-100 text-green-700">
            {view.tasks.length === 0 ? (
              <p className="text-lg text-muted">{t("tasks.noneToday")}</p>
            ) : (
              <ul className="space-y-2">
                {[...view.tasks.filter((x) => !x.done), ...view.tasks.filter((x) => x.done)].map((task, i) => (
                  <li key={task.id ?? `${task.title}-${i}`}>
                    <button
                      className={`flex w-full items-center gap-4 rounded-2xl text-left transition ${
                        task.done
                          ? "min-h-12 px-3 py-1.5 text-lg text-muted"
                          : "min-h-[4.5rem] border-2 border-edge bg-base px-4 py-3 text-xl font-semibold active:scale-[0.98] active:border-accent active:bg-accent/10"
                      }`}
                      disabled={!task.id}
                      // Ticked off by mistake (3.1.1): a tap on a done one undoes it, after asking.
                      onClick={() => (task.done ? undoTask(task) : setDoing(task))}
                    >
                      {task.done ? <CheckCircle2 className="h-7 w-7 shrink-0 text-green-600" aria-hidden /> : <Circle className="h-10 w-10 shrink-0 text-accent" strokeWidth={1.75} aria-hidden />}
                      <span className={`min-w-0 flex-1 ${task.done ? "truncate line-through" : "line-clamp-2 leading-tight"}`}>{task.title}</span>
                      {task.shared && <Users className="h-6 w-6 shrink-0 text-muted" aria-label={t("tasks.shared")} />}
                      {task.who ? (
                        <span className={`shrink-0 rounded-full px-3 py-1 font-bold text-white ${task.done ? "text-sm" : "text-base"}`} style={{ background: task.color ?? "#888" }}>{task.who}</span>
                      ) : !task.done ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-3 py-1 text-base font-bold text-ink">+{task.points}<Star className="h-4 w-4 fill-current" aria-hidden /></span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {view.turns.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2 border-t border-edge pt-3">
                {view.turns.map((turn) => (
                  <li key={turn.title} className="flex items-center gap-1.5 rounded-full border border-edge px-3 py-1 text-sm">
                    <Repeat className="h-3.5 w-3.5" aria-hidden />
                    {turn.title}: <span className="font-semibold">{turn.who ?? "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {shows("food") && (meals.length > 0 || view.lunch.length > 0) && (
          <Card title={t("kiosk.food")} icon={UtensilsCrossed} tone="bg-orange-100 text-orange-700">
            {meals.map((m) => (
              <div key={m.date} className="mb-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">{m.date === todayKey ? t("kiosk.dinnerToday") : t("kiosk.dinnerTomorrow")}</p>
                <p className={m.date === todayKey ? "text-2xl font-extrabold leading-tight" : "text-lg font-semibold"}>{m.name}</p>
                {m.cook && m.meal_id && m.date === todayKey && (
                  <button className="mt-2 flex items-center gap-2 rounded-2xl bg-accent px-4 py-2.5 text-lg font-bold text-white" onClick={() => cook(`/api/kiosk/${token}/meals/${m.meal_id}`)}>
                    <ChefHat className="h-5 w-5" aria-hidden />
                    {t("cook.open")}
                  </button>
                )}
              </div>
            ))}
            {view.lunch.length > 0 && (
              <ul className="space-y-1.5 border-t border-edge pt-3 text-base">
                {view.lunch.map((l) => (
                  <li key={l.name} className="flex items-start gap-2">
                    <Soup className="mt-0.5 h-4 w-4 text-muted" aria-hidden />
                    <span><span className="font-semibold">{l.name}:</span> {l.dishes.join(", ") || "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {shows("week") && (view.week ?? []).length > 0 && (
          <Card title={t("kiosk.widget.week")} icon={CalendarDays} tone="bg-orange-100 text-orange-700">
            <ul className="space-y-1.5">
              {(view.week ?? []).map((m) => {
                const today = m.date === todayKey;
                const day = new Date(`${m.date}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "short" });
                return (
                  <li key={m.meal_id}>
                    <button
                      className={`flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left ${today ? "bg-accent/10 ring-2 ring-accent/50" : "active:bg-base"} ${m.date < todayKey ? "opacity-50" : ""}`}
                      disabled={!m.cook}
                      onClick={() => cook(`/api/kiosk/${token}/meals/${m.meal_id}`)}
                    >
                      <span className="w-12 shrink-0 text-sm font-bold uppercase text-muted">{day}</span>
                      <span className={`min-w-0 flex-1 ${today ? "text-xl font-extrabold" : "text-lg font-semibold"}`}>{m.name}</span>
                      {m.cook && <ChefHat className="h-6 w-6 shrink-0 text-accent" aria-label={t("cook.open")} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {shows("recipes") && (
          <Card title={t("kiosk.widget.recipes")} icon={ChefHat} tone="bg-orange-100 text-orange-700">
            <KioskRecipes token={token} onCook={(r) => cook(`/api/kiosk/${token}/recipes/${r.id}`)} />
          </Card>
        )}

        {(view.devices ?? []).length > 0 && (
          <Card title={t("kiosk.devices")} icon={Lightbulb} tone="bg-yellow-100 text-yellow-700" className="lg:col-span-2">
            <KioskDevices token={token} initial={view.devices ?? []} />
          </Card>
        )}

        {shows("presence") && (
          <Card title={t("widget.presence")} icon={House} tone="bg-sky-100 text-sky-700">
            {view.presence.length === 0 ? (
              <p className="text-muted">{t("presence.nobodyShares")}</p>
            ) : (
              <ul className="grid grid-cols-2 gap-2">
                {view.presence.map((p) => (
                  <li key={p.user_id} className={`flex items-center gap-2 rounded-2xl p-2 ${p.state === "home" ? "bg-green-50" : "bg-base"}`}>
                    <span className="grid h-10 w-10 place-items-center rounded-full text-base font-bold text-white" style={{ background: p.color }}>{p.name.slice(0, 1)}</span>
                    <span>
                      <span className="block font-semibold">{p.name}</span>
                      <span className="flex items-center gap-1 text-xs text-muted">
                        {p.state === "travel" && <Car className="h-3.5 w-3.5" aria-hidden />}
                        {t(`presence.state.${p.state}` as "presence.state.home")}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {little.length > 0 && (
          <Card title={t("easy.kioskTitle")} icon={Star} tone="bg-pink-100 text-pink-700">
            <ul className="flex flex-wrap gap-4">
              {little.map((c) => (
                <li key={c.id}>
                  <button className="flex flex-col items-center gap-1" onClick={() => setLittleOpen(c.id)} aria-label={t("easy.kioskOpen", { name: c.name })}>
                    <span className="grid h-20 w-20 place-items-center rounded-full text-3xl font-extrabold text-white shadow" style={{ backgroundColor: c.color }} aria-hidden>
                      {c.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="text-lg font-bold">{c.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {view.flows.length > 0 && (
          <Card title={t("flows.title")} icon={Zap} tone="bg-yellow-100 text-yellow-700">
            <div className="grid grid-cols-2 gap-2">
              {view.flows.map((f) => (
                <button
                  key={f.id}
                  className={`rounded-2xl border-2 px-3 py-4 text-lg font-semibold ${pressed === f.id ? "border-green-600 bg-green-50 text-green-800" : "border-edge bg-base"}`}
                  onClick={() => press(f.id)}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </Card>
        )}

        {view.exercise && (view.exercise.people.length > 0 || view.exercise.goals.length > 0) && (
          <Card title={t("kiosk.exercise")} icon={HeartPulse} tone="bg-rose-100 text-rose-700">
            <ul className="space-y-1.5 text-lg">
              {view.exercise.people.map((p) => (
                <li key={p.name} className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.color ?? "#999" }} aria-hidden />
                  <span className="flex-1 font-semibold">{p.name}</span>
                  <span className="text-muted">{t("health.minutesShort", { n: p.minutes })}</span>
                </li>
              ))}
            </ul>
            {view.exercise.goals.length > 0 && (
              <div className="mt-3 space-y-2 border-t border-edge pt-3">
                {view.exercise.goals.map((goal) => <GoalBar key={goal.title} goal={goal} />)}
              </div>
            )}
          </Card>
        )}

        {(view.waste.length > 0 || view.electricity || (!shows("food") && view.lunch.length > 0)) && (
          <Card title={t("kiosk.goodToKnow")} icon={Soup}>
            <ul className="space-y-2 text-base">
              {view.waste.slice(0, 2).map((w) => (
                <li key={`${w.date}-${w.title}`} className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-muted" aria-hidden />
                  <span className="capitalize">{new Date(`${w.date}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "short", day: "numeric" })}</span>
                  <span className="text-muted">{w.title}</span>
                </li>
              ))}
              {!shows("food") &&
                view.lunch.map((l) => (
                  <li key={l.name} className="flex items-start gap-2">
                    <Soup className="mt-0.5 h-4 w-4 text-muted" aria-hidden />
                    <span><span className="font-semibold">{l.name}:</span> {l.dishes.join(", ") || "—"}</span>
                  </li>
                ))}
              {view.electricity && view.electricity.now !== null && (
                <li className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-muted" aria-hidden />
                  <span>{t("electricity.nowShort", { ore: Math.round(view.electricity.now) })}</span>
                  {view.electricity.cheapest[0] && <span className="text-muted">· {t("electricity.cheapestAt", { time: time(view.electricity.cheapest[0]) })}</span>}
                </li>
              )}
            </ul>
          </Card>
        )}
      </div>

      {cooking && <CookingView {...cooking} onClose={() => setCooking(null)} />}
      {scanning && <ScanSession backend={scanBackend} onClose={() => setScanning(false)} large />}
      {littleBackend && <EasyHome key={littleOpen} backend={littleBackend} onClose={() => setLittleOpen(null)} />}
      {doing?.id && (
        <WhoDidIt
          large
          title={doing.title}
          points={doing.points}
          shared={doing.shared}
          people={view.members}
          first={doing.assignee_id}
          onDone={(ids) => kioskCall(`/api/kiosk/${token}/tasks/${doing.id}/done`, { method: "POST", body: JSON.stringify({ user_ids: ids }) }).then(() => refreshApi(viewPath))}
          onClose={() => setDoing(null)}
        />
      )}

      {saver && !busy && (
        <Screensaver
          theme={view.screensaver ?? "photos"}
          now={now}
          token={token}
          slides={slides}
          weather={shows("weather") ? view.weather : null}
          next={upcoming[0] ?? null}
          tasks={shows("tasks") ? view.tasks.filter((x) => !x.done) : []}
          foxTheme={view.fox_theme ?? ""}
          birthdays={view.birthdays ?? []}
          onWake={wake}
        />
      )}

      {emergency && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={t("emergency.title")}>
          <div className="mx-auto max-w-3xl space-y-3 rounded-2xl bg-base p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xl font-bold text-red-700">
                <Siren className="h-6 w-6" aria-hidden />
                {t("emergency.title")}
              </h2>
              <button className="btn-ghost px-3" onClick={() => setEmergency(null)} aria-label={t("common.close")}>
                <X className="h-6 w-6" aria-hidden />
              </button>
            </div>
            <p className="font-semibold">{t("guests.call112")}</p>
            <div className="rounded-xl bg-surface p-4"><EmergencyCardView card={emergency.household} /></div>
            {emergency.members.map((card) => (
              <div key={card.user_id} className="rounded-xl bg-surface p-4">
                <p className="mb-2 font-bold">{card.name}</p>
                <EmergencyCardView card={card} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
