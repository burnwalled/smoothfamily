"use client";

// Smart home tiles: tap a tile for its main action (toggle, start, run …);
// the sliders button opens a panel with the richer controls (dimmer, white
// balance, cover position, fan speed, thermostat, vacuum, automation).
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  House,
  LocateFixed,
  Minus,
  Pause,
  Play,
  Plus,
  Power,
  SlidersHorizontal,
  Square,
  Star as StarIcon,
  Sun,
  X,
} from "lucide-react";
import Link from "next/link";
import { api, request, SmarthomeDeviceState } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { NONE, refreshApi, setApiData, useApi } from "@/lib/query";
import { domainIcon, isActive } from "@/lib/smarthome";
import { useLiveConnected } from "@/lib/live";
import { useMe } from "@/components/Shell";
import { FlowButtons } from "@/components/Flows";

type Device = SmarthomeDeviceState;
export type Send = (device: Device, action: string, value?: number, optimistic?: Partial<Device>) => Promise<void>;

// Live updates bring device changes at once; polling is the fallback.
const REFRESH_MS = 10_000;
const REFRESH_LIVE_MS = 120_000;
const FLOW_DOMAINS = ["scene", "script", "automation"];
// Warm (low K) → cool (high K), roughly how the light actually looks.
const WHITE_GRADIENT = "linear-gradient(to right, #ffa957, #ffe2bd, #fff7ee, #dce9ff, #b5d0ff)";

export function hasMoreControls(d: Device): boolean {
  const a = d.attributes;
  switch (d.domain) {
    case "light":
      return (a.supported_color_modes ?? []).some((m) => m !== "onoff");
    case "fan":
      return a.percentage !== undefined;
    case "cover":
    case "climate":
    case "vacuum":
    case "automation":
      return true;
    default:
      return false;
  }
}

function supportsColorTemp(d: Device): boolean {
  const modes = d.attributes.supported_color_modes ?? [];
  return modes.some((m) => ["color_temp", "rgbww", "rgbw"].includes(m)) && d.attributes.min_color_temp_kelvin !== undefined;
}

function fillTrack(value: number, min: number, max: number): string {
  const pct = ((value - min) / (max - min)) * 100;
  return `linear-gradient(to right, rgb(var(--c-accent)) ${pct}%, rgb(var(--c-edge)) ${pct}%)`;
}

/** A slider that shows changes immediately and sends them to HA after a short pause. */
function Slider({
  label,
  icon,
  value,
  min,
  max,
  step = 1,
  unit,
  background,
  onCommit,
}: {
  label: string;
  icon?: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  background?: string;
  onCommit: (value: number) => void;
}) {
  const [local, setLocal] = useState(value);
  const timer = useRef<number | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (!dragging.current) setLocal(value);
  }, [value]);

  function change(next: number) {
    setLocal(next);
    dragging.current = true;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      dragging.current = false;
      onCommit(next);
    }, 350);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          {icon}
          {label}
        </span>
        <span className="tabular-nums text-muted">
          {local}
          {unit}
        </span>
      </div>
      <input
        type="range"
        className="sf-range"
        min={min}
        max={max}
        step={step}
        value={local}
        aria-label={label}
        style={{ background: background ?? fillTrack(local, min, max) }}
        onChange={(e) => change(Number(e.target.value))}
      />
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  primary = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-3 text-xs font-semibold transition ${
        primary ? "border-accent bg-accent/15 text-ink" : "border-edge hover:bg-base"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function PowerRow({ device, send }: { device: Device; send: Send }) {
  const { t } = useI18n();
  const on = isActive(device.domain, device.state);
  return (
    <button
      type="button"
      onClick={() =>
        send(device, on ? "turn_off" : "turn_on", undefined, { state: on ? "off" : device.domain === "climate" ? "heat" : "on" })
      }
      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold transition ${
        on ? "border-accent bg-accent/15" : "border-edge"
      }`}
      aria-pressed={on}
    >
      <span className="flex items-center gap-2">
        <Power className="h-4 w-4" strokeWidth={2} aria-hidden />
        {t("smarthome.power")}
      </span>
      <span className={`relative h-6 w-11 rounded-full transition ${on ? "bg-accent" : "bg-edge"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

export function DetailPanel({ device, send, onClose }: { device: Device; send: Send; onClose: () => void }) {
  const { t, dateLocale } = useI18n();
  const a = device.attributes;
  const Icon = domainIcon(device.domain);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  let body: React.ReactNode = null;
  if (device.domain === "light") {
    const minK = a.min_color_temp_kelvin ?? 2200;
    const maxK = a.max_color_temp_kelvin ?? 6500;
    const clampK = (k: number) => Math.min(maxK, Math.max(minK, k));
    body = (
      <>
        <PowerRow device={device} send={send} />
        <Slider
          label={t("smarthome.brightness")}
          icon={<Sun className="h-4 w-4" strokeWidth={2} aria-hidden />}
          value={device.state === "on" ? a.brightness ?? 100 : 0}
          min={0}
          max={100}
          unit=" %"
          onCommit={(v) =>
            v === 0
              ? send(device, "turn_off", undefined, { state: "off" })
              : send(device, "brightness", v, { state: "on", attributes: { ...a, brightness: v } })
          }
        />
        {supportsColorTemp(device) && (
          <div className="space-y-3">
            <Slider
              label={t("smarthome.whiteBalance")}
              value={a.color_temp_kelvin ?? Math.round((minK + maxK) / 2)}
              min={minK}
              max={maxK}
              step={50}
              unit=" K"
              background={WHITE_GRADIENT}
              onCommit={(v) => send(device, "color_temp", v, { state: "on", attributes: { ...a, color_temp_kelvin: v } })}
            />
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["smarthome.warm", 2700],
                  ["smarthome.neutral", 4000],
                  ["smarthome.cool", 6000],
                ] as [TranslationKey, number][]
              ).map(([key, kelvin]) => (
                <button
                  key={key}
                  type="button"
                  className="rounded-lg border border-edge py-2 text-xs font-semibold hover:bg-base"
                  onClick={() =>
                    send(device, "color_temp", clampK(kelvin), {
                      state: "on",
                      attributes: { ...a, color_temp_kelvin: clampK(kelvin) },
                    })
                  }
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
        )}
      </>
    );
  } else if (device.domain === "fan") {
    body = (
      <>
        <PowerRow device={device} send={send} />
        <Slider
          label={t("smarthome.speed")}
          value={a.percentage ?? 0}
          min={0}
          max={100}
          step={a.percentage_step ? Math.max(1, Math.round(a.percentage_step)) : 1}
          unit=" %"
          onCommit={(v) => send(device, "percentage", v, { state: v > 0 ? "on" : "off", attributes: { ...a, percentage: v } })}
        />
      </>
    );
  } else if (device.domain === "cover") {
    body = (
      <>
        {a.current_position !== undefined && (
          <Slider
            label={t("smarthome.position")}
            value={a.current_position}
            min={0}
            max={100}
            unit=" %"
            onCommit={(v) => send(device, "position", v, { attributes: { ...a, current_position: v } })}
          />
        )}
        <div className="grid grid-cols-3 gap-2">
          <ActionButton icon={<ArrowUpToLine className="h-5 w-5" strokeWidth={1.75} />} label={t("smarthome.open")} onClick={() => send(device, "open", undefined, { state: "opening" })} />
          <ActionButton icon={<Square className="h-5 w-5" strokeWidth={1.75} />} label={t("smarthome.stop")} onClick={() => send(device, "stop")} />
          <ActionButton icon={<ArrowDownToLine className="h-5 w-5" strokeWidth={1.75} />} label={t("smarthome.close")} onClick={() => send(device, "close", undefined, { state: "closing" })} />
        </div>
      </>
    );
  } else if (device.domain === "climate") {
    const step = a.target_temp_step ?? 0.5;
    const target = a.temperature ?? 21;
    const set = (v: number) => {
      const next = Math.min(a.max_temp ?? 35, Math.max(a.min_temp ?? 5, Math.round(v / step) * step));
      send(device, "set_temperature", next, { attributes: { ...a, temperature: next } });
    };
    body = (
      <>
        <PowerRow device={device} send={send} />
        <div className="rounded-xl border border-edge p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("smarthome.targetTemp")}</p>
          <div className="mt-2 flex items-center justify-center gap-6">
            <button type="button" className="grid h-12 w-12 place-items-center rounded-full border border-edge hover:bg-base" onClick={() => set(target - step)} aria-label="−">
              <Minus className="h-5 w-5" strokeWidth={2} />
            </button>
            <span className="min-w-[5ch] text-4xl font-extrabold tabular-nums">{target.toLocaleString(dateLocale)}°</span>
            <button type="button" className="grid h-12 w-12 place-items-center rounded-full border border-edge hover:bg-base" onClick={() => set(target + step)} aria-label="+">
              <Plus className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
          {a.current_temperature !== undefined && (
            <p className="mt-2 text-sm text-muted">{t("smarthome.currentTemp", { t: a.current_temperature.toLocaleString(dateLocale) })}</p>
          )}
        </div>
      </>
    );
  } else if (device.domain === "vacuum") {
    const cleaning = device.state === "cleaning";
    body = (
      <>
        {a.battery_level !== undefined && (
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium">{t("smarthome.battery")}</span>
              <span className="tabular-nums text-muted">{a.battery_level} %</span>
            </div>
            <div className="h-2 rounded-full bg-edge">
              <div className="h-2 rounded-full bg-accent" style={{ width: `${a.battery_level}%` }} />
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {cleaning ? (
            <ActionButton primary icon={<Pause className="h-5 w-5" strokeWidth={1.75} />} label={t("smarthome.pause")} onClick={() => send(device, "pause", undefined, { state: "paused" })} />
          ) : (
            <ActionButton primary icon={<Play className="h-5 w-5" strokeWidth={1.75} />} label={t("smarthome.start")} onClick={() => send(device, "start", undefined, { state: "cleaning" })} />
          )}
          <ActionButton icon={<Square className="h-5 w-5" strokeWidth={1.75} />} label={t("smarthome.stop")} onClick={() => send(device, "stop", undefined, { state: "idle" })} />
          <ActionButton icon={<House className="h-5 w-5" strokeWidth={1.75} />} label={t("smarthome.dock")} onClick={() => send(device, "return_to_base", undefined, { state: "returning" })} />
          <ActionButton icon={<LocateFixed className="h-5 w-5" strokeWidth={1.75} />} label={t("smarthome.locate")} onClick={() => send(device, "locate")} />
        </div>
      </>
    );
  } else if (device.domain === "automation") {
    const enabled = device.state === "on";
    body = (
      <>
        <button
          type="button"
          className="btn-primary flex w-full items-center justify-center gap-2 py-3"
          onClick={() => send(device, "trigger")}
        >
          <Play className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t("smarthome.runNow")}
        </button>
        <button
          type="button"
          onClick={() => send(device, enabled ? "turn_off" : "turn_on", undefined, { state: enabled ? "off" : "on" })}
          className="flex w-full items-center justify-between rounded-xl border border-edge px-4 py-3 text-sm font-semibold"
          aria-pressed={enabled}
        >
          {t("smarthome.automationEnabled")}
          <span className={`relative h-6 w-11 rounded-full transition ${enabled ? "bg-accent" : "bg-edge"}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
          </span>
        </button>
        <p className="text-xs text-muted">
          {a.last_triggered
            ? t("smarthome.lastRun", {
                time: new Date(a.last_triggered).toLocaleString(dateLocale, {
                  weekday: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              })
            : t("smarthome.neverRun")}
        </p>
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={device.display_name}
        className="max-h-[90vh] w-full space-y-5 overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-soft sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className={`grid h-10 w-10 place-items-center rounded-xl ${isActive(device.domain, device.state) ? "bg-accent/15 text-accent" : "bg-base text-muted"}`}>
            <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-bold">{device.display_name}</h3>
            <StatusText device={device} />
          </div>
          <button type="button" className="rounded p-1.5 text-muted hover:bg-base hover:text-ink" onClick={onClose} aria-label={t("common.close")}>
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}

export function StatusText({ device, className = "text-xs text-muted" }: { device: Device; className?: string }) {
  const { t, dateLocale } = useI18n();
  const a = device.attributes;
  const s = device.state;
  const state = (key: string) => t(`smarthome.state.${key}` as TranslationKey);

  let text: string;
  if (s === "unavailable" || s === "unknown") text = t("smarthome.unavailable");
  else if (device.domain === "light") text = s === "on" ? (a.brightness !== undefined ? `${state("on")} · ${a.brightness} %` : state("on")) : state("off");
  else if (device.domain === "fan") text = s === "on" && a.percentage ? `${state("on")} · ${a.percentage} %` : s === "on" ? state("on") : state("off");
  else if (device.domain === "switch") text = s === "on" ? state("on") : state("off");
  else if (device.domain === "cover") {
    const base = ["open", "closed", "opening", "closing"].includes(s) ? state(s) : s;
    text = a.current_position !== undefined && s === "open" ? `${base} · ${a.current_position} %` : base;
  } else if (device.domain === "climate") {
    text = s === "off"
      ? state("off")
      : [a.current_temperature, a.temperature].every((v) => v !== undefined)
        ? `${a.current_temperature!.toLocaleString(dateLocale)}° → ${a.temperature!.toLocaleString(dateLocale)}°`
        : state("on");
  } else if (device.domain === "vacuum") {
    const base = ["cleaning", "docked", "returning", "paused", "idle", "error"].includes(s) ? state(s) : s;
    text = a.battery_level !== undefined ? `${base} · ${a.battery_level} %` : base;
  } else if (device.domain === "scene") text = t("smarthome.tapToActivate");
  else if (device.domain === "script") text = s === "on" ? state("running") : t("smarthome.tapToRun");
  else if (device.domain === "automation") text = s === "on" ? t("smarthome.automationOn") : t("smarthome.automationOff");
  else if (device.domain === "media_player") {
    const base = ["playing", "paused", "idle", "off"].includes(s) ? state(s) : s;
    text = s === "playing" && a.media_title ? `${base} · ${a.media_title}` : a.volume_level !== undefined && s !== "off" ? `${base} · ${a.volume_level} %` : base;
  } else text = s;

  return <p className={`truncate ${className}`}>{text}</p>;
}

// The Today card shows the user's favourites; the Smart home app (`app`) shows every device they
// may control, grouped, with a star to choose the favourites. Which devices exist and who may use
// them is still set by the family admin under Settings.
// Smart home needs the server in the same home as Home Assistant: a hosted family sees why it's off.
export default function SmartHomeWidget({ app = false }: { app?: boolean }) {
  const me = useMe();
  if (!me.smarthome_available) return <SmartHomeUnavailable />;
  return <SmartHomeDevicesView app={app} />;
}

export function SmartHomeUnavailable() {
  const { t } = useI18n();
  return (
    <div className="rounded-lg border border-dashed border-edge p-4 text-sm">
      <p className="font-semibold">{t("smarthome.selfHostTitle")}</p>
      <p className="mt-1 text-muted">{t("smarthome.selfHostText")}</p>
      <a className="mt-2 inline-block font-semibold text-accent hover:underline" href="https://github.com/burnwalled/smoothfamily#readme" target="_blank" rel="noreferrer">
        {t("smarthome.selfHostLink")} →
      </a>
    </div>
  );
}

/** A tile's tap: the device's main action and how it looks at once – or null for the panel (a
 *  thermostat). Shared with the kitchen display (3.0.4). */
export function mainAction(device: Device): { action: string; optimistic?: Partial<Device> } | null {
  const on = isActive(device.domain, device.state);
  switch (device.domain) {
    case "light":
    case "switch":
    case "fan":
      return { action: "toggle", optimistic: { state: on ? "off" : "on" } };
    case "cover":
      return { action: on ? "close" : "open", optimistic: { state: on ? "closing" : "opening" } };
    case "vacuum":
      return device.state === "cleaning" ? { action: "pause", optimistic: { state: "paused" } } : { action: "start", optimistic: { state: "cleaning" } };
    case "media_player":
      return device.state === "playing" ? { action: "pause", optimistic: { state: "paused" } } : { action: "play", optimistic: { state: "playing" } };
    case "scene":
      return { action: "activate" };
    case "script":
      return { action: "run" };
    case "automation":
      return { action: "trigger" };
    default:
      return null;
  }
}

function SmartHomeDevicesView({ app = false }: { app?: boolean }) {
  const { t } = useI18n();
  // From the cache, polled slowly as the live stream's fallback. A tap shows at once (setApiData)
  // and is read back once Home Assistant has had a moment to tell the new state.
  const live = useLiveConnected();
  const devicesQuery = useApi<Device[]>("/api/smarthome/my-devices", { refetchInterval: live ? REFRESH_LIVE_MS : REFRESH_MS });
  const devices = devicesQuery.data ?? NONE;
  const loading = devicesQuery.isPending;
  const setDevices = (update: (prev: Device[]) => Device[]) => setApiData<Device[]>("/api/smarthome/my-devices", (prev) => update(prev ?? NONE));
  const [detailId, setDetailId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null); // device id that just ran (scene/script/automation)
  const [error, setError] = useState("");
  const reloadTimer = useRef<number | null>(null);

  const send: Send = useCallback(
    async (device, action, value, optimistic) => {
      setError("");
      if (optimistic) setDevices((prev) => prev.map((d) => (d.id === device.id ? { ...d, ...optimistic } : d)));
      try {
        // Not api.post: refreshing at once would show Home Assistant's old state for a moment.
        await request(`/api/smarthome/devices/${device.id}/action`, { method: "POST", body: JSON.stringify({ action, value }) });
      } catch {
        setError(t("smarthome.actionFailed"));
      }
      // HA needs a moment to report the new state.
      if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
      reloadTimer.current = window.setTimeout(() => void refreshApi("/api/smarthome/my-devices"), 1500);
    },
    [t]
  );

  function primaryAction(device: Device) {
    const main = mainAction(device);
    if (!main) return setDetailId(device.id);
    if (FLOW_DOMAINS.includes(device.domain)) {
      setFlash(device.id);
      window.setTimeout(() => setFlash((id) => (id === device.id ? null : id)), 1500);
    }
    return send(device, main.action, undefined, main.optimistic);
  }

  async function toggleFavorite(device: Device) {
    const next = devices.map((d) => (d.id === device.id ? { ...d, favorite: !d.favorite } : d));
    setDevices(() => next);
    try {
      await api.put("/api/smarthome/favorites", { device_ids: next.filter((d) => d.favorite).map((d) => d.id) });
    } catch {
      setDevices(() => devices);
      setError(t("common.error"));
    }
  }

  if (loading) return <p className="text-sm text-muted">{t("common.loading")}</p>;
  if (devices.length === 0) return <p className="text-sm text-muted">{t("smarthome.noDevices")}</p>;

  const detail = devices.find((d) => d.id === detailId) ?? null;
  const favorites = devices.filter((d) => d.favorite);

  const grid = (list: Device[]) => (
      <div className={`grid grid-cols-2 gap-2 ${app ? "sm:grid-cols-3 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
        {list.map((device) => {
          const on = isActive(device.domain, device.state);
          const unavailable = device.state === "unavailable" || device.state === "unknown";
          const Icon = domainIcon(device.domain);
          const more = hasMoreControls(device) && !unavailable;
          const level = device.domain === "light" && on ? device.attributes.brightness : device.domain === "cover" && on ? device.attributes.current_position : undefined;
          return (
            <div
              key={device.id}
              className={`relative overflow-hidden rounded-xl border transition ${
                on ? "border-accent/60 bg-accent/10" : "border-edge bg-surface"
              } ${unavailable ? "opacity-50" : ""}`}
            >
              <button
                type="button"
                disabled={unavailable}
                onClick={() => (device.domain === "climate" ? setDetailId(device.id) : primaryAction(device))}
                className="flex min-h-[84px] w-full flex-col items-start gap-2 p-3 pr-10 text-left disabled:cursor-not-allowed"
                aria-pressed={["light", "switch", "fan", "cover"].includes(device.domain) ? on : undefined}
              >
                <span className={`grid h-9 w-9 place-items-center rounded-lg ${on ? "bg-accent text-white" : "bg-base text-muted"}`}>
                  <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="w-full min-w-0">
                  <span className="block truncate text-sm font-semibold">{device.display_name}</span>
                  {flash === device.id ? (
                    <p className="truncate text-xs font-semibold text-accent">{t("smarthome.done")}</p>
                  ) : (
                    <StatusText device={device} className={`text-xs ${on ? "text-ink/80" : "text-muted"}`} />
                  )}
                </span>
              </button>
              {more && (
                <button
                  type="button"
                  className="absolute right-1.5 top-1.5 rounded-lg p-2 text-muted hover:bg-base hover:text-ink"
                  onClick={() => setDetailId(device.id)}
                  aria-label={t("smarthome.moreControls")}
                  title={t("smarthome.moreControls")}
                >
                  <SlidersHorizontal className="h-4 w-4" strokeWidth={2} />
                </button>
              )}
              {app && (
                <button
                  type="button"
                  className={`absolute bottom-2 right-1.5 rounded-lg p-2 hover:bg-base ${device.favorite ? "text-accent" : "text-muted"}`}
                  onClick={() => toggleFavorite(device)}
                  aria-pressed={device.favorite}
                  aria-label={t(device.favorite ? "smarthome.unfavorite" : "smarthome.favorite")}
                  title={t(device.favorite ? "smarthome.unfavorite" : "smarthome.favorite")}
                >
                  <StarIcon className="h-4 w-4" strokeWidth={2} fill={device.favorite ? "currentColor" : "none"} />
                </button>
              )}
              {level !== undefined && (
                <span className="absolute inset-x-0 bottom-0 h-1 bg-edge">
                  <span className="block h-1 bg-accent" style={{ width: `${level}%` }} />
                </span>
              )}
            </div>
          );
        })}
      </div>
  );

  if (!app) {
    return (
      <>
        {error && <p className="mb-2 text-xs text-red-700">{error}</p>}
        <FlowButtons />
        {favorites.length === 0 ? <p className="text-sm text-muted">{t("smarthome.noFavorites")}</p> : grid(favorites)}
        <Link href="/smarthome" className="btn-ghost -ml-2 mt-2 inline-flex px-2 py-1 text-xs">
          {t("smarthome.openApp")}
        </Link>
        {detail && <DetailPanel device={detail} send={send} onClose={() => setDetailId(null)} />}
      </>
    );
  }

  const flows = devices.filter((d) => FLOW_DOMAINS.includes(d.domain));
  const things = devices.filter((d) => !FLOW_DOMAINS.includes(d.domain));
  return (
    <div className="space-y-6">
      {error && <p className="text-xs text-red-700">{error}</p>}
      <p className="text-sm text-muted">{t("smarthome.favoritesHint")}</p>
      {things.length > 0 &&
        [...new Set(things.map((d) => d.home ?? ""))].map((home) => {
          const here = things.filter((d) => (d.home ?? "") === home);
          return (
            <section key={home || "main"}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
                {home || t("smarthome.devicesHeading")}
                {here.every((d) => d.online === false) && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold normal-case tracking-normal text-amber-900">{t("homes.offline")}</span>}
              </h2>
              {grid(here)}
            </section>
          );
        })}
      {flows.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{t("smarthome.flowsHeading")}</h2>
          {grid(flows)}
        </section>
      )}
      {detail && <DetailPanel device={detail} send={send} onClose={() => setDetailId(null)} />}
    </div>
  );
}
