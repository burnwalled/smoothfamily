"use client";

// The help centre (3.0.2): search, and every topic by category – only those for the apps and the
// role the member has. Each topic has a page of its own (/help/<topic>) with screenshots.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { useMe } from "@/components/Shell";
import PageTitle from "@/components/PageTitle";
import { HelpTexts, loadHelp, plainText } from "@/help";
import { CATEGORIES, TOPICS, visibleTo } from "@/help/topics";

export default function HelpPage() {
  const { t, locale } = useI18n();
  const me = useMe();
  const [texts, setTexts] = useState<HelpTexts | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadHelp(locale).then(setTexts);
  }, [locale]);

  const mine = useMemo(() => TOPICS.filter((x) => visibleTo(x, me)), [me]);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = texts && words.length ? mine.filter((x) => texts[x.id] && words.every((w) => plainText(texts[x.id]).includes(w))) : null;

  const card = (id: string) => {
    const x = TOPICS.find((y) => y.id === id)!;
    const text = texts?.[id];
    if (!text) return null;
    return (
      <li key={id}>
        <Link href={`/help/${id}`} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-base">
          <x.icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" strokeWidth={2} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{text.title}</span>
            <span className="block text-xs text-muted">{text.summary}</span>
          </span>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
        </Link>
      </li>
    );
  };

  return (
    <>
      <PageTitle title={t("help.title")} />
      <p className="mt-1 text-sm text-muted">{t("help.intro")}</p>
      <label className="relative mt-4 block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input className="input w-full pl-9" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("help.search")} aria-label={t("help.search")} />
      </label>

      {!texts ? (
        <p className="mt-6 text-sm text-muted">{t("common.loading")}</p>
      ) : hits ? (
        <section className="card mt-4 p-3" aria-label={t("help.hits")}>
          {hits.length ? <ul>{hits.map((x) => card(x.id))}</ul> : <p className="p-2 text-sm text-muted">{t("help.noHits")}</p>}
        </section>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {CATEGORIES.map((c) => {
            const here = mine.filter((x) => x.category === c.id);
            if (!here.length) return null;
            return (
              <section key={c.id} className="card p-3" aria-label={t(`help.category.${c.id}` as TranslationKey)}>
                <h2 className="mb-1 flex items-center gap-2 px-2 pt-1 text-sm font-bold uppercase tracking-wide text-muted">
                  <c.icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                  {t(`help.category.${c.id}` as TranslationKey)}
                </h2>
                <ul>{here.map((x) => card(x.id))}</ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
