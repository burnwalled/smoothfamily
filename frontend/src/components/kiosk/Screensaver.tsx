"use client";

// The kitchen display's screensaver (3.0.3), chosen per screen in the family's settings: the family's
// photos, a flip clock, a calm clock with the weather and what's next, the fox playing out the
// weather (3.0.4), or a dark screen. A tap wakes it – and only wakes it, so nothing behind is pressed
// by mistake.
import { useEffect, useState } from "react";
import { CalendarEvent, Weather } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { WeatherIcon } from "@/components/widgets/TodaySourcesWidgets";
import FlipClock, { isNight } from "./FlipClock";
import FoxScene, { FoxDress } from "./FoxScene";

export type ScreensaverTheme = "photos" | "flipclock" | "calm" | "fox" | "dark";
const SLIDE_MS = 8_000;

// The fox lists this many of the day's open tasks; the rest is "+n more".
const FOX_TASKS = 3;

export default function Screensaver({
  theme, now, token, slides, weather, next, tasks = [], foxTheme = "", birthdays = [], onWake,
}: {
  theme: ScreensaverTheme;
  now: Date;
  token: string;
  slides: string[];
  weather: (Weather & { place: string | null }) | null;
  next: CalendarEvent | null;
  // The day's open tasks (3.0.4), shown by the fox.
  tasks?: { title: string; who: string | null; color: string | null }[];
  // 3.4.0: the fox's holiday, and whose birthday it is today.
  foxTheme?: FoxDress;
  birthdays?: string[];
  onWake: () => void;
}) {
  const { t, dateLocale } = useI18n();
  const [slide, setSlide] = useState(0);
  const time = now.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "long" });
  // Photos at night would light up the kitchen: the calm clock, dimmed, instead. No photos: the same.
  const shown: ScreensaverTheme = theme === "photos" && (!slides.length || isNight(now)) ? "calm" : theme;

  useEffect(() => {
    if (shown !== "photos" || !slides.length) return;
    const id = window.setInterval(() => setSlide((i) => (i + 1) % slides.length), SLIDE_MS);
    return () => window.clearInterval(id);
  }, [shown, slides.length]);

  const wake = t("kiosk.saver.wake");
  if (shown === "flipclock") return <FlipClock now={now} locale={dateLocale} label={`${time}, ${date}. ${wake}`} onTap={onWake} />;
  if (shown === "fox")
    return (
      <button className="fixed inset-0 z-[45] overflow-hidden bg-black" onClick={onWake} aria-label={wake}>
        <FoxScene now={now} kind={weather?.now?.kind ?? "partly"} temp={weather?.now?.temp ?? null} wind={weather?.now?.wind ?? null} dress={birthdays.length ? "birthday" : foxTheme} />
        {birthdays.length > 0 && (
          <span className="absolute left-1/2 top-[12vh] -translate-x-1/2 whitespace-nowrap rounded-full bg-white/85 px-[3vw] py-[1vh] text-[min(4.5vw,6vh)] font-bold text-[#8a2b3c] shadow-lg">
            {t("fox.birthday", { name: new Intl.ListFormat(dateLocale, { type: "conjunction" }).format(birthdays) })}
          </span>
        )}
        <span className="absolute bottom-[4vh] left-[4vw] flex items-end gap-5 text-left text-white [text-shadow:0_2px_14px_rgba(0,0,0,0.45)]">
          <span className="text-[min(13vw,18vh)] font-semibold leading-none tabular-nums tracking-tight">{time}</span>
          {weather?.now && (
            <span className="mb-[1vh] flex items-center gap-2 text-[min(4vw,5vh)]">
              <WeatherIcon kind={weather.now.kind} className="h-[1.2em] w-[1.2em] drop-shadow" />
              {Math.round(weather.now.temp)}°
            </span>
          )}
        </span>
        {tasks.length > 0 && (
          <span className="absolute bottom-[4vh] right-[3vw] w-[min(34vw,26rem)] rounded-[1.4rem] bg-black/30 p-[min(2vw,1.1rem)] text-left text-white backdrop-blur-sm">
            <span className="mb-1.5 block text-[min(1.9vw,0.95rem)] font-bold uppercase tracking-wide opacity-80">{t("kiosk.saver.todayTasks")}</span>
            {tasks.slice(0, FOX_TASKS).map((task, i) => (
              <span key={`${task.title}-${i}`} className="flex items-center gap-2 py-0.5 text-[min(2.6vw,1.35rem)] font-semibold leading-tight">
                <span className="h-[0.6em] w-[0.6em] shrink-0 rounded-full border-2 border-white/80" style={task.color ? { background: task.color } : undefined} />
                <span className="min-w-0 flex-1 truncate">{task.title}</span>
                {task.who && <span className="shrink-0 text-[0.75em] opacity-80">{task.who}</span>}
              </span>
            ))}
            {tasks.length > FOX_TASKS && <span className="mt-1 block text-[min(2vw,1rem)] opacity-80">{t("kiosk.saver.moreTasks", { n: tasks.length - FOX_TASKS })}</span>}
          </span>
        )}
      </button>
    );
  if (shown === "dark") return <button className="fixed inset-0 z-[45] cursor-none bg-black" onClick={onWake} aria-label={wake} />;
  if (shown === "photos")
    return (
      <button className="fixed inset-0 z-[45] bg-black" onClick={onWake} aria-label={wake}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={slides[slide]} src={`/api/kiosk/${token}/photos/${slides[slide]}`} alt="" className="kiosk-fade h-full w-full object-contain" />
        <span className="absolute bottom-6 left-6 rounded-2xl bg-black/45 px-5 py-2 text-left text-white backdrop-blur-sm">
          <span className="block text-5xl font-extrabold tabular-nums">{time}</span>
          <span className="block text-lg capitalize">{date}</span>
        </span>
      </button>
    );
  // Calm: a big clock on a sky that follows the time of day, the weather and what's next.
  const hour = now.getHours();
  const sky = isNight(now)
    ? "from-[#05070d] to-[#0d1424] text-white/70"
    : hour < 10
      ? "from-[#fde2c8] to-[#f7f1e3] text-[#3a2a1c]"
      : hour < 17
        ? "from-[#dbeafe] to-[#f1f5f9] text-[#1e293b]"
        : "from-[#2b2d55] to-[#7a4b6b] text-white";
  const at = (iso: string) => new Date(iso).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" });
  return (
    <button className={`fixed inset-0 z-[45] grid place-items-center bg-gradient-to-b ${sky} transition-colors duration-[3000ms]`} onClick={onWake} aria-label={wake}>
      <span className="text-center">
        <span className="block text-[min(26vw,40vh)] font-extralight leading-none tabular-nums tracking-tight">{time}</span>
        <span className="mt-2 block text-[min(4vw,5vh)] capitalize opacity-80">{date}</span>
        {(weather?.now || next) && (
          <span className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-[min(3vw,4vh)]">
            {weather?.now && (
              <span className="flex items-center gap-3">
                <WeatherIcon kind={weather.now.kind} className="h-[1.6em] w-[1.6em]" />
                {Math.round(weather.now.temp)}°
              </span>
            )}
            {next && (
              <span className="opacity-90">
                {next.all_day ? "" : `${at(next.start)} `}
                <span className="font-semibold">{next.title}</span>
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  );
}
