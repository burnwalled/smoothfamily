"use client";

// Memories (#71): photos from this day in earlier years. Only the family's photo albums count.
import { Images } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";

type MemoryYear = { year: number; years_ago: number; items: { id: string; original_name: string }[] };

export default function Memories({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const memories = useApi<MemoryYear[]>("/api/albums/memories");
  const years = memories.data ?? (memories.isError ? NONE : null);

  if (years === null) return compact ? <p className="text-sm text-muted">{t("common.loading")}</p> : null;
  if (years.length === 0) return compact ? <p className="text-sm text-muted">{t("memories.none")}</p> : null;

  const strip = (
    <div className="space-y-3">
      {years.map((y) => (
        <div key={y.year}>
          <p className="mb-1 text-xs font-semibold text-muted">{t("memories.yearsAgo", { n: y.years_ago, year: y.year })}</p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {y.items.slice(0, compact ? 6 : 20).map((item) => (
              <a key={item.id} href={`/api/media/${item.id}/web`} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <img src={`/api/media/${item.id}/thumb`} alt={item.original_name} className={`${compact ? "h-20 w-20" : "h-28 w-28"} rounded-lg object-cover`} loading="lazy" />
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
  if (compact) return strip;
  return (
    <section className="card mb-4 p-5" aria-label={t("memories.title")}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
        <Images className="h-4 w-4" strokeWidth={2} aria-hidden />
        {t("memories.title")}
      </h2>
      {strip}
    </section>
  );
}
