"use client";

// The school card on Today (3.4.0): each child's school day from Home Assistant (InfoMentor,
// SchoolSoft) – the day, PE tomorrow, the after-school hours, homework, absence, what's next and the
// weekly letter, which opens here. Adults see their children; a child their own.
import { useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Dumbbell, GraduationCap, Mail, Sun, TriangleAlert, X } from "lucide-react";
import { SchoolDay } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useApi } from "@/lib/query";

type Letter = { title: string; date: string | null; text: string; attachments: { name: string; url: string | null }[] };

export default function SchoolWidget() {
  const { t } = useI18n();
  const days = useApi<SchoolDay[]>("/api/school/today", { refetchInterval: 10 * 60_000 }).data;
  const [reading, setReading] = useState<SchoolDay | null>(null);
  if (!days) return <p className="text-sm text-muted">{t("common.loading")}</p>;
  if (days.length === 0) return <p className="text-sm text-muted">{t("school.none")}</p>;

  return (
    <>
      <ul className="space-y-3">
        {days.map((d) => (
          <li key={d.user_id} className="text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color ?? "#999" }} aria-hidden />
              {d.name}
              {d.absent_today && (
                <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                  <TriangleAlert className="h-3 w-3" aria-hidden />
                  {t("school.absent")}
                </span>
              )}
            </p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 pl-4 text-xs text-muted">
              {d.school_day && <span className="flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5" aria-hidden />{t("school.day", { time: d.school_day })}</span>}
              {d.leisure_today && <span className="flex items-center gap-1"><Sun className="h-3.5 w-3.5" aria-hidden />{t("school.leisure", { time: d.leisure_today })}</span>}
              {d.pe && <span className="flex items-center gap-1 font-semibold text-accent"><Dumbbell className="h-3.5 w-3.5" aria-hidden />{t("school.pe")}</span>}
              {!!d.assignments && <span className="flex items-center gap-1" title={d.assignment_titles.join("\n")}><BookOpen className="h-3.5 w-3.5" aria-hidden />{t("school.assignments", { n: d.assignments })}</span>}
              {d.next_event && <span>{t("school.next", { what: d.next_event })}</span>}
            </div>
            {d.assignment_titles.length > 0 && (
              <ul className="mt-1 list-disc pl-8 text-xs text-muted">
                {d.assignment_titles.slice(0, 3).map((a) => <li key={a}>{a}</li>)}
              </ul>
            )}
            {d.weekly_letter && (
              <button className="mt-1 ml-4 flex items-center gap-1 text-xs font-semibold text-accent hover:underline" onClick={() => setReading(d)}>
                <Mail className="h-3.5 w-3.5" aria-hidden />
                {d.weekly_letter}
              </button>
            )}
          </li>
        ))}
      </ul>
      {days[0]?.news_titles.length > 0 && (
        <p className="mt-3 border-t border-edge pt-2 text-xs text-muted">{t("school.news", { title: days[0].news_titles[0] })}</p>
      )}
      {/* Outside the sortable card, so the dialog is its own (not part of the card for assistive tech). */}
      {reading && createPortal(<LetterDialog day={reading} onClose={() => setReading(null)} />, document.body)}
    </>
  );
}

function LetterDialog({ day, onClose }: { day: SchoolDay; onClose: () => void }) {
  const { t } = useI18n();
  const letter = useApi<Letter>(`/api/school/${day.user_id}/letter`).data;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={letter?.title ?? day.weekly_letter ?? ""} onClick={onClose}>
      <div className="card max-h-[85vh] w-full max-w-lg overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">{letter?.title ?? day.weekly_letter}</h2>
            <p className="text-xs text-muted">{[day.name, letter?.date].filter(Boolean).join(" · ")}</p>
          </div>
          <button className="btn-ghost px-2" onClick={onClose} aria-label={t("common.close")}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {letter ? (
          <>
            <p className="whitespace-pre-line text-sm">{letter.text || t("school.letterEmpty")}</p>
            {letter.attachments.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {letter.attachments.map((a) => (
                  <li key={a.name}>{a.url ? <a className="text-accent hover:underline" href={a.url} target="_blank" rel="noreferrer">{a.name}</a> : a.name}</li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">{t("common.loading")}</p>
        )}
      </div>
    </div>
  );
}
