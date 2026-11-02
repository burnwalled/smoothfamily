"use client";

// My profile → Security and connections: my calendar in my phone (2.8.4). A personal subscription link
// with what concerns me – the family's events, those I'm in, the rides I drive – for iPhone, Google
// or Outlook. Read-only there; new things are added in the app.
import { useEffect, useState } from "react";
import { CalendarPlus, Copy, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function PhoneCalendar() {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [external, setExternal] = useState(true);
  const [notice, setNotice] = useState("");

  function take(r: { token: string; url: string | null }) {
    // Without the server's public address only the address at home works.
    setExternal(!!r.url);
    setUrl(r.url ?? `${window.location.origin}/api/calendar/ical/${r.token}.ics`);
  }

  useEffect(() => {
    api.get<{ token: string; url: string | null }>("/api/calendar/ical/token").then(take).catch(() => {});
  }, []);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setNotice(t("phoneCal.copied"));
    } catch {
      setNotice(t("common.error"));
    }
  }

  async function renew() {
    if (!confirm(t("phoneCal.renewConfirm"))) return;
    take(await api.post<{ token: string; url: string | null }>("/api/calendar/ical/token/regenerate"));
    setNotice(t("phoneCal.renewed"));
  }

  if (!url) return null;
  const webcal = url.replace(/^https?:/, "webcal:");
  return (
    <section className="card mt-4 p-5" aria-label={t("phoneCal.title")}>
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted">
        <CalendarPlus className="h-4 w-4" aria-hidden />
        {t("phoneCal.title")}
      </h2>
      <p className="text-sm text-muted">{t("phoneCal.intro")}</p>
      <div className="mt-3 flex gap-2">
        <input className="input flex-1 font-mono text-xs" readOnly value={url} onFocus={(e) => e.target.select()} aria-label={t("phoneCal.link")} />
        <button className="btn-ghost border border-edge" onClick={copy} aria-label={t("phoneCal.copy")} title={t("phoneCal.copy")}>
          <Copy className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {!external && <p className="mt-2 text-xs text-amber-800">{t("phoneCal.homeOnly")}</p>}
      {notice && (
        <p role="status" className="mt-2 text-sm text-muted">
          {notice}
        </p>
      )}
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-lg border border-edge p-3">
          <p className="font-semibold">iPhone / iPad / Mac</p>
          <a href={webcal} className="mt-1 inline-block text-accent hover:underline">
            {t("phoneCal.addApple")}
          </a>
          <p className="mt-1 text-xs text-muted">{t("phoneCal.appleSteps")}</p>
        </div>
        <div className="rounded-lg border border-edge p-3">
          <p className="font-semibold">Google / Android / Outlook</p>
          <p className="mt-1 text-xs text-muted">{t("phoneCal.googleSteps")}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">{t("phoneCal.whatIsIn")}</p>
      <button className="mt-2 flex items-center gap-1 text-xs text-muted hover:text-ink" onClick={renew}>
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        {t("phoneCal.renew")}
      </button>
    </section>
  );
}
