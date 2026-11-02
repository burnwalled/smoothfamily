"use client";

// Smart home settings → the family's Home Assistants, one per home (2.8.4): link each to a home, and
// add another home's (the cabin's) through the Smooth Family gateway with a one-time pairing code.
import { useState } from "react";
import { Copy, House, Plus, RefreshCw, Trash2, Wifi, WifiOff, CheckCircle2 } from "lucide-react";
import { api, Property } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";

export type HomeConn = {
  id: string;
  name: string;
  property_id: string | null;
  property_name: string | null;
  kind: "direct" | "gateway" | "simulated";
  base_url: string;
  online: boolean;
  last_seen: string | null;
  version: string | null;
  pairing: boolean;
  // The newest gateway (3.0.1), and whether this one fetches it by itself (null while offline).
  latest_version?: string | null;
  update_available?: boolean;
  auto_update?: boolean | null;
};

type Pairing = { connection: HomeConn; code: string; expires_at: string };

/** The family's Home Assistants (one per home), from the cache. */
export function useHomes(): HomeConn[] {
  return useApi<HomeConn[]>("/api/smarthome/connections").data ?? NONE;
}

export default function Homes({ homes }: { homes: HomeConn[] }) {
  const { t, dateLocale } = useI18n();
  const properties = useApi<Property[]>("/api/property/properties").data ?? NONE;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");


  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function add() {
    await run(async () => {
      setPairing(await api.post<Pairing>("/api/smarthome/gateways", { name: name.trim(), property_id: propertyId || null }));
      setAdding(false);
      setName("");
      setPropertyId("");
    });
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the code is on screen */
    }
  }

  const seen = (iso: string | null) => (iso ? new Date(iso).toLocaleString(dateLocale, { dateStyle: "short", timeStyle: "short" }) : "–");

  return (
    <section className="card p-5" aria-label={t("homes.title")}>
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("homes.title")}</h2>
      <p className="text-xs text-muted">{t("homes.hint")}</p>

      {homes.length > 0 && (
        <ul className="mt-3 divide-y divide-edge text-sm">
          {homes.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-2 py-2">
              <House className="h-4 w-4 text-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{h.name || h.property_name || (h.kind === "gateway" ? t("homes.gateway") : t("homes.main"))}</span>
                <span className="block text-xs text-muted">
                  {h.kind === "gateway"
                    ? h.pairing
                      ? t("homes.waitingForPairing")
                      : h.online
                        ? t("homes.gatewayOnline", { version: h.version ?? "?" })
                        : t("homes.gatewayOffline", { when: seen(h.last_seen) })
                    : h.kind === "simulated"
                      ? t("sim.connected")
                      : h.base_url}
                </span>
                {h.kind === "gateway" && !h.pairing && h.update_available && (
                  <span className="block text-xs font-semibold text-accent">
                    {h.auto_update ? t("homes.updating", { version: h.latest_version ?? "" }) : t("homes.updateAvailable", { version: h.latest_version ?? "" })}
                  </span>
                )}
                {h.kind === "gateway" && !h.pairing && !h.update_available && h.version && h.version === h.latest_version && (
                  <span className="flex items-center gap-1 text-xs text-green-700">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    {t("homes.upToDate", { version: h.version })}
                  </span>
                )}
                {h.kind === "gateway" && h.online && !h.update_available && h.auto_update === false && (
                  <span className="block text-xs text-muted">{t("homes.autoUpdateOff")}</span>
                )}
              </span>
              {h.kind === "gateway" && !h.pairing && (h.online ? <Wifi className="h-4 w-4 text-green-600" aria-label={t("homes.online")} /> : <WifiOff className="h-4 w-4 text-amber-700" aria-label={t("homes.offline")} />)}
              <select className="input w-auto py-1 text-sm" value={h.property_id ?? ""} onChange={(e) => run(() => api.patch(`/api/smarthome/connections/${h.id}`, { property_id: e.target.value || null }))} aria-label={t("homes.whichHome", { name: h.name || t("homes.main") })}>
                <option value="">{t("homes.noHome")}</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {h.kind === "gateway" && (
                <>
                  <button className="rounded p-1.5 text-muted hover:bg-base hover:text-ink" title={t("homes.newCode")} aria-label={t("homes.newCode")} onClick={() => confirm(t("homes.newCodeConfirm")) && run(async () => setPairing(await api.post<Pairing>(`/api/smarthome/gateways/${h.id}/pairing`, {})))}>
                    <RefreshCw className="h-4 w-4" aria-hidden />
                  </button>
                  <button className="rounded p-1.5 text-muted hover:bg-base hover:text-red-700" title={t("common.remove")} aria-label={t("common.remove")} onClick={() => confirm(t("homes.removeConfirm")) && run(() => api.del(`/api/smarthome/connections/${h.id}`))}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {pairing && (
        <div className="mt-3 rounded-lg border border-accent bg-accent-soft/40 p-3 text-sm" role="status">
          <p className="font-semibold">{t("homes.codeFor", { name: pairing.connection.name })}</p>
          <p className="mt-2 flex items-center gap-2">
            <code className="rounded bg-card px-2 py-1 font-mono text-lg tracking-widest">{pairing.code}</code>
            <button className="btn-ghost border border-edge text-xs" onClick={() => copy(pairing.code)}>
              <Copy className="h-3.5 w-3.5" aria-hidden />
              {copied ? t("homes.copied") : t("homes.copy")}
            </button>
          </p>
          <p className="mt-1 text-xs text-muted">{t("homes.codeValid", { when: seen(pairing.expires_at) })}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
            <li>{t("homes.step1")}</li>
            <li>{t("homes.step2", { server: typeof window === "undefined" ? "" : window.location.origin })}</li>
            <li>{t("homes.step3")}</li>
          </ol>
          <p className="mt-2 text-xs text-muted">{t("homes.requiresOs")}</p>
          <p className="mt-2 text-xs text-muted">{t("homes.safety")}</p>
          <button className="btn-ghost mt-2 text-xs" onClick={() => setPairing(null)}>{t("common.close")}</button>
        </div>
      )}

      {adding ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <input className="input min-w-40 flex-1" value={name} maxLength={120} placeholder={t("homes.namePh")} aria-label={t("homes.name")} onChange={(e) => setName(e.target.value)} />
          <select className="input w-auto" value={propertyId} onChange={(e) => setPropertyId(e.target.value)} aria-label={t("homes.whichHomeNew")}>
            <option value="">{t("homes.noHome")}</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn-primary" disabled={!name.trim()} onClick={add}>{t("homes.makeCode")}</button>
          <button className="btn-ghost" onClick={() => setAdding(false)}>{t("common.cancel")}</button>
        </div>
      ) : (
        <button className="btn-ghost mt-3 border border-edge" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t("homes.addGateway")}
        </button>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
