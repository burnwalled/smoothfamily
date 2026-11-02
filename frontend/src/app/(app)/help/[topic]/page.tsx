"use client";

// One help topic (3.0.2): what it is, steps, good to know and screenshots from the demo family in
// the reader's language – with a way into the app it is about and to related topics.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronDown, Info, Lightbulb } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/components/Shell";
import PageTitle from "@/components/PageTitle";
import { HelpTexts, loadHelp } from "@/help";
import { topic, visibleTo } from "@/help/topics";
import type { Block } from "@/help/types";

function Blocks({ blocks, locale, tipsLabel }: { blocks: Block[]; locale: string; tipsLabel: string }) {
  return (
    <>
      {blocks.map((b, i) => {
        if ("p" in b) return <p key={i} className="mt-3 text-sm leading-relaxed">{b.p}</p>;
        if ("h" in b) return <h2 key={i} className="mt-6 text-base font-bold">{b.h}</h2>;
        if ("steps" in b)
          return (
            <ol key={i} className="mt-3 list-decimal space-y-1.5 pl-5 text-sm">
              {b.steps.map((s) => <li key={s}>{s}</li>)}
            </ol>
          );
        if ("tips" in b)
          return (
            <div key={i} className="mt-4 rounded-lg bg-base px-4 py-3">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
                <Lightbulb className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                {tipsLabel}
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{b.tips.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          );
        if ("note" in b)
          return (
            <p key={i} className="mt-4 flex gap-2 rounded-lg border border-edge px-4 py-3 text-sm text-muted">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {b.note}
            </p>
          );
        if ("shot" in b)
          return (
            <figure key={i} className="mt-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/help/${locale}/${b.shot}.webp`} alt={b.caption} loading="lazy" className="mx-auto max-h-[560px] rounded-xl border border-edge shadow-soft" />
              <figcaption className="mt-1.5 text-center text-xs text-muted">{b.caption}</figcaption>
            </figure>
          );
        return (
          <div key={i} className="mt-4 space-y-2">
            {b.details.map((d) => (
              <details key={d.title} className="group rounded-lg border border-edge px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
                  {d.title}
                  <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" strokeWidth={2} aria-hidden />
                </summary>
                <Blocks blocks={d.blocks} locale={locale} tipsLabel={tipsLabel} />
              </details>
            ))}
          </div>
        );
      })}
    </>
  );
}

export default function HelpTopicPage() {
  const { t, locale } = useI18n();
  const me = useMe();
  const { topic: id } = useParams<{ topic: string }>();
  const [texts, setTexts] = useState<HelpTexts | null>(null);

  useEffect(() => {
    loadHelp(locale).then(setTexts);
  }, [locale]);

  const meta = topic(id);
  const text = texts?.[id];
  const back = (
    <Link href="/help" className="btn-ghost -ml-2 inline-flex items-center gap-1 px-2 text-sm">
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {t("help.title")}
    </Link>
  );
  if (!texts) return <p className="text-sm text-muted">{t("common.loading")}</p>;
  if (!meta || !text)
    return (
      <>
        {back}
        <p className="mt-4 text-sm text-muted">{t("help.notFound")}</p>
      </>
    );

  const related = (meta.related ?? []).map(topic).filter((x): x is NonNullable<typeof x> => !!x && visibleTo(x, me) && !!texts[x.id]);
  const open = meta.paths?.[0];
  return (
    <article className="mx-auto max-w-2xl">
      {back}
      <PageTitle title={text.title} icon={meta.icon} className="mt-2" />
      <p className="mt-1 text-sm text-muted">{text.summary}</p>
      {open && visibleTo(meta, me) && !open.includes("[") && (
        <Link href={open} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
          {t("help.open")}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
      <Blocks blocks={text.blocks} locale={locale} tipsLabel={t("help.tipsLabel")} />
      {related.length > 0 && (
        <nav className="mt-8 border-t border-edge pt-4" aria-label={t("help.related")}>
          <p className="text-xs font-bold uppercase tracking-wide text-muted">{t("help.related")}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {related.map((x) => (
              <li key={x.id}>
                <Link href={`/help/${x.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-edge px-3 py-1 text-sm hover:bg-base">
                  <x.icon className="h-4 w-4 text-accent" aria-hidden />
                  {texts[x.id].title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </article>
  );
}
