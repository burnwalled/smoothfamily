"use client";

// Reusable AI flow without API key:
// 1) copy the prompt  2) paste into any AI  3) paste the JSON answer back here.
import { useState } from "react";
import { useI18n } from "@/lib/i18n";

export default function AiAssist({
  prompt,
  onImport,
  importLabel,
}: {
  prompt: string;
  onImport: (raw: string) => Promise<string>;
  importLabel: string;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function runImport() {
    setBusy(true);
    setError("");
    setResult("");
    try {
      setResult(await onImport(pasted));
      setPasted("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="label mb-0">1. {t("ai.step1")}</span>
          <button className="btn-primary px-3 py-1 text-xs" onClick={copyPrompt}>
            {copied ? t("ai.copied") : t("ai.copy")}
          </button>
        </div>
        <pre className="max-h-48 overflow-auto rounded-lg border border-edge bg-base p-3 text-xs whitespace-pre-wrap">
          {prompt}
        </pre>
      </div>
      <div>
        <span className="label">2. {t("ai.step2")}</span>
        <textarea
          className="input min-h-28 font-mono text-xs"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder='{"…": …}'
        />
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {result && <p className="text-sm font-semibold text-primary-700">{result}</p>}
      <button className="btn-accent" onClick={runImport} disabled={busy || !pasted.trim()}>
        {busy ? t("common.loading") : importLabel}
      </button>
    </div>
  );
}
