"use client";

// A person's wish list and the gift planning (2.8.2, in Lists): the wish list is filled in by the
// person (or an adult for them) and others mark "I'm buying this" – never shown to the person; it
// can be shared with relatives through a link. The gift planning is the adults' secret: ideas and
// who is buying what, never shown to the person it is for.
import { useEffect, useState } from "react";
import { Copy, ExternalLink, Lightbulb, Link2, Plus, Search, Trash2 } from "lucide-react";
import { api, Person, Wish, WishShare } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { NONE, refreshApi, useApi } from "@/lib/query";
import { useMe } from "@/components/Shell";
import { when } from "@/components/birthdays/People";
import WebSearch, { shortTitle, useWebSearch } from "@/components/WebSearch";

// A person's wishes from the cache; a change to them (here or elsewhere) refreshes it by itself.
function useWishes(personId: string) {
  const path = `/api/birthdays/people/${personId}/wishes`;
  const wishes = useApi<Wish[]>(path).data ?? NONE;
  return [wishes, () => void refreshApi(path)] as const;
}

function useRun(setError: (e: string) => void, reload: () => void) {
  const { t } = useI18n();
  return async (action: () => Promise<unknown>) => {
    setError("");
    try {
      await action();
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  };
}

function Heading({ person, title }: { person: Person; title: string }) {
  const { t } = useI18n();
  return (
    <div>
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="text-xs text-muted">
        {when(person, t)}
        {person.turns !== null ? ` · ${t("birthdays.turns", { n: person.turns })}` : ""}
      </p>
    </div>
  );
}

export function WishList({ person }: { person: Person }) {
  const { t } = useI18n();
  const me = useMe();
  const isAdult = me.role !== "child";
  const isOwner = person.user_id === me.id;
  const [wishes, loadWishes] = useWishes(person.id);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const run = useRun(setError, loadWishes);
  const canSearch = useWebSearch().enabled;
  const [searching, setSearching] = useState(false);

  async function add() {
    if (!title.trim()) return;
    await run(() => api.post(`/api/birthdays/people/${person.id}/wishes`, { kind: "wish", title: title.trim(), url: url.trim() || null }));
    setTitle("");
    setUrl("");
    setSearching(false);
  }

  const own = wishes.filter((w) => w.kind === "wish");
  return (
    <>
      <Heading person={person} title={t("lists.wishListOf", { name: person.name })} />
      {isOwner && <p className="mt-1 text-xs text-muted">{t("birthdays.ownHint")}</p>}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {own.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t("birthdays.noWishes")}</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {own.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-edge px-3 py-2 text-sm">
              <span className={`min-w-0 flex-1 ${w.reserved && !w.reserved_by_me ? "text-muted line-through" : ""}`}>
                {w.title}
                {w.url && (
                  <a href={w.url} target="_blank" rel="noreferrer noopener" className="ml-1.5 inline-flex align-[-2px] text-accent" aria-label={t("birthdays.openLink")}>
                    <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
                  </a>
                )}
              </span>
              {w.reserved === null ? null : w.reserved_by_me ? (
                <button className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold" onClick={() => run(() => api.del(`/api/birthdays/wishes/${w.id}/reserve`))}>
                  {t("birthdays.youAreBuying")} · {t("birthdays.undo")}
                </button>
              ) : w.reserved ? (
                <span className="text-xs text-muted">{t("birthdays.reservedBy", { name: w.reserved_by_name ?? "?" })}</span>
              ) : (
                <button className="btn-ghost border border-edge px-2.5 py-1 text-xs" onClick={() => run(() => api.post(`/api/birthdays/wishes/${w.id}/reserve`))}>
                  {t("birthdays.illBuy")}
                </button>
              )}
              {w.can_edit && (
                <button className="text-muted hover:text-red-700" onClick={() => run(() => api.del(`/api/birthdays/wishes/${w.id}`))} aria-label={t("common.remove")}>
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {(isOwner || isAdult) && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input className="input min-w-40 flex-1" placeholder={t("birthdays.wishPh")} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} aria-label={t("birthdays.wishPh")} />
          <input className="input min-w-40 flex-1" placeholder={t("birthdays.linkPh")} value={url} onChange={(e) => setUrl(e.target.value)} aria-label={t("birthdays.linkPh")} />
          {canSearch && (
            <button className="btn-ghost border border-edge" onClick={() => setSearching(true)} aria-expanded={searching}>
              <Search className="h-4 w-4" strokeWidth={2} aria-hidden />
              {t("search.web")}
            </button>
          )}
          <button className="btn-primary" onClick={add} disabled={!title.trim()}>
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            {t("common.add")}
          </button>
        </div>
      )}
      {searching && (
        <WebSearch
          initial={title}
          hint={t("birthdays.searchHint")}
          placeholder={t("birthdays.searchPh")}
          onClose={() => setSearching(false)}
          onPick={(hit) => {
            setUrl(hit.url);
            if (!title.trim()) setTitle(shortTitle(hit.title));
            setSearching(false);
          }}
        />
      )}
      {isAdult && <ShareLinks personId={person.id} name={person.name} />}
    </>
  );
}

export function GiftPlan({ person }: { person: Person }) {
  const { t } = useI18n();
  const [wishes, loadWishes] = useWishes(person.id);
  const [idea, setIdea] = useState("");
  const [ideaUrl, setIdeaUrl] = useState("");
  const [error, setError] = useState("");
  const run = useRun(setError, loadWishes);
  const canSearch = useWebSearch().enabled;
  const [searching, setSearching] = useState(false);

  async function add() {
    if (!idea.trim()) return;
    await run(() => api.post(`/api/birthdays/people/${person.id}/wishes`, { kind: "idea", title: idea.trim(), url: ideaUrl.trim() || null }));
    setIdea("");
    setIdeaUrl("");
    setSearching(false);
  }

  const ideas = wishes.filter((w) => w.kind === "idea");
  const bought = wishes.filter((w) => w.kind === "wish" && w.reserved);
  return (
    <>
      <Heading person={person} title={t("lists.giftPlanOf", { name: person.name })} />
      <p className="mt-1 text-xs text-muted">{t("lists.giftPlanHint", { name: person.name })}</p>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">{t("lists.whoBuysWhat")}</h3>
      {bought.length === 0 ? (
        <p className="mt-1 text-sm text-muted">{t("lists.nothingBought")}</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm">
          {bought.map((w) => (
            <li key={w.id} className="flex items-center gap-2">
              <span className="flex-1">{w.title}</span>
              <span className="text-xs text-muted">{w.reserved_by_me ? t("birthdays.youAreBuying") : t("birthdays.reservedBy", { name: w.reserved_by_name ?? "?" })}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 rounded-lg border border-dashed border-edge p-3">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <Lightbulb className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {t("birthdays.ideas")}
        </h3>
        <ul className="mt-2 space-y-1">
          {ideas.map((w) => (
            <li key={w.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1">
                {w.title}
                {w.url && (
                  <a href={w.url} target="_blank" rel="noreferrer noopener" className="ml-1.5 inline-flex align-[-2px] text-accent" aria-label={t("birthdays.openLink")}>
                    <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
                  </a>
                )}
              </span>
              <button className="text-muted hover:text-red-700" onClick={() => run(() => api.del(`/api/birthdays/wishes/${w.id}`))} aria-label={t("common.remove")}>
                <Trash2 className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <input className="input min-w-40 flex-1" placeholder={t("birthdays.ideaPh")} value={idea} onChange={(e) => setIdea(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} aria-label={t("birthdays.ideaPh")} />
          <input className="input min-w-40 flex-1" placeholder={t("birthdays.linkPh")} value={ideaUrl} onChange={(e) => setIdeaUrl(e.target.value)} aria-label={t("birthdays.ideaLink")} />
          {canSearch && (
            <button className="btn-ghost border border-edge" onClick={() => setSearching(true)} aria-expanded={searching}>
              <Search className="h-4 w-4" strokeWidth={2} aria-hidden />
              {t("search.web")}
            </button>
          )}
          <button className="btn-ghost border border-edge" onClick={add} disabled={!idea.trim()}>
            {t("common.add")}
          </button>
        </div>
        {searching && (
          <WebSearch
            initial={idea}
            hint={t("birthdays.ideaSearchHint")}
            placeholder={t("birthdays.searchPh")}
            onClose={() => setSearching(false)}
            onPick={(hit) => {
              setIdeaUrl(hit.url);
              if (!idea.trim()) setIdea(shortTitle(hit.title));
              setSearching(false);
            }}
          />
        )}
      </div>
    </>
  );
}

// Adults: share the wish list with relatives outside the app (grandparents …) through a link.
export function ShareLinks({ personId, name }: { personId: string; name: string }) {
  const { t, dateLocale } = useI18n();
  const shares = useApi<WishShare[]>(`/api/birthdays/people/${personId}/shares`).data ?? NONE;
  const [days, setDays] = useState(90);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => setLink(null), [personId]);

  const active = shares.filter((s) => !s.revoked_at && new Date(s.expires_at) > new Date());
  const when = (iso: string) => new Date(iso).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="mt-5 rounded-lg border border-edge p-3">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        <Link2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {t("share.heading")}
      </h3>
      <p className="mt-1 text-xs text-muted">{t("share.hint", { name })}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <select className="input w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label={t("server.lifetime")}>
          {[30, 90, 365].map((d) => <option key={d} value={d}>{t("server.validDays", { n: d })}</option>)}
        </select>
        <button
          className="btn-ghost border border-edge"
          onClick={async () => {
            const created = await api.post<WishShare & { url: string }>(`/api/birthdays/people/${personId}/shares`, { days });
            setLink(created.url.startsWith("http") ? created.url : `${window.location.origin}${created.url}`);
            setCopied(false);
          }}
        >
          {t("share.create")}
        </button>
      </div>
      {link && (
        <div className="mt-2 flex gap-2">
          <input className="input flex-1 font-mono text-xs" readOnly value={link} onFocus={(e) => e.target.select()} aria-label={t("server.link")} />
          <button className="btn-ghost border border-edge" onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true))}>
            <Copy className="h-4 w-4" strokeWidth={2} aria-hidden />
            {copied ? t("server.copied") : t("server.copy")}
          </button>
        </div>
      )}
      {link && <p className="mt-1 text-xs text-muted">{t("server.linkOnce")}</p>}
      {active.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {active.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <span className="flex-1 text-muted">{t("share.activeUntil", { date: when(s.expires_at) })}</span>
              <button className="text-red-700 underline" onClick={() => api.del(`/api/birthdays/shares/${s.id}`)}>{t("server.revoke")}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
