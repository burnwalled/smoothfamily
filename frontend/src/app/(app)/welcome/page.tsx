"use client";

// The setup guides (2.9.0). On a new server its admin goes through the server's guide first, then
// – like every new family's admin – the family's. Each step says what a setting is for and what we
// suggest, with the real setting under it (the same component as in the settings, so nothing is
// kept twice). Skipping is always fine: everything is in the settings, where the guides open again
// (?guide=server|family).
import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Lightbulb, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { apiKey } from "@/lib/queryClient";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { useMe } from "@/components/Shell";
import ServerAddress from "@/components/settings/ServerAddress";
import ServerSecurity from "@/components/settings/ServerSecurity";
import BackupKey from "@/components/settings/BackupKey";
import ServerUpdates from "@/components/settings/ServerUpdates";
import ServerServices from "@/components/settings/ServerServices";
import { ServerAiPanel } from "@/components/LocalAi";
import Emergency from "@/components/safety/Emergency";
import MembersSettingsPage from "../settings/members/page";
import CalendarsSettingsPage from "../settings/calendars/page";
import HomeSettingsPage from "../settings/home/page";
import TodaySettingsPage from "../settings/today/page";
import PointsSettingsPage from "../settings/points/page";
import EasyModeSwitches from "@/components/easy/EasyModeSwitches";

type Which = "server" | "family";
type Step = { key: string; title: TranslationKey; why: TranslationKey; advice?: TranslationKey; body?: ReactNode };

function serverSteps(): Step[] {
  return [
    { key: "welcome", title: "guide.server.welcome.title", why: "guide.server.welcome.why" },
    { key: "address", title: "guide.server.address.title", why: "guide.server.address.why", advice: "guide.server.address.advice", body: <ServerAddress /> },
    { key: "security", title: "guide.server.security.title", why: "guide.server.security.why", advice: "guide.server.security.advice", body: <ServerSecurity /> },
    { key: "backup", title: "guide.server.backup.title", why: "guide.server.backup.why", advice: "guide.server.backup.advice", body: <BackupKey scope="server" /> },
    { key: "updates", title: "guide.server.updates.title", why: "guide.server.updates.why", advice: "guide.server.updates.advice", body: <ServerUpdates /> },
    { key: "services", title: "guide.server.services.title", why: "guide.server.services.why", advice: "guide.server.services.advice", body: <ServerServices /> },
    { key: "ai", title: "guide.server.ai.title", why: "guide.server.ai.why", advice: "guide.server.ai.advice", body: <ServerAiPanel /> },
    { key: "done", title: "guide.server.done.title", why: "guide.server.done.why" },
  ];
}

function familySteps(hosted: boolean): Step[] {
  return [
    { key: "welcome", title: "guide.family.welcome.title", why: "guide.family.welcome.why" },
    { key: "members", title: "guide.family.members.title", why: "guide.family.members.why", advice: "guide.family.members.advice", body: <MembersSettingsPage /> },
    { key: "calendars", title: "guide.family.calendars.title", why: "guide.family.calendars.why", advice: "guide.family.calendars.advice", body: <CalendarsSettingsPage /> },
    {
      key: "home", title: "guide.family.home.title", why: "guide.family.home.why", advice: "guide.family.home.advice",
      body: <div className="space-y-4"><HomeSettingsPage /><TodaySettingsPage /></div>,
    },
    {
      key: "children", title: "guide.family.children.title", why: "guide.family.children.why", advice: "guide.family.children.advice",
      body: <div className="space-y-6"><EasyModeSwitches /><PointsSettingsPage /></div>,
    },
    { key: "safety", title: "guide.family.safety.title", why: "guide.family.safety.why", advice: "guide.family.safety.advice", body: <Emergency manage /> },
    {
      key: "backup", title: "guide.family.backup.title",
      why: hosted ? "guide.family.backup.whyHosted" : "guide.family.backup.whyOwner",
      advice: hosted ? "guide.family.backup.adviceHosted" : "guide.family.backup.adviceOwner",
      body: <BackupKey scope="family" />,
    },
    { key: "done", title: "guide.family.done.title", why: "guide.family.done.why" },
  ];
}

export default function WelcomePage() {
  const { t } = useI18n();
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  // Opened again from the settings: just that guide, and back there afterwards.
  const asked = params.get("guide");
  const again: Which | null = asked === "server" && me.is_server_admin ? "server" : asked === "family" && me.role === "admin" ? "family" : null;
  const [pending, setPending] = useState<Which[] | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (again) setPending([again]);
    else api.get<{ pending: Which[] }>("/api/guide").then((r) => setPending(r.pending)).catch(() => setPending([]));
  }, [again]);
  useEffect(() => {
    if (pending && pending.length === 0) router.replace("/");
  }, [pending, router]);
  // A new step starts at its top.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step, pending]);

  if (!pending || pending.length === 0) return <p className="text-sm text-muted">{t("common.loading")}</p>;
  const which = pending[0];
  const steps = which === "server" ? serverSteps() : familySteps(me.family_kind === "hosted");
  const current = steps[Math.min(step, steps.length - 1)];
  const last = step >= steps.length - 1;
  const next = pending[1];

  // Finished or skipped: the server remembers, and the next guide (if any) follows.
  async function close() {
    setBusy(true);
    try {
      const result = await api.post<{ pending: Which[] }>(`/api/guide/${which}/done`);
      queryClient.setQueryData(apiKey("/api/guide"), result);
      if (again) {
        router.replace(which === "server" ? "/server" : "/settings/members");
        return;
      }
      setStep(0);
      setPending(result.pending.filter((w) => w !== which));
    } finally {
      setBusy(false);
    }
  }

  const where = which === "server" ? t("server.title") : t("settings.familyAdminTitle");
  return (
    <div className="mx-auto max-w-3xl">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent">
        <Sparkles className="h-4 w-4" aria-hidden />
        {which === "server" ? t("guide.server.title") : t("guide.family.title", { family: me.family_name })}
      </p>
      <div className="mt-2 flex gap-1" aria-hidden>
        {steps.map((s, i) => (
          <span key={s.key} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-accent" : "bg-edge"}`} />
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">{t("guide.step", { n: step + 1, total: steps.length })}</p>

      <h1 className="mt-3 text-2xl font-extrabold tracking-tight">{t(current.title)}</h1>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{t(current.why)}</p>
      {current.key === "done" && which === "server" && next === "family" && <p className="mt-2 text-sm font-semibold">{t("guide.server.done.next")}</p>}
      {current.advice && (
        <aside className="mt-4 flex gap-3 rounded-lg border border-accent/30 bg-accent-soft/40 p-4 text-sm" aria-label={t("guide.advice")}>
          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
          <div>
            <p className="font-semibold">{t("guide.advice")}</p>
            <p className="mt-1 whitespace-pre-line leading-relaxed">{t(current.advice)}</p>
          </div>
        </aside>
      )}

      {current.body && <div className="mt-6">{current.body}</div>}

      {/* Just the buttons, on the page's own colour – it stays at the bottom while a long step scrolls. */}
      <div className="sticky bottom-0 mt-8 flex flex-wrap items-center gap-2 bg-base py-3">
        {step > 0 && (
          <button className="btn-ghost border border-edge" onClick={() => setStep(step - 1)} disabled={busy}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t("guide.back")}
          </button>
        )}
        {last ? (
          <button className="btn-primary ml-auto" onClick={close} disabled={busy}>
            <Check className="h-4 w-4" aria-hidden />
            {which === "server" && next === "family" && !again ? t("guide.toFamily") : t("guide.finish")}
          </button>
        ) : (
          <button className="btn-primary ml-auto" onClick={() => setStep(step + 1)} disabled={busy}>
            {step === 0 ? t("guide.start") : t("guide.next")}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      {!last && (
        <p className="mt-2 text-xs text-muted">
          <button className="underline hover:text-ink" onClick={close} disabled={busy}>{t("guide.skip")}</button>{" "}
          {t("guide.skipHint", { where })}
        </p>
      )}
      {again && (
        <p className="mt-2 text-xs">
          <Link href={which === "server" ? "/server" : "/settings/members"} className="text-muted underline hover:text-ink">{t("guide.leave")}</Link>
        </p>
      )}
    </div>
  );
}
