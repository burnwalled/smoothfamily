"use client";

// Server settings → Devices (3.1.0): every family's devices as kinds – phones, computers, kitchen
// displays, gateways and Home Assistant apps – on a map around the server and per family, with their
// versions and health. No names: the server admin sees what kind, not whose. A family with a device
// that isn't well can be asked to look after it, in their notification centre.
import { useCallback, useEffect, useState } from "react";
import { BellRing, Check, Cpu } from "lucide-react";
import { api } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import Topology, { HEALTH_COLOR, Health, KIND_ICON, Legend, MapNode, worst } from "@/components/devices/Topology";
import { ago } from "@/lib/ago";

type Device = { kind: string; version: string | null; latest: string | null; status: Health; last_seen: string | null; on_map: boolean };
type Family = { id: string; name: string; kind: string; devices: Device[] };
const KINDS = ["mobile", "tablet", "computer", "kiosk", "gateway", "ha_app"];

export default function ServerDevices() {
  const { t, dateLocale } = useI18n();
  const [data, setData] = useState<{ app_version: string | null; gateway_version: string | null; families: Family[] } | null>(null);
  const [told, setTold] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.get<{ app_version: string | null; gateway_version: string | null; families: Family[] }>("/api/devices/server").then(setData).catch((e) => setError(e instanceof Error ? e.message : t("common.error")));
  }, [t]);
  useEffect(load, [load]);

  async function remind(family: Family) {
    setError("");
    try {
      await api.post(`/api/devices/server/${family.id}/remind`, { kinds: [] });
      setTold((all) => new Set(all).add(family.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  if (!data) return <p className="text-sm text-muted">{error || t("common.loading")}</p>;
  const kind = (k: string) => t(`devices.kind.${k}` as TranslationKey);
  const groups = (f: Family) =>
    KINDS.map((k) => ({ kind: k, list: f.devices.filter((d) => d.kind === k && d.on_map) })).filter((g) => g.list.length);
  const nodes: MapNode[] = data.families.map((f) => {
    const kids = groups(f).map((g) => ({ id: `${f.id}-${g.kind}`, kind: g.kind, label: kind(g.kind), status: worst(g.list.map((d) => d.status)), count: g.list.length }));
    return { id: f.id, kind: "family", label: f.name, sub: t("devices.count", { n: kids.reduce((n, k) => n + (k.count ?? 0), 0) }), status: kids.length ? worst(kids.map((k) => k.status)) : "away", children: kids };
  });

  return (
    <div className="space-y-4">
      <section className="card p-5" aria-label={t("devices.serverMap")}>
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("devices.serverMap")}</h2>
        <p className="mb-2 text-xs text-muted">{t("devices.serverIntro", { app: data.app_version ?? "–", gateway: data.gateway_version ?? "–" })}</p>
        <Topology label={t("devices.serverMap")} center={t("devices.server")} nodes={nodes} />
        <Legend t={t} />
      </section>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {data.families.map((f) => {
        const unwell = f.devices.filter((d) => d.on_map && (d.status === "outdated" || d.status === "offline"));
        return (
          <section key={f.id} className="card p-5" aria-label={f.name}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-ink">{f.name}</h3>
              <span className="text-xs text-muted">{t(f.kind === "hosted" ? "server.kindHosted" : f.kind === "demo" ? "server.kindDemo" : "server.kindOwner")}</span>
              {unwell.length > 0 && (
                <button className="btn-ghost ml-auto inline-flex items-center gap-1.5 border border-edge text-sm" disabled={told.has(f.id)} onClick={() => remind(f)}>
                  {told.has(f.id) ? <Check className="h-4 w-4" aria-hidden /> : <BellRing className="h-4 w-4" aria-hidden />}
                  {told.has(f.id) ? t("devices.reminded") : t("devices.remind", { n: unwell.length })}
                </button>
              )}
            </div>
            {f.devices.length === 0 ? (
              <p className="text-sm text-muted">{t("devices.none")}</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {groups(f).map((g) => {
                  const Icon = KIND_ICON[g.kind] ?? Cpu;
                  const state = worst(g.list.map((d) => d.status));
                  const versions = [...new Set(g.list.map((d) => d.version ?? "?"))].join(", ");
                  return (
                    <li key={g.kind} className="flex items-center gap-3 rounded-lg border border-edge p-2.5">
                      <Icon className="h-5 w-5 shrink-0" style={{ color: HEALTH_COLOR[state] }} aria-hidden />
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="font-semibold">{g.list.length} × {kind(g.kind)}</span>
                        <span className="block truncate text-xs text-muted">
                          {t("devices.versions", { versions })} · {t("devices.seen", { when: ago(g.list.map((d) => d.last_seen ?? "").sort().reverse()[0] || null, dateLocale) })}
                        </span>
                      </span>
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: HEALTH_COLOR[state] }}>{t(`devices.health.${state}`)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
