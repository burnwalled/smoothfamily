"use client";

// Server → Services → Departures (3.4.0): the API keys for the departure providers that need one.
// SL, Entur and TfL work without; Trafiklab (all of Sweden), Digitransit (Finland) and Rejseplanen
// (Denmark) need a free key. Stored encrypted; never shown again.
import { useState } from "react";
import { CircleCheck, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { setApiData, useApi } from "@/lib/query";

type Row = { id: string; name: string; area: string; key: "none" | "required" | "optional"; configured: boolean; signup: string | null };
const PATH = "/api/admin/integrations/transit";

export default function TransitKeys() {
  const { t } = useI18n();
  const rows = useApi<Row[]>(PATH).data;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  if (!rows) return null;

  async function save(provider: string, apiKey: string | null) {
    setError("");
    try {
      setApiData<Row[]>(PATH, () => undefined);
      const next = await api.put<Row[]>(PATH, { provider, api_key: apiKey });
      setApiData<Row[]>(PATH, () => next);
      setDraft((d) => ({ ...d, [provider]: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mt-6" role="group" aria-label={t("server.transit.title")}>
      <h3 className="text-sm font-semibold">{t("server.transit.title")}</h3>
      <p className="mt-1 text-xs text-muted">{t("server.transit.help")}</p>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <ul className="mt-3 divide-y divide-edge rounded-lg border border-edge">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
            <span className="min-w-[10rem] flex-1">
              <span className="font-semibold">{r.name}</span> <span className="text-muted">· {r.area}</span>
              {r.key === "optional" && <span className="block text-xs text-muted">{t("server.transit.optional")}</span>}
            </span>
            {r.key === "none" ? (
              <span className="text-xs text-muted">{t("server.transit.noKey")}</span>
            ) : r.configured ? (
              <>
                <span className="flex items-center gap-1 text-xs"><CircleCheck className="h-4 w-4 text-green-600" aria-hidden />{t("server.transit.configured")}</span>
                <button className="text-xs text-red-700 hover:underline" onClick={() => save(r.id, null)}>{t("server.transit.remove")}</button>
              </>
            ) : (
              <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void save(r.id, draft[r.id] ?? ""); }}>
                <input className="input !w-56 py-1 text-sm" type="password" autoComplete="off" aria-label={t("server.transit.keyFor", { name: r.name })} placeholder={t("server.transit.keyPh")} value={draft[r.id] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [r.id]: e.target.value }))} />
                <button className="btn-primary py-1 text-sm" type="submit" disabled={(draft[r.id] ?? "").trim().length < 8}>{t("server.transit.save")}</button>
                {r.signup && (
                  <a className="inline-flex items-center gap-1 text-xs text-accent hover:underline" href={r.signup} target="_blank" rel="noreferrer">
                    {t("server.transit.getKey")}
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                )}
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
