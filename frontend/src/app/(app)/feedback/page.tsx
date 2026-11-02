"use client";

// Report a problem: a bug or a wish with description and optional screenshot. It goes to the server
// admin (3.1.0), who sets its status – received, planned, fixed or not planned – with a note.
import { ClipboardEvent, DragEvent, FormEvent, useEffect, useRef, useState } from "react";
import { Bug, ExternalLink, ImagePlus, Lightbulb } from "lucide-react";
import { api, FeedbackReport } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { setApiData, useApi } from "@/lib/query";
import { useMe } from "@/components/Shell";
import PageTitle from "@/components/PageTitle";

const STATUS: Record<FeedbackReport["status"], string> = {
  new: "bg-accent-soft text-ink",
  planned: "bg-sky-100 text-sky-900",
  done: "bg-green-100 text-green-800",
  declined: "bg-edge text-muted",
};

const MAX_SIDE = 1920;

/** Scales large images down and returns a data URL (PNG, or JPEG when the PNG gets big). */
async function toDataUrl(file: File, t: (key: TranslationKey) => string): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error(t("feedback.imageType"));
  if (file.size > 25 * 1024 * 1024) throw new Error(t("feedback.imageTooLarge"));
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL("image/png");
    return png.length < 3_000_000 ? png : canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function FeedbackPage() {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  const [type, setType] = useState<"bug" | "idea">("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Own reports (the family admin's: the family's) from the cache; a new one is added at once.
  const reportsQuery = useApi<FeedbackReport[]>("/api/feedback");
  const reports = reportsQuery.data ?? null;
  const [listError, setListError] = useState("");
  const [toast, setToast] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // The page the report is about: the one the user came from (the menu link is on every page).
  const [page, setPage] = useState("/");

  useEffect(() => {
    const from = document.referrer.startsWith(window.location.origin) ? document.referrer.slice(window.location.origin.length) : "";
    setPage(new URLSearchParams(window.location.search).get("from") || from || "/");
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function pickFile(file: File | null | undefined) {
    if (!file) return;
    setError("");
    try {
      setScreenshot(await toDataUrl(file, t));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function onPaste(e: ClipboardEvent) {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault();
      pickFile(file);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    pickFile(e.dataTransfer.files[0]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const report = await api.post<FeedbackReport>("/api/feedback", {
        type,
        title,
        description,
        page,
        user_agent: navigator.userAgent,
        viewport: `${window.innerWidth}×${window.innerHeight}`,
        screenshot,
      });
      setApiData<FeedbackReport[]>("/api/feedback", (list) => [report, ...(list ?? [])]);
      setTitle("");
      setDescription("");
      setScreenshot(null);
      setToast(t("feedback.thanks", { n: report.issue_number }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const isAdmin = me?.role === "admin";
  const typeOptions = [
    { value: "bug" as const, label: t("feedback.typeBug"), icon: Bug },
    { value: "idea" as const, label: t("feedback.typeIdea"), icon: Lightbulb },
  ];

  return (
    <>
      <div onPaste={onPaste}>
        <PageTitle title={t("feedback.title")} />
        <p className="mt-1 text-sm text-muted">{t("feedback.intro")}</p>

        <form className="card mt-4 space-y-4 p-5" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("feedback.typeLabel")}>
            {typeOptions.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={type === value}
                onClick={() => setType(value)}
                className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
                  type === value ? "border-accent bg-accent-soft text-ink" : "border-edge text-muted"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                {label}
              </button>
            ))}
          </div>

          <div>
            <label className="label" htmlFor="fb-title">{t("feedback.titleLabel")}</label>
            <input
              id="fb-title"
              className="input"
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === "bug" ? t("feedback.titlePhBug") : t("feedback.titlePhIdea")}
            />
          </div>

          <div>
            <label className="label" htmlFor="fb-description">{t("feedback.descriptionLabel")}</label>
            <textarea
              id="fb-description"
              className="input min-h-32"
              required
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={type === "bug" ? t("feedback.descriptionPhBug") : t("feedback.descriptionPhIdea")}
            />
          </div>

          <div>
            <span className="label">{t("feedback.screenshot")}</span>
            {screenshot ? (
              <div className="space-y-2">
                <img src={screenshot} alt={t("feedback.screenshotChosen")} className="max-h-64 rounded-lg border border-edge" />
                <button type="button" className="btn-ghost text-sm" onClick={() => setScreenshot(null)}>
                  {t("feedback.removeImage")}
                </button>
              </div>
            ) : (
              <div
                className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-edge px-4 py-6 text-center"
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
                }}
                role="button"
                tabIndex={0}
              >
                <ImagePlus className="h-6 w-6 text-muted" strokeWidth={1.75} aria-hidden />
                <strong className="text-sm">{t("feedback.pickImage")}</strong>
                <span className="text-xs text-muted">{t("feedback.pasteHint")}</span>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                pickFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>

          <p className="text-xs text-muted">{t("feedback.contextNote", { page })}</p>
          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
          <button className="btn-accent w-full md:w-auto" disabled={busy || !title.trim() || !description.trim()}>
            {busy ? t("feedback.sending") : t("feedback.send")}
          </button>
        </form>

        <section className="card mt-6 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
              {isAdmin ? t("feedback.allReports") : t("feedback.myReports")}
            </h2>
            <span className="text-xs text-muted">{reports?.length ?? 0}</span>
          </div>
          {!reports ? (
            <p className="text-sm text-muted">{listError || t("common.loading")}</p>
          ) : reports.length === 0 ? (
            <p className="text-sm text-muted">{t("feedback.none")}</p>
          ) : (
            <ul className="space-y-3">
              {reports.map((r) => (
                <li key={r.id} className="rounded-lg border border-edge p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS[r.status] ?? STATUS.new}`}>
                      {r.type === "bug" ? t("feedback.typeBug") : t("feedback.typeIdea")} · {t(`feedback.status.${r.status}` as TranslationKey)}
                    </span>
                    <span className="text-xs text-muted">{t("feedback.caseNo", { n: r.issue_number })}</span>
                    {r.issue_url && (
                      <a href={r.issue_url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-muted hover:underline">
                        GitHub <ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden />
                      </a>
                    )}
                  </div>
                  <div className="mt-1 font-semibold">{r.title}</div>
                  <p className="mt-1 whitespace-pre-line text-sm text-muted">
                    {r.description.length > 220 ? `${r.description.slice(0, 220)}…` : r.description}
                  </p>
                  {r.admin_note && (
                    <p className="mt-2 rounded-lg bg-base px-3 py-2 text-sm">
                      <span className="font-semibold">{t("feedback.fromServerAdmin")}</span> {r.admin_note}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted">
                    {new Date(r.created_at).toLocaleString(dateLocale, { dateStyle: "medium", timeStyle: "short" })}
                    {isAdmin ? ` · ${r.reporter_name}` : ""}
                    {r.has_screenshot ? ` · ${t("feedback.withScreenshot")}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {toast && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-lg bg-accent px-5 py-3 text-sm font-bold text-white shadow-lg" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
