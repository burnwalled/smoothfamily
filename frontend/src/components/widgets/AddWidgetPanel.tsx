"use client";

// Picker shown in dashboard edit mode: built-in widgets plus an SL stop
// search for adding departure boards.
import { useEffect, useState } from "react";
import { api, FamilyList, SlSite, WidgetType } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";
import { Bus, ShoppingBasket } from "lucide-react";
import { useMe } from "@/components/Shell";
import { widgetAllowed } from "@/lib/nav";

const BUILT_IN: WidgetType[] = ["calendar_today", "tasks_today", "leaderboard", "family_goals", "smart_home", "chat_unread", "waste_collection", "school_lunch", "weather", "presence", "electricity", "memories", "pantry_soon", "upcoming", "custody", "school"];

export default function AddWidgetPanel({
  onAdd,
}: {
  onAdd: (type: WidgetType, config?: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  const me = useMe();
  const apps = me.apps ?? [];
  // Presence needs the family's own Home Assistant.
  const smarthome = me.smarthome_available;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SlSite[]>([]);
  const [searched, setSearched] = useState(false);
  const lists = useApi<FamilyList[]>(apps.includes("lists") ? "/api/lists" : null).data ?? NONE;

  // Debounced stop search.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    const timer = setTimeout(() => {
      api
        .get<SlSite[]>(`/api/transit/sl/sites?q=${encodeURIComponent(query.trim())}`)
        .then((sites) => {
          setResults(sites);
          setSearched(true);
        })
        .catch(() => {
          setResults([]);
          setSearched(true);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="card p-5 space-y-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("dashboard.addWidget")}</h2>
      <div className="flex flex-wrap gap-2">
        {BUILT_IN.filter((type) => widgetAllowed(type, apps) && ((type !== "presence" && type !== "school") || smarthome)).map((type) => (
          <button key={type} className="btn-ghost border border-edge" onClick={() => onAdd(type)}>
            {t(`widget.${type}`)}
          </button>
        ))}
      </div>
      {apps.includes("lists") && (
      <div>
        <label className="label inline-flex items-center gap-1.5">
          <ShoppingBasket className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {t("widget.shopping_list")}
        </label>
        {lists.length === 0 ? (
          <p className="text-xs text-muted">{t("lists.empty")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {lists.map((list) => (
              <button
                key={list.id}
                className="btn-ghost border border-edge"
                onClick={() => onAdd("shopping_list", { list_id: list.id, list_name: list.name })}
              >
                {list.name}
              </button>
            ))}
          </div>
        )}
      </div>
      )}
      <div>
        <label className="label inline-flex items-center gap-1.5">
          <Bus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {t("widget.sl_departures")}
        </label>
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("sl.searchPh")}
        />
        {searched && results.length === 0 && (
          <p className="mt-2 text-xs text-muted">{t("sl.noResults")}</p>
        )}
        {results.length > 0 && (
          <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-edge divide-y divide-edge">
            {results.map((site) => (
              <li key={site.id}>
                <button
                  className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-base"
                  onClick={() => {
                    onAdd("sl_departures", { site_id: site.id, site_name: site.name });
                    setQuery("");
                    setResults([]);
                    setSearched(false);
                  }}
                >
                  <span>{site.name}</span>
                  <span className="text-xs text-muted">{t("common.add")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
