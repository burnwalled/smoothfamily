"use client";

// A party's papers (3.4.0), in its typefaces and colours but on white, to save the printer: the run
// sheet of the day (with the helpers' plan, for those who may see it), the seating and place cards.
// Outside the app's frame so nothing else is printed.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Printer } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { fontFamily } from "@/lib/poster";
import { CustomTheme, customTheme, partyTheme } from "@/lib/partyThemes";

type Companion = { first_name: string; last_name: string; menu_choice?: string | null };
type Guest = { id: string; first_name: string; last_name: string; coming: boolean; pending: boolean; table_id?: string | null; companions: Companion[]; menu_choice?: string | null };
type Party = {
  title: string; starts_at: string; place: string; page_theme: string; page_custom_id: string | null; guests: Guest[]; tables: { id: string; name: string; seats: number }[];
  menu: { id: string; name: string }[]; steps: { at: string; title: string; hidden: boolean }[]; plan: { at: string; title: string; who: string; note: string; minutes: number | null; kind: string }[];
};

async function get<T>(path: string): Promise<T> {
  const resp = await fetch(path, { credentials: "same-origin", cache: "no-store" });
  if (!resp.ok) throw new Error(String(resp.status));
  return resp.json();
}

const fullName = (p: { first_name: string; last_name: string }) => `${p.first_name} ${p.last_name}`.trim();

export default function PartyPrintPage() {
  const { id, what } = useParams<{ id: string; what: string }>();
  const { t, dateLocale } = useI18n();
  const [party, setParty] = useState<Party | null>(null);
  const [own, setOwn] = useState<CustomTheme | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await get<Party>(`/api/parties/${id}`);
      if (p.page_theme === "custom") setOwn((await get<CustomTheme[]>("/api/parties/themes")).find((x) => x.id === p.page_custom_id) ?? null);
      setParty(p);
    })().catch(() => setError(true));
  }, [id]);

  if (error) return <main className="p-6 text-center text-sm text-muted">{t("common.error")}</main>;
  if (!party) return <main className="p-6 text-center text-sm text-muted">{t("common.loading")}</main>;
  const theme = party.page_theme === "custom" && own ? customTheme(own, () => "") : partyTheme(party.page_theme);
  const display = { fontFamily: fontFamily("theme-display", theme, "display"), color: theme.accentLo };
  const script = { fontFamily: fontFamily("theme-script", theme, "script"), color: theme.accentLo };
  const people = party.guests.filter((g) => g.coming || g.pending);
  const dish = (id?: string | null) => party.menu.find((m) => m.id === id)?.name ?? "";
  const seated = (table: string | null) => people.filter((g) => (table ? g.table_id === table : !party.tables.some((x) => x.id === g.table_id)));
  const rows = [
    ...party.steps.map((s) => ({ at: s.at, title: s.title, who: "", note: "", minutes: null as number | null })),
    ...party.plan.map((p) => ({ at: p.at, title: p.title, who: p.who, note: p.note, minutes: p.minutes })),
  ].sort((a, b) => (a.at || "99").localeCompare(b.at || "99"));
  const cards = people.flatMap((g) => [
    { name: fullName(g), table: party.tables.find((x) => x.id === g.table_id)?.name ?? "", dish: dish(g.menu_choice) },
    ...g.companions.map((c) => ({ name: fullName(c), table: party.tables.find((x) => x.id === g.table_id)?.name ?? "", dish: dish(c.menu_choice) })),
  ]);
  const heading = what === "run" ? t("print.run") : what === "tables" ? t("print.tables") : t("print.cards");

  return (
    <main className="min-h-screen bg-white p-8 text-neutral-900" style={{ fontFamily: fontFamily("theme-body", theme, "body") }}>
      <div className="mb-4 flex justify-end print:hidden">
        <button className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden />{t("parties.printIt")}</button>
      </div>
      <header className="mb-6 border-b-4 pb-3" style={{ borderColor: theme.accent }}>
        <h1 className="text-4xl leading-tight" style={display}>{party.title}</h1>
        <p className="text-2xl" style={script}>{heading}</p>
        <p className="text-sm text-neutral-600">{[new Date(party.starts_at).toLocaleString(dateLocale, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }), party.place].filter(Boolean).join(" · ")}</p>
      </header>

      {what === "run" && (
        rows.length ? (
          <ol className="divide-y divide-neutral-300">
            {rows.map((r, i) => (
              <li key={i} className="flex gap-4 py-2 [break-inside:avoid]">
                <span className="w-16 shrink-0 text-lg font-bold tabular-nums" style={{ color: theme.accentLo }}>{r.at}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold">{r.title}{r.minutes ? <span className="ml-2 text-sm font-normal text-neutral-600">{t("print.minutes", { n: r.minutes })}</span> : null}</span>
                  {r.who && <span className="block text-sm">{r.who}</span>}
                  {r.note && <span className="block whitespace-pre-line text-sm text-neutral-600">{r.note}</span>}
                </span>
              </li>
            ))}
          </ol>
        ) : <p>{t("print.nothing")}</p>
      )}

      {what === "tables" && (
        <div className="grid grid-cols-2 gap-6">
          {[...party.tables.map((x) => ({ id: x.id as string | null, name: x.name })), { id: null, name: t("parties.noTable") }].map((table) => {
            const here = seated(table.id);
            if (!table.id && !here.length) return null;
            return (
              <section key={table.id ?? "none"} className="[break-inside:avoid]">
                <h2 className="mb-1 border-b pb-1 text-2xl" style={{ ...display, borderColor: theme.accent }}>{table.name}</h2>
                <ul className="text-base">{here.flatMap((g) => [fullName(g), ...g.companions.map(fullName)]).map((n, i) => <li key={i}>{n}</li>)}</ul>
              </section>
            );
          })}
        </div>
      )}

      {what === "cards" && (
        <div className="grid grid-cols-2 gap-3">
          {cards.map((c, i) => (
            <div key={i} className="flex h-36 flex-col items-center justify-center rounded-lg border-2 p-3 text-center [break-inside:avoid]" style={{ borderColor: theme.accent }}>
              <span className="text-3xl leading-tight" style={script}>{c.name}</span>
              {(c.table || c.dish) && <span className="mt-2 text-sm text-neutral-600">{[c.table, c.dish].filter(Boolean).join(" · ")}</span>}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
