"use client";

// The local AI in the app: whether it can be used, the note that jobs wait for the AI computer,
// the buttons that start a job, the family's own choice and the server admin's settings.
// Everything here also works by hand – these are only shortcuts.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Camera, Copy, Power, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useLive } from "@/lib/live";

export type AiStatus = { available: boolean; online: boolean; last_online: string | null; waiting: number; hosted: boolean };
export type AiJob = {
  id: string;
  kind: "receipt" | "recipe" | "quick_add" | "cook_ideas" | "vehicle_receipt" | "property_receipt" | "meal_plan" | "chores" | "web_question" | "receipt_info" | "complaint_letter";
  status: "queued" | "running" | "done" | "applied" | "dismissed" | "failed" | "cancelled" | "expired";
  input: { text?: string; list_id?: string | null; store?: string | null; vehicle_id?: string; property_id?: string; media_id?: string; week_start?: string };
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
  position: number | null;
};

export function useAiStatus(): AiStatus | null {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const load = useCallback(() => {
    api.get<AiStatus>("/api/ai/status").then(setStatus).catch(() => setStatus(null));
  }, []);
  useEffect(load, [load]);
  useLive(["ai"], load);
  return status;
}

/** Under an AI button: where it runs and that it may take a while. */
export function AiNote({ status }: { status: AiStatus }) {
  const { t } = useI18n();
  return (
    <p className="text-xs text-muted">
      {status.hosted ? t("ai.noteHosted") : t("ai.note")}{" "}
      {status.online ? t("ai.onlineNow") : t("ai.offlineNow")}
    </p>
  );
}

/** Starts a job; afterwards the member is told it is queued and where to follow it. */
export function useAiJob() {
  const { t } = useI18n();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function start(make: () => Promise<AiJob>) {
    setBusy(true);
    setMessage("");
    try {
      const job = await make();
      setMessage(job.position && job.position > 1 ? t("ai.queuedPosition", { n: job.position }) : t("ai.queued"));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }
  const note = message ? (
    <p className="text-xs font-semibold text-accent">
      {message} <Link href="/ai" className="underline">{t("ai.follow")}</Link>
    </p>
  ) : null;
  return { start, busy, note };
}

export function upload(kind: "receipt" | "recipe", file: File): Promise<AiJob> {
  const data = new FormData();
  data.append("file", file);
  return fetch(`/api/ai/jobs/upload?kind=${kind}`, { method: "POST", body: data, credentials: "same-origin" }).then(async (r) => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(typeof body.detail === "string" ? body.detail : String(r.status));
    return body as AiJob;
  });
}

/** "Read a receipt with AI" – a photo from the camera or a file. */
export function ReceiptButton() {
  const { t } = useI18n();
  const status = useAiStatus();
  const { start, busy, note } = useAiJob();
  if (!status?.available) return null;
  return (
    <div className="space-y-1">
      <label className={`btn-ghost inline-flex cursor-pointer items-center gap-1.5 border border-edge ${busy ? "opacity-60" : ""}`}>
        <Camera className="h-4 w-4" strokeWidth={2} aria-hidden />
        {t("ai.readReceipt")}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) start(() => upload("receipt", file));
            e.target.value = "";
          }}
        />
      </label>
      <AiNote status={status} />
      {note}
    </div>
  );
}

/** A photo of a cookbook page or a handwritten recipe. */
export function RecipePhotoButton() {
  const { t } = useI18n();
  const status = useAiStatus();
  const { start, busy, note } = useAiJob();
  if (!status?.available) return null;
  return (
    <div className="space-y-1">
      <label className={`btn-ghost inline-flex cursor-pointer items-center gap-1.5 border border-edge ${busy ? "opacity-60" : ""}`}>
        <Camera className="h-4 w-4" strokeWidth={2} aria-hidden />
        {t("ai.recipeFromPhoto")}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) start(() => upload("recipe", file));
            e.target.value = "";
          }}
        />
      </label>
      {note}
    </div>
  );
}

/** A simple text job (dinner ideas, a recipe from text, items for a list). */
export function AiTextButton({ kind, text, listId, label, disabled }: { kind: "recipe" | "quick_add" | "cook_ideas"; text?: string; listId?: string; label: string; disabled?: boolean }) {
  const status = useAiStatus();
  const { start, busy, note } = useAiJob();
  if (!status?.available) return null;
  return (
    <div className="space-y-1">
      <button
        type="button"
        className="btn-ghost inline-flex items-center gap-1.5 border border-edge"
        disabled={busy || disabled}
        onClick={() => start(() => api.post<AiJob>("/api/ai/jobs", { kind, text: text ?? "", list_id: listId ?? null }))}
      >
        <Sparkles className="h-4 w-4 text-accent" strokeWidth={2} aria-hidden />
        {label}
      </button>
      <AiNote status={status} />
      {note}
    </div>
  );
}

/** A job for the local AI with what it needs (the week's dinners, the home's chores …); the answer
 * is looked over on the AI page. Shown only when the family has the AI. */
export function AiJobButton({ body, label, or }: { body: Record<string, unknown>; label: string; or?: string }) {
  const status = useAiStatus();
  const { start, busy, note } = useAiJob();
  if (!status?.available) return null;
  return (
    <div className="space-y-1">
      <button type="button" className="btn-primary inline-flex items-center gap-1.5" disabled={busy} onClick={() => start(() => api.post<AiJob>("/api/ai/jobs", body))}>
        <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
        {label}
      </button>
      <AiNote status={status} />
      {note}
      {or && <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted">{or}</p>}
    </div>
  );
}

/** Family admin: use the AI or not (a hosted family only when the server admin allows it). */
export function FamilyAiSetting() {
  const { t } = useI18n();
  const [state, setState] = useState<{ enabled: boolean; allowed: boolean; hosted: boolean } | null>(null);
  useEffect(() => {
    api.get<{ enabled: boolean; allowed: boolean; hosted: boolean }>("/api/ai/family").then(setState).catch(() => {});
  }, []);
  if (!state || !state.allowed) return null;
  return (
    <div className="mt-6 border-t border-edge pt-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Bot className="h-4 w-4" strokeWidth={2} aria-hidden />
        {t("ai.title")}
      </h3>
      <p className="mt-1 text-xs text-muted">{state.hosted ? t("ai.familyHostedHelp") : t("ai.familyHelp")}</p>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary-700"
          checked={state.enabled}
          onChange={async (e) => setState(await api.put("/api/ai/family", { enabled: e.target.checked }))}
        />
        {t("ai.familyUse")}
      </label>
    </div>
  );
}

type Config = {
  url: string;
  text_model: string;
  vision_model: string;
  poll_minutes: number;
  allow_hosted: boolean;
  keep_days: number;
  wol_enabled: boolean;
  wol_mac: string;
  wol_broadcast: string;
  helper_key: string;
  online: boolean;
  last_online: string | null;
  queue: Record<string, number>;
};

/** Server admin: where the AI is, which models, how often to look, waking and sleep. */
export function ServerAiPanel() {
  const { t, dateLocale } = useI18n();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Config>("/api/server/ai").then(setCfg).catch(() => {});
  }, []);

  async function run(action: () => Promise<unknown>, done: string) {
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  if (!cfg) return null;
  const set = (patch: Partial<Config>) => setCfg({ ...cfg, ...patch });
  const save = () =>
    run(async () => {
      const { helper_key, online, last_online, queue, ...body } = cfg;
      void helper_key; void online; void last_online; void queue;
      setCfg(await api.put<Config>("/api/server/ai", body));
    }, t("home.saved"));
  const test = () =>
    run(async () => {
      const found = await api.post<{ version: string; models: { name: string }[] }>("/api/server/ai/test", { url: cfg.url });
      setModels(found.models.map((m) => m.name));
    }, t("ai.found"));
  const choices = Array.from(new Set([...models, cfg.text_model, cfg.vision_model].filter(Boolean)));
  const helperUrl = typeof window !== "undefined" ? `${window.location.origin}/api/ai/helper?key=${cfg.helper_key}` : "";

  return (
    <section className="card mt-4 p-5" aria-label={t("ai.title")}>
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted">
        <Bot className="h-4 w-4" strokeWidth={2} aria-hidden />
        {t("ai.title")}
      </h2>
      <p className="mb-3 text-xs text-muted">{t("ai.serverHelp")}</p>
      <p className={`mb-3 text-sm font-semibold ${cfg.online ? "text-green-700" : "text-muted"}`}>
        {cfg.url ? (cfg.online ? t("ai.statusOnline") : t("ai.statusOffline", { when: cfg.last_online ? new Date(cfg.last_online).toLocaleString(dateLocale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—" })) : t("ai.statusNone")}
        {Object.keys(cfg.queue).length > 0 && <span className="ml-2 font-normal text-muted">· {t("ai.queueCounts", { queued: cfg.queue.queued ?? 0, done: (cfg.queue.done ?? 0) + (cfg.queue.applied ?? 0) })}</span>}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted sm:col-span-2">
          {t("ai.url")}
          <div className="mt-1 flex gap-2">
            <input className="input flex-1" value={cfg.url} placeholder="http://192.168.1.20:11434" onChange={(e) => set({ url: e.target.value })} />
            <button className="btn-ghost shrink-0 border border-edge" onClick={test} disabled={!cfg.url}>{t("ai.test")}</button>
          </div>
        </label>
        <label className="text-xs text-muted">
          {t("ai.textModel")}
          <select className="input mt-1 w-full" value={cfg.text_model} onChange={(e) => set({ text_model: e.target.value })}>
            <option value="">—</option>
            {choices.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">
          {t("ai.visionModel")}
          <select className="input mt-1 w-full" value={cfg.vision_model} onChange={(e) => set({ vision_model: e.target.value })}>
            <option value="">—</option>
            {choices.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">
          {t("ai.pollMinutes")}
          <select className="input mt-1 w-full" value={cfg.poll_minutes} onChange={(e) => set({ poll_minutes: Number(e.target.value) })}>
            {[1, 2, 5, 10, 15, 30, 60].map((n) => <option key={n} value={n}>{t("ai.everyMinutes", { n })}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">
          {t("ai.keepDays")}
          <select className="input mt-1 w-full" value={cfg.keep_days} onChange={(e) => set({ keep_days: Number(e.target.value) })}>
            {[1, 3, 7, 14, 30, 60].map((n) => <option key={n} value={n}>{t("ai.days", { n })}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={cfg.allow_hosted} onChange={(e) => set({ allow_hosted: e.target.checked })} />
          {t("ai.allowHosted")}
        </label>
      </div>

      <fieldset className="mt-4 rounded-lg border border-edge p-3">
        <legend className="px-1 text-xs font-bold uppercase tracking-wide text-muted">{t("ai.wolTitle")}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={cfg.wol_enabled} onChange={(e) => set({ wol_enabled: e.target.checked })} />
          {t("ai.wolEnable")}
        </label>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-muted">{t("ai.mac")}<input className="input mt-1 w-full font-mono" value={cfg.wol_mac} placeholder="3C:7C:3F:12:34:56" onChange={(e) => set({ wol_mac: e.target.value })} /></label>
          <label className="text-xs text-muted">{t("ai.broadcast")}<input className="input mt-1 w-full font-mono" value={cfg.wol_broadcast} onChange={(e) => set({ wol_broadcast: e.target.value })} /></label>
        </div>
        <p className="mt-2 text-xs text-muted">{t("ai.wolHelp")}</p>
        {cfg.wol_mac && (
          <button className="btn-ghost mt-2 inline-flex items-center gap-1.5 border border-edge" onClick={() => run(() => api.post("/api/server/ai/wake", {}), t("ai.wakeSent"))}>
            <Power className="h-4 w-4" strokeWidth={2} aria-hidden />
            {t("ai.wakeNow")}
          </button>
        )}
        {cfg.helper_key && (
          <div className="mt-3 border-t border-edge pt-3">
            <p className="text-xs text-muted">{t("ai.helperHelp")}</p>
            <div className="mt-1 flex gap-2">
              <input className="input min-w-0 flex-1 font-mono text-xs" readOnly value={helperUrl} onFocus={(e) => e.target.select()} aria-label={t("ai.helperUrl")} />
              <button className="btn-ghost shrink-0 border border-edge" onClick={() => navigator.clipboard?.writeText(helperUrl)} aria-label={t("guests.copy")}>
                <Copy className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        )}
      </fieldset>

      <details className="mt-4 rounded-lg border border-edge p-3 text-sm">
        <summary className="cursor-pointer font-semibold">{t("ai.guideTitle")}</summary>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-xs">
          <li>{t("ai.guide1")} <code className="rounded bg-base px-1">ollama pull qwen3:30b-a3b</code> · <code className="rounded bg-base px-1">ollama pull qwen3-vl:8b</code></li>
          <li>{t("ai.guide2")} <code className="rounded bg-base px-1">setx OLLAMA_HOST 0.0.0.0:11434</code></li>
          <li>{t("ai.guide3")} <code className="block whitespace-pre-wrap rounded bg-base p-1">New-NetFirewallRule -DisplayName &quot;Ollama (Smooth Family)&quot; -Direction Inbound -Protocol TCP -LocalPort 11434 -RemoteAddress &lt;NAS-IP&gt; -Action Allow</code></li>
          <li>{t("ai.guide4")}</li>
          <li>{t("ai.guide5")} <code className="rounded bg-base px-1">scripts/ai-sleep-helper.ps1</code></li>
        </ol>
        <p className="mt-2 text-xs text-muted">{t("ai.guideMore")}</p>
      </details>

      <div className="mt-4 flex items-center gap-3">
        <button className="btn-primary" onClick={save}>{t("profile.save")}</button>
        {message && <span className="text-sm text-green-700">{message}</span>}
        {error && <span className="text-sm text-red-700">{error}</span>}
      </div>
    </section>
  );
}
