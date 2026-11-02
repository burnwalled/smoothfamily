"use client";

// Family settings → Devices (3.1.0): what is connected with the family's account – the members'
// phones and computers, the kitchen displays and the gateways – on a map around the server and in a
// list, each with its health and what to do when it isn't well. Gone for more than 7 days, a device
// leaves the map; an old one can be forgotten.
import { Cpu, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { ago } from "@/lib/ago";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { useApi } from "@/lib/query";
import Topology, { HEALTH_COLOR, Health, KIND_ICON, Legend, MapNode, worst } from "@/components/devices/Topology";

type Device = {
  id: string;
  kind: string;
  name: string;
  member_id: string | null;
  member_name: string | null;
  member_color: string | null;
  version: string | null;
  latest: string | null;
  last_seen: string | null;
  status: Health;
  on_map: boolean;
  forgettable: boolean;
};
const ORDER: Record<Health, number> = { offline: 0, outdated: 1, ok: 2, away: 3 };

export default function DevicesSettingsPage() {
  const { t, dateLocale } = useI18n();
  // From the cache, read again every minute (who is online changes without anyone writing anything).
  const query = useApi<{ app_version: string | null; devices: Device[] }>("/api/devices", { refetchInterval: 60_000 });
  const data = query.data ?? null;
  const error = query.isError && !data ? query.error.message : "";

  if (!data) return <p className="text-sm text-muted">{error || t("common.loading")}</p>;
  const kind = (k: string) => t(`devices.kind.${k}` as TranslationKey);
  const devices = [...data.devices].sort((a, b) => ORDER[a.status] - ORDER[b.status] || (b.last_seen ?? "").localeCompare(a.last_seen ?? ""));
  const shown = devices.filter((d) => d.on_map);
  // Each member with their devices around them; the kitchen displays and gateways on their own.
  const mapNodes = (list: Device[]): MapNode[] => {
    const people = [...new Set(list.filter((d) => d.member_id).map((d) => d.member_id as string))];
    return [
      ...people.map((id) => {
        const theirs = list.filter((d) => d.member_id === id);
        return {
          id, kind: "person", label: theirs[0].member_name ?? "", sub: t("devices.count", { n: theirs.length }), status: worst(theirs.map((d) => d.status)),
          children: theirs.map((d) => ({ id: d.id, kind: d.kind, label: d.name, status: d.status })),
        };
      }),
      ...list.filter((d) => !d.member_id).map((d) => ({ id: d.id, kind: d.kind, status: d.status, label: d.name, sub: kind(d.kind) })),
    ];
  };
  const unwell = devices.filter((d) => d.on_map && (d.status === "offline" || d.status === "outdated"));
  const what = (d: Device) =>
    d.status === "outdated"
      ? t(d.kind === "gateway" || d.kind === "ha_app" ? "devices.fix.gateway" : "devices.fix.app", { version: d.latest ?? "" })
      : d.status === "offline"
        ? t(d.kind === "kiosk" ? "devices.fix.kiosk" : "devices.fix.gatewayOffline")
        : "";

  return (
    <div className="space-y-4">
      <section className="card p-5" aria-label={t("devices.mapTitle")}>
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("devices.mapTitle")}</h2>
        <p className="mb-2 text-xs text-muted">{t("devices.intro")}</p>
        <p className={`mb-2 text-sm font-semibold ${unwell.length ? "text-amber-700" : "text-green-700"}`}>
          {unwell.length ? t("devices.unwell", { n: unwell.length }) : t("devices.allWell")}
        </p>
        {shown.length === 0 ? (
          <p className="text-sm text-muted">{t("devices.none")}</p>
        ) : (
          <Topology
            label={t("devices.mapTitle")}
            center={t("devices.server")}
            nodes={mapNodes(shown)}
          />
        )}
        <Legend t={t} />
      </section>

      <section className="card p-5" aria-label={t("devices.listTitle")}>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("devices.listTitle")}</h2>
        <ul className="divide-y divide-edge">
          {devices.map((d) => {
            const Icon = KIND_ICON[d.kind] ?? Cpu;
            return (
              <li key={d.id} className={`flex flex-wrap items-center gap-3 py-2.5 ${d.on_map ? "" : "opacity-60"}`}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-base" style={{ color: HEALTH_COLOR[d.status] }}>
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{d.name}</span>
                    {d.member_name && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: d.member_color ?? "#888" }}>{d.member_name}</span>
                    )}
                  </span>
                  <span className="block text-xs text-muted">
                    {kind(d.kind)} · {d.version ? t("devices.version", { version: d.version }) : t("devices.versionUnknown")} · {t("devices.seen", { when: ago(d.last_seen, dateLocale) })}
                  </span>
                  {what(d) && <span className="mt-0.5 block text-xs font-semibold text-amber-700">{what(d)}</span>}
                </span>
                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white" style={{ background: HEALTH_COLOR[d.status] }}>{t(`devices.health.${d.status}`)}</span>
                {d.forgettable && (
                  <button className="btn-ghost p-1.5 text-muted" onClick={() => confirm(t("devices.forgetConfirm", { name: d.name })) && api.del(`/api/devices/${d.id}`)} aria-label={t("devices.forget", { name: d.name })}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted">{t("devices.privacy")}</p>
      </section>
    </div>
  );
}
