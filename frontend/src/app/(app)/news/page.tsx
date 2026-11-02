"use client";

// What's new: short release notes for every update, newest first.
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { LATEST_VERSION, markSeen, RELEASE_NOTES, seenVersion } from "@/lib/releaseNotes";

export default function NewsPage() {
  const { t, locale, dateLocale } = useI18n();
  // Versions newer than what this device had seen get a "New" badge on this visit.
  const [previouslySeen, setPreviouslySeen] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setPreviouslySeen(seenVersion());
    markSeen(LATEST_VERSION);
    window.dispatchEvent(new Event("sf:whats-new-seen"));
  }, []);

  const seenIndex = previouslySeen ? RELEASE_NOTES.findIndex((r) => r.version === previouslySeen) : -1;

  return (
    <>
      <h1 className="flex min-h-10 items-center gap-2 text-2xl font-extrabold tracking-tight">
        <Sparkles className="h-6 w-6 text-accent" strokeWidth={2} aria-hidden />
        {t("news.title")}
      </h1>
      <p className="mt-1 text-sm text-muted">{t("news.intro")}</p>

      <div className="mt-6 space-y-4">
        {RELEASE_NOTES.map((release, index) => {
          const isNew = previouslySeen !== undefined && (seenIndex === -1 ? index === 0 : index < seenIndex);
          return (
            <section key={release.version} className={`card p-5 ${isNew ? "ring-2 ring-accent" : ""}`}>
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-lg font-bold">{t("news.version", { version: release.version })}</h2>
                <span className="text-xs text-muted">
                  {new Date(`${release.date}T12:00:00`).toLocaleDateString(dateLocale, { day: "numeric", month: "long", year: "numeric" })}
                </span>
                {isNew && <span className="rounded bg-accent px-2 py-0.5 text-xs font-bold text-white">{t("news.new")}</span>}
              </div>
              <ul className="list-disc space-y-1.5 pl-5 text-sm">
                {(release.items[locale] ?? release.items.en).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
