"use client";

// Shows a file in the page (2.8.1): a picture, a PDF, a Word document (.docx, drawn by docx-preview),
// an Excel sheet (.xlsx: its values as a table) or a PowerPoint (.pptx: each slide's text and
// pictures, without the layout). All read here in the browser – nothing is sent anywhere. Older
// office files and OpenDocument can only be downloaded.
import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { Sheet, Slide } from "@/lib/officePreview";

export const WORD = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const EXCEL = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const POWERPOINT = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const PREVIEW = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", WORD, EXCEL, POWERPOINT]);

export function canPreview(contentType: string): boolean {
  return PREVIEW.has(contentType);
}

function WordDocument({ url, name }: { url: string; name: string }) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [resp, { renderAsync }] = await Promise.all([fetch(url, { credentials: "same-origin", cache: "no-store" }), import("docx-preview")]);
        if (!resp.ok) throw new Error("file");
        const data = await resp.blob();
        if (cancelled || !box.current) return;
        box.current.innerHTML = "";
        await renderAsync(data, box.current, undefined, { inWrapper: true, ignoreLastRenderedPageBreak: true, breakPages: true });
        if (!cancelled) setState("ok");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="h-full w-full overflow-auto rounded bg-white text-black" aria-label={name}>
      {state === "loading" && <p className="p-4 text-sm text-neutral-500">{t("common.loading")}</p>}
      {state === "error" && <p className="p-4 text-sm text-neutral-500">{t("vault.previewFailed")}</p>}
      <div ref={box} />
    </div>
  );
}

async function fetchFile(url: string): Promise<ArrayBuffer> {
  const resp = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  if (!resp.ok) throw new Error("file");
  return resp.arrayBuffer();
}

function Workbook({ url, name }: { url: string; name: string }) {
  const { t } = useI18n();
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState(0);
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchFile(url), import("@/lib/officePreview")])
      .then(([data, { readWorkbook }]) => readWorkbook(data))
      .then((s) => !cancelled && setSheets(s))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [url]);
  const sheet = sheets?.[tab];
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded bg-white text-black" aria-label={name}>
      {failed && <p className="p-4 text-sm text-neutral-500">{t("vault.previewFailed")}</p>}
      {!failed && !sheets && <p className="p-4 text-sm text-neutral-500">{t("common.loading")}</p>}
      {sheets && sheets.length > 1 && (
        <div className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b border-neutral-200 px-2 pt-2">
          {sheets.map((s, i) => (
            <button key={i} onClick={() => setTab(i)} aria-pressed={tab === i} className={`shrink-0 rounded-t px-3 py-1 text-sm ${tab === i ? "bg-neutral-200 font-semibold" : "text-neutral-600"}`}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      {sheet && (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="border-collapse text-xs">
            <tbody>
              {sheet.rows.map((row, r) => (
                <tr key={r}>
                  <th className="sticky left-0 border border-neutral-200 bg-neutral-100 px-1.5 text-right font-normal text-neutral-500">{r + 1}</th>
                  {row.map((cell, c) => (
                    <td key={c} className="max-w-[16rem] truncate border border-neutral-200 px-1.5 py-0.5" title={cell}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {sheet.truncated && <p className="p-2 text-xs text-neutral-500">{t("vault.previewTruncated")}</p>}
        </div>
      )}
    </div>
  );
}

function Presentation({ url, name }: { url: string; name: string }) {
  const { t } = useI18n();
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let made: Slide[] = [];
    Promise.all([fetchFile(url), import("@/lib/officePreview")])
      .then(([data, { readPresentation }]) => readPresentation(data))
      .then((s) => {
        made = s;
        if (!cancelled) setSlides(s);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      for (const s of made) for (const img of s.images) URL.revokeObjectURL(img);
    };
  }, [url]);
  return (
    <div className="h-full w-full space-y-3 overflow-auto rounded bg-neutral-100 p-3 text-black" aria-label={name}>
      {failed && <p className="text-sm text-neutral-500">{t("vault.previewFailed")}</p>}
      {!failed && !slides && <p className="text-sm text-neutral-500">{t("common.loading")}</p>}
      {slides && <p className="text-xs text-neutral-500">{t("vault.slidesSimple")}</p>}
      {slides?.map((slide, i) => (
        <section key={i} className="rounded bg-white p-4 shadow-sm" aria-label={t("vault.slide", { n: i + 1 })}>
          <p className="mb-2 text-xs font-semibold text-neutral-400">{t("vault.slide", { n: i + 1 })}</p>
          {slide.texts.map((text, j) => (
            <p key={j} className={j === 0 ? "text-lg font-bold" : "text-sm"}>
              {text}
            </p>
          ))}
          {slide.images.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {slide.images.map((src) => (
                <img key={src} src={src} alt="" className="max-h-48 rounded object-contain" draggable={false} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

/** The file itself, filling its box; `fallback` is shown for files the browser can't show. */
export default function FileViewer({ url, contentType, name, fallback }: { url: string; contentType: string; name: string; fallback?: React.ReactNode }) {
  const { t } = useI18n();
  if (contentType.startsWith("image/")) return <img src={url} alt={name} className="max-h-full max-w-full object-contain" draggable={false} />;
  if (contentType === "application/pdf") return <iframe src={url} title={name} className="h-full w-full rounded bg-white" />;
  if (contentType === WORD) return <WordDocument url={url} name={name} />;
  if (contentType === EXCEL) return <Workbook url={url} name={name} />;
  if (contentType === POWERPOINT) return <Presentation url={url} name={name} />;
  return (
    fallback ?? (
      <div className="flex flex-col items-center gap-2 rounded-xl bg-white/10 p-6 text-center">
        <FileText className="h-12 w-12" strokeWidth={1.5} aria-hidden />
        <span className="font-semibold">{name}</span>
        <span className="text-sm opacity-80">{t("vault.noPreviewHere")}</span>
      </div>
    )
  );
}
