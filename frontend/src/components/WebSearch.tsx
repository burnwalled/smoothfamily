"use client";

// Look something up on the web (2.8.4): a wish or gift idea to link, a manual, facts about the car,
// things to do nearby. Through the server's own search engine, only when the server admin has
// turned it on – only the search words leave the server.
import { useEffect, useState } from "react";
import { ExternalLink, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export type WebHit = { title: string; url: string; site: string; snippet: string };
export type WebSearchStatus = { enabled: boolean; place: string | null };

let cached: Promise<WebSearchStatus> | null = null;

/** Whether web search is on (asked once per page load), and the family's place for "nearby". */
export function useWebSearch(): WebSearchStatus {
  const [status, setStatus] = useState<WebSearchStatus>({ enabled: false, place: null });
  useEffect(() => {
    cached ??= api.get<WebSearchStatus>("/api/search/status").catch(() => {
      cached = null;
      return { enabled: false, place: null };
    });
    cached.then(setStatus);
  }, []);
  return status;
}

/** A hit's title without the shop or site name after it ("LEGO Technic 42151 | Lekia" → "LEGO Technic 42151"). */
export function shortTitle(title: string): string {
  return title.split(/ [|–-] /)[0].trim();
}

export default function WebSearch({
  initial,
  hint,
  placeholder,
  pickLabel,
  onPick,
  onClose,
}: {
  initial: string;
  hint: string;
  placeholder?: string;
  pickLabel?: string;
  onPick?: (hit: WebHit) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState(initial);
  const [hits, setHits] = useState<WebHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function search(words = query) {
    if (words.trim().length < 2) return;
    setBusy(true);
    setMessage("");
    try {
      const found = await api.get<WebHit[]>(`/api/search/web?q=${encodeURIComponent(words.trim())}`);
      setHits(found);
      if (found.length === 0) setMessage(t("search.noHits"));
    } catch (e) {
      setHits(null);
      setMessage(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initial.trim().length >= 2) search(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  return (
    <div className="mt-2 rounded-lg border border-edge p-3" role="region" aria-label={t("search.web")}>
      <div className="flex items-start gap-2">
        <p className="flex-1 text-xs text-muted">{hint}</p>
        <button type="button" className="text-muted hover:text-ink" onClick={onClose} aria-label={t("common.close")}>
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <input
          className="input flex-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder={placeholder}
          aria-label={t("search.words")}
        />
        <button type="button" className="btn-primary shrink-0" onClick={() => search()} disabled={busy || query.trim().length < 2} aria-label={t("search.web")}>
          <Search className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {busy && <p className="mt-2 text-sm text-muted">{t("common.loading")}</p>}
      {message && (
        <p role="status" className="mt-2 text-sm text-muted">
          {message}
        </p>
      )}
      {hits && hits.length > 0 && (
        <ul className="mt-2 max-h-80 space-y-1.5 overflow-y-auto">
          {hits.map((hit) => (
            <li key={hit.url} className="flex items-start gap-2 rounded border border-edge px-2.5 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <a href={hit.url} target="_blank" rel="noreferrer noopener" className="block truncate font-medium hover:underline">
                  {hit.title}
                </a>
                <p className="truncate text-xs text-muted">{hit.site}</p>
                {hit.snippet && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{hit.snippet}</p>}
              </div>
              <a href={hit.url} target="_blank" rel="noreferrer noopener" className="mt-1 text-accent" aria-label={t("search.open")}>
                <ExternalLink className="h-4 w-4" strokeWidth={2} />
              </a>
              {onPick && (
                <button type="button" className="btn-ghost shrink-0 border border-edge px-2.5 py-1 text-xs" onClick={() => onPick(hit)}>
                  {pickLabel ?? t("search.pick")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
