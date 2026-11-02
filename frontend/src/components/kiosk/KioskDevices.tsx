"use client";

// The kitchen display's smart home (3.0.4): big tiles for the devices the family admin chose for this
// screen – tap one for its main action, the sliders for the rest (dimmer, blinds, thermostat …). The
// same tiles and panel as the app's, pressed through the screen's own link.
import { useCallback, useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { SmarthomeDeviceState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { domainIcon, isActive } from "@/lib/smarthome";
import { DetailPanel, hasMoreControls, mainAction, Send, StatusText } from "@/components/widgets/SmartHomeWidget";

type Device = SmarthomeDeviceState;
const REFRESH_MS = 15_000;

export default function KioskDevices({ token, initial }: { token: string; initial: Device[] }) {
  const { t } = useI18n();
  const [devices, setDevices] = useState<Device[]>(initial);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const later = useRef<number | null>(null);

  const load = useCallback(() => {
    fetch(`/api/kiosk/${token}/devices`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setDevices)
      .catch(() => {});
  }, [token]);

  useEffect(() => setDevices(initial), [initial]);
  useEffect(() => {
    const id = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const send: Send = useCallback(
    async (device, action, value, optimistic) => {
      setError(false);
      if (optimistic) setDevices((all) => all.map((d) => (d.id === device.id ? { ...d, ...optimistic } : d)));
      const resp = await fetch(`/api/kiosk/${token}/devices/${device.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, value }),
      }).catch(() => null);
      if (!resp?.ok) setError(true);
      // Home Assistant needs a moment to tell the new state.
      if (later.current) window.clearTimeout(later.current);
      later.current = window.setTimeout(load, 1500);
    },
    [token, load],
  );

  function tap(device: Device) {
    const main = mainAction(device);
    if (!main) return setDetailId(device.id);
    if (["scene", "script", "automation"].includes(device.domain)) {
      setFlash(device.id);
      window.setTimeout(() => setFlash((id) => (id === device.id ? null : id)), 1500);
    }
    void send(device, main.action, undefined, main.optimistic);
  }

  const detail = devices.find((d) => d.id === detailId) ?? null;
  return (
    <>
      {error && <p className="mb-2 text-sm font-semibold text-red-700">{t("smarthome.actionFailed")}</p>}
      <div className="grid grid-cols-2 gap-3">
        {devices.map((device) => {
          const on = isActive(device.domain, device.state);
          const unavailable = device.state === "unavailable" || device.state === "unknown";
          const Icon = domainIcon(device.domain);
          return (
            <div key={device.id} className={`relative rounded-2xl border-2 transition ${on ? "border-accent/70 bg-accent/10" : "border-edge bg-base"} ${unavailable ? "opacity-50" : ""}`}>
              <button
                type="button"
                disabled={unavailable}
                className="flex min-h-24 w-full items-center gap-3 p-4 pr-12 text-left"
                aria-pressed={["light", "switch", "fan", "cover"].includes(device.domain) ? on : undefined}
                onClick={() => tap(device)}
              >
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${on ? "bg-accent text-white" : "bg-surface text-muted"}`}>
                  <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-lg font-bold">{device.display_name}</span>
                  {flash === device.id ? <span className="text-sm font-semibold text-accent">{t("smarthome.done")}</span> : <StatusText device={device} className="text-sm text-muted" />}
                </span>
              </button>
              {hasMoreControls(device) && !unavailable && (
                <button type="button" className="absolute right-2 top-2 rounded-xl p-2.5 text-muted hover:bg-surface hover:text-ink" onClick={() => setDetailId(device.id)} aria-label={t("smarthome.moreControls")}>
                  <SlidersHorizontal className="h-5 w-5" strokeWidth={2} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {detail && <DetailPanel device={detail} send={send} onClose={() => setDetailId(null)} />}
    </>
  );
}
