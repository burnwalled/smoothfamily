"use client";

// The simulated Home Assistant's control panel (demo and trying things out): move the family's
// people home, away or "on the way home" to see who's home and presence flows react. Shown only
// when the family uses the simulated home.
import { useState } from "react";
import { Car, FlaskConical, House, MapPinOff } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { setApiData, useApi } from "@/lib/query";
import { useMe } from "@/components/Shell";

type SimPerson = { entity_id: string; name: string; state: string; direction: string };

export default function HaSimulator() {
  const { t } = useI18n();
  const me = useMe();
  const adult = me.role === "admin" || me.role === "adult";
  // Not a simulated home: 404, and the panel stays away. Moving someone (smarthome) or a live
  // presence event refreshes it.
  const people = useApi<SimPerson[]>("/api/smarthome/simulator").data ?? null;
  const [error, setError] = useState("");


  if (!people) return null;

  async function move(person: SimPerson, state: "home" | "not_home", direction: string | null) {
    setError("");
    try {
      const next = await api.post<SimPerson[]>("/api/smarthome/simulator/people", { entity_id: person.entity_id, state, direction });
      setApiData<SimPerson[]>("/api/smarthome/simulator", () => next);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  const where = (p: SimPerson) => (p.state === "home" ? "home" : p.direction === "towards" ? "travel" : "away");
  return (
    <section className="mb-6 rounded-lg border border-dashed border-accent/50 bg-accent-soft/40 p-4" aria-label={t("sim.title")}>
      <h2 className="flex items-center gap-2 text-sm font-bold">
        <FlaskConical className="h-4 w-4 text-accent" strokeWidth={2} aria-hidden />
        {t("sim.title")}
      </h2>
      <p className="mt-1 text-xs text-muted">{t("sim.help")}</p>
      {adult && (
        <ul className="mt-3 space-y-1.5">
          {people.map((p) => (
            <li key={p.entity_id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-20 shrink-0 font-semibold">{p.name}</span>
              {([
                ["home", House, () => move(p, "home", "stationary")],
                ["away", MapPinOff, () => move(p, "not_home", "away_from")],
                ["travel", Car, () => move(p, "not_home", "towards")],
              ] as const).map(([key, Icon, onClick]) => (
                <button
                  key={key}
                  aria-pressed={where(p) === key}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${where(p) === key ? "border-primary-700 bg-surface font-semibold" : "border-edge text-muted"}`}
                  onClick={onClick}
                  aria-label={t("sim.move", { name: p.name, where: t(`presence.state.${key}`) })}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  {t(`presence.state.${key}`)}
                </button>
              ))}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </section>
  );
}
