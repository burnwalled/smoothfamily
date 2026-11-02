"use client";

// Family admin → Smart home: the Home Assistant connection and which devices exist and who may
// use them. Linked from the Smart home app ("Manage devices").
import { useState } from "react";
import Homes, { useHomes } from "@/components/smarthome/Homes";
import { CircleCheck, FlaskConical } from "lucide-react";
import { api, Member, SmarthomeConnection, SmarthomeDevice } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { NONE, setApiData, useApi } from "@/lib/query";
import SmartHomeDevices from "@/components/SmartHomeDevices";
import { SmartHomeUnavailable } from "@/components/widgets/SmartHomeWidget";
import { useMe } from "@/components/Shell";
import { PresenceLinksSettings } from "@/components/Presence";

export default function SmartHomeSettingsPage() {
  const me = useMe();
  if (!me.smarthome_available) return <SmartHomeUnavailable />;
  return <SmartHomeSettings />;
}

function SmartHomeSettings() {
  const { t } = useI18n();
  const me = useMe();
  // From the cache: connecting, adding a device or a home (all under /api/smarthome) refreshes it.
  const members = useApi<Member[]>("/api/family/members").data ?? NONE;
  const haConn = useApi<SmarthomeConnection | null>("/api/smarthome/connection").data ?? null;
  const setHaConn = (conn: SmarthomeConnection | null) => setApiData<SmarthomeConnection | null>("/api/smarthome/connection", () => conn);
  const [haUrl, setHaUrl] = useState("");
  const [haToken, setHaToken] = useState("");
  const [haConnecting, setHaConnecting] = useState(false);
  const [haError, setHaError] = useState("");
  const haDevices = useApi<SmarthomeDevice[]>("/api/smarthome/devices").data ?? NONE;
  const homes = useHomes();

  async function connect() {
    setHaError("");
    setHaConnecting(true);
    try {
      const conn = await api.put<SmarthomeConnection>("/api/smarthome/connection", { base_url: haUrl, token: haToken });
      setHaConn(conn);
      setHaUrl("");
      setHaToken("");
    } catch (e) {
      setHaError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setHaConnecting(false);
    }
  }

  if (me.smarthome_gateway_only) {
    return (
      <>
        <p className="text-sm text-muted">{t("homes.hostedHint")}</p>
        {homes.length > 0 && (
          <section className="card p-5">
            <SmartHomeDevices devices={haDevices} members={members} homes={homes} />
          </section>
        )}
        <Homes homes={homes} />
      </>
    );
  }

  return (
    <>
    <section className="card p-5">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("smarthome.title")}</h2>
      {haConn ? (
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm">
            <CircleCheck className="h-4 w-4 text-green-600" strokeWidth={2} aria-hidden />
            {haConn.simulated ? t("sim.connected") : <>{t("smarthome.connected")} <span className="text-muted text-xs">({haConn.base_url})</span></>}
          </span>
          <button
            className="text-xs text-red-700 hover:underline"
            onClick={async () => {
              await api.del("/api/smarthome/connection");
              setHaConn(null);
            }}
          >
            {t("common.remove")}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted">{t("smarthome.connectHelp")}</p>
          <div className="grid gap-2 md:grid-cols-3">
            <input className="input" placeholder={t("smarthome.urlPh")} value={haUrl} onChange={(e) => setHaUrl(e.target.value)} />
            <input className="input" placeholder={t("smarthome.tokenPh")} type="password" value={haToken} onChange={(e) => setHaToken(e.target.value)} />
            <button className="btn-primary" disabled={!haUrl || !haToken || haConnecting} onClick={connect}>
              {haConnecting ? t("common.loading") : t("smarthome.connect")}
            </button>
          </div>
          {haError && <p className="text-xs text-red-700">{haError}</p>}
          <div className="mt-3 border-t border-edge pt-3">
            <p className="text-xs text-muted">{t("sim.offer")}</p>
            <button
              className="btn-ghost mt-2 flex items-center gap-1.5 border border-edge"
              onClick={async () => {
                setHaError("");
                try {
                  setHaConn(await api.post<SmarthomeConnection>("/api/smarthome/connection/simulated", {}));
                } catch (e) {
                  setHaError(e instanceof Error ? e.message : t("common.error"));
                }
              }}
            >
              <FlaskConical className="h-4 w-4" strokeWidth={2} aria-hidden />
              {t("sim.use")}
            </button>
          </div>
        </div>
      )}

      {(haConn || homes.length > 0) && <SmartHomeDevices devices={haDevices} members={members} homes={homes} />}
    </section>
    <Homes homes={homes} />
    {haConn && <PresenceLinksSettings />}
    </>
  );
}
