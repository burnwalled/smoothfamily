"use client";

// Who is home (#60), from Home Assistant. Only members who chose to share are shown, only as home,
// away or on the way home – never where. The admin links members to Home Assistant people; each
// member decides in the profile. Only available with the family's own Home Assistant connection.
import { useCallback, useEffect, useState } from "react";
import { Car, House, MapPinOff } from "lucide-react";
import { api, Me, PresenceLinks, PresenceOut } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/components/Shell";
import { useLive } from "@/lib/live";

function usePresence() {
  const [presence, setPresence] = useState<PresenceOut | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    api.live<PresenceOut>("/api/presence", setPresence).catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);
  useLive(["presence"], load);
  return { presence, setPresence, failed };
}

/** The Today card. */
export function PresenceWidget() {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  const { presence, failed } = usePresence();
  if (!me.smarthome_available || failed) return <p className="text-sm text-muted">{t("presence.needsHa")}</p>;
  if (!presence) return <p className="text-sm text-muted">{t("common.loading")}</p>;
  if (!presence.available) return <p className="text-sm text-muted">{t("presence.needsHa")}</p>;
  if (presence.members.length === 0) return <p className="text-sm text-muted">{t("presence.nobodyShares")}</p>;
  const icon = { home: House, travel: Car, away: MapPinOff, unknown: MapPinOff };
  return (
    <ul className="space-y-1.5">
      {presence.members.map((m) => {
        const Icon = icon[m.state as keyof typeof icon] ?? MapPinOff;
        return (
          <li key={m.user_id} className="flex items-center gap-2 text-sm">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: m.color }}>
              {m.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="font-semibold">{m.name}</span>
            <span className={`ml-auto flex items-center gap-1 text-xs ${m.state === "home" ? "font-semibold text-green-700" : m.state === "travel" ? "font-semibold text-accent" : "text-muted"}`}>
              <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {t(`presence.state.${m.state}` as "presence.state.home")}
              {m.state === "home" && m.since && ` · ${new Date(m.since).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The member's own choice, under Profile – shown only with Home Assistant. */
export function PresenceSetting({ me }: { me: Me }) {
  const { t } = useI18n();
  const { presence, setPresence } = usePresence();
  const [error, setError] = useState("");
  if (!me.smarthome_available || !presence?.available) return null;

  async function choose(share: string) {
    setError("");
    try {
      setPresence(await api.put<PresenceOut>("/api/presence/me", { share }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  return (
    <section className="card mt-4 p-5">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("presence.title")}</h2>
      <p className="mb-3 text-xs text-muted">{t("presence.help")}</p>
      {!presence.linked ? (
        <p className="text-sm text-muted">{t("presence.notLinked")}</p>
      ) : (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("presence.title")}>
          {(["off", "home", "travel"] as const).map((share) => (
            <button
              key={share}
              role="radio"
              aria-checked={presence.share === share}
              className={`rounded-lg border px-3 py-2 text-sm ${presence.share === share ? "border-primary-700 font-semibold ring-1 ring-primary-700" : "border-edge"}`}
              onClick={() => choose(share)}
            >
              {t(`presence.share.${share}` as "presence.share.off")}
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}

/** Family admin → Smart home: link members to Home Assistant people. */
export function PresenceLinksSettings() {
  const { t } = useI18n();
  const [links, setLinks] = useState<PresenceLinks | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<PresenceLinks>("/api/presence/links").then(setLinks).catch((e) => setError(e instanceof Error ? e.message : t("common.error")));
  }, [t]);

  async function link(userId: string, person: string, travel: string) {
    setError("");
    try {
      setLinks(await api.put<PresenceLinks>(`/api/presence/links/${userId}`, { person_entity: person || null, travel_entity: travel || null }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  return (
    <section className="card mt-4 p-5">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("presence.linksTitle")}</h2>
      <p className="mb-3 text-xs text-muted">{t("presence.linksHelp")}</p>
      {error && <p className="mb-2 text-sm text-red-700">{error}</p>}
      {!links ? (
        !error && <p className="text-sm text-muted">{t("common.loading")}</p>
      ) : links.people.length === 0 ? (
        <p className="text-sm text-muted">{t("presence.noPeople")}</p>
      ) : (
        <ul className="space-y-2">
          {links.members.map((m) => (
            <li key={m.user_id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-28 shrink-0 font-semibold">{m.name}</span>
              <select
                className="input w-auto"
                value={m.person_entity ?? ""}
                onChange={(e) => link(m.user_id, e.target.value, m.travel_entity ?? "")}
                aria-label={t("presence.personFor", { name: m.name })}
              >
                <option value="">{t("presence.notLinkedOption")}</option>
                {links.people.map((p) => <option key={p.entity_id} value={p.entity_id}>{p.name}</option>)}
              </select>
              {m.person_entity && links.travel_sensors.length > 0 && (
                <select
                  className="input w-auto"
                  value={m.travel_entity ?? ""}
                  onChange={(e) => link(m.user_id, m.person_entity ?? "", e.target.value)}
                  aria-label={t("presence.travelFor", { name: m.name })}
                >
                  <option value="">{t("presence.noTravel")}</option>
                  {links.travel_sensors.map((p) => <option key={p.entity_id} value={p.entity_id}>{p.name}</option>)}
                </select>
              )}
              {m.person_entity && <span className="text-xs text-muted">{t(`presence.share.${m.share}` as "presence.share.off")}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
