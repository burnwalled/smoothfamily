"use client";

// Server settings → Address and services: whether hosted families may bring their own Home
// Assistant through the gateway (2.8.4). Never directly – the server must not call into another
// family's network. Turning it off also closes their open gateways.
import { useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { setApiData, useApi } from "@/lib/query";

export default function HostedSmartHome() {
  const { t } = useI18n();
  const allowed = useApi<{ allowed: boolean }>("/api/admin/integrations/hosted-smarthome").data?.allowed ?? null;
  const setAllowed = (next: boolean) => setApiData<{ allowed: boolean }>("/api/admin/integrations/hosted-smarthome", () => ({ allowed: next }));
  const [error, setError] = useState("");

  async function change(next: boolean) {
    setError("");
    try {
      setAllowed((await api.put<{ allowed: boolean }>("/api/admin/integrations/hosted-smarthome", { allowed: next })).allowed);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  if (allowed === null) return null;
  return (
    <div className="mt-5 border-t border-edge pt-4">
      <h3 className="text-sm font-semibold">{t("server.hostedSmarthome")}</h3>
      <p className="mt-1 text-xs text-muted">{t("server.hostedSmarthomeHint")}</p>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={allowed} onChange={(e) => change(e.target.checked)} />
        {t("server.hostedSmarthomeAllow")}
      </label>
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}
