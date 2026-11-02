"use client";

// The backup key (2.9.0): backups sealed so the server can write them but not read them. The key is
// made here in the browser; only its public half goes to the server, and the private key is shown
// once – to keep in a password manager or on paper. Used for the server's backups (server admin)
// and a family's own (the family's admin), and by the getting-started guides.
import { useEffect, useState } from "react";
import { Copy, Download, KeyRound, Printer, ShieldCheck, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useApi } from "@/lib/query";
import { BackupKeyError, newKey, openSealed, supported } from "@/lib/backupKey";

type Scope = "server" | "family";
type Status = { key_id: string | null; latest?: string | null };

export default function BackupKey({ scope, onSaved }: { scope: Scope; onSaved?: () => void }) {
  const { t } = useI18n();
  // From the cache: saving or turning off the key (api.put) refreshes it.
  const server = useApi<{ key_id: string | null; backups: { stamp: string; encrypted: boolean; secrets: string | null }[] }>(scope === "server" ? "/api/admin/backups" : null);
  const family = useApi<{ key_id: string | null; latest_sealed: string | null }>(scope === "family" ? "/api/family/backup-key" : null);
  const status: Status | null =
    scope === "server"
      ? server.data ? { key_id: server.data.key_id, latest: server.data.backups.find((b) => b.encrypted && b.secrets)?.secrets ?? null } : server.isError ? { key_id: null } : null
      : family.data ? { key_id: family.data.key_id, latest: family.data.latest_sealed } : family.isError ? { key_id: null } : null;
  const [canMake, setCanMake] = useState(true);
  const [made, setMade] = useState<{ privateText: string; publicKey: string; keyId: string } | null>(null);
  const [confirm, setConfirm] = useState("");
  const [testing, setTesting] = useState(false);
  const [testKey, setTestKey] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supported().then(setCanMake);
  }, []);

  const url = scope === "server" ? "/api/admin/backups/key" : "/api/family/backup-key";

  async function make() {
    setMessage(null);
    setConfirm("");
    setMade(await newKey());
  }

  async function save() {
    if (!made) return;
    setBusy(true);
    try {
      await api.put(url, { public_key: made.publicKey });
      setMade(null);
      setMessage({ ok: true, text: t("backupKey.saved") });
      onSaved?.();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : t("common.error") });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    if (!confirm_(t(scope === "server" ? "backupKey.offConfirmServer" : "backupKey.offConfirmFamily"))) return;
    await api.put(url, { public_key: "" });
  }

  async function test() {
    setBusy(true);
    setMessage(null);
    try {
      const path = scope === "server" ? `/api/admin/backups/files/${status?.latest}` : "/api/family/backup-key/latest";
      const resp = await fetch(path, { credentials: "same-origin" });
      if (!resp.ok) throw new Error(t("backupKey.noSealedYet"));
      await openSealed(new Uint8Array(await resp.arrayBuffer()), testKey, true);
      setMessage({ ok: true, text: t("backupKey.testOk") });
      setTestKey("");
      setTesting(false);
    } catch (e) {
      const reason = e instanceof BackupKeyError ? (e.message === "typo" || e.message === "length" ? t("backupKey.testTypo") : e.message === "another key" ? t("backupKey.testOther") : t("backupKey.testWrong")) : e instanceof Error ? e.message : t("common.error");
      setMessage({ ok: false, text: reason });
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!made) return;
    const text = `${t("backupKey.fileTitle")}\n\n${made.privateText}\n\n${t("backupKey.fileHint")}\n`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = `smooth-family-backup-key-${made.keyId.slice(0, 6)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function print() {
    if (!made) return;
    const w = window.open("", "_blank", "noopener,width=600,height=400");
    if (!w) return;
    w.document.title = t("backupKey.fileTitle");
    const p = w.document.createElement("pre");
    p.style.font = "16px monospace";
    p.textContent = `${t("backupKey.fileTitle")}\n\n${made.privateText}\n\n${t("backupKey.fileHint")}`;
    w.document.body.appendChild(p);
    w.print();
  }

  if (!status) return null;
  const last5 = made ? made.privateText.slice(-5) : "";
  const confirmed = !!made && confirm.trim().toUpperCase() === last5;

  return (
    <section className="card p-5" aria-label={t("backupKey.title")}>
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
        <KeyRound className="h-4 w-4" aria-hidden />
        {t("backupKey.title")}
      </h2>
      <p className="text-sm text-muted">{t(scope === "server" ? "backupKey.whyServer" : "backupKey.whyFamily")}</p>

      <p className="mt-3 flex items-center gap-2 text-sm">
        {status.key_id ? <ShieldCheck className="h-4 w-4 text-green-700" aria-hidden /> : <ShieldAlert className="h-4 w-4 text-amber-700" aria-hidden />}
        {status.key_id ? t("backupKey.on", { id: status.key_id.slice(0, 6) }) : t(scope === "server" ? "backupKey.offServer" : "backupKey.offFamily")}
      </p>

      {!canMake && <p className="mt-2 text-sm text-red-700">{t("backupKey.unsupported")}</p>}

      {made ? (
        <div className="mt-3 space-y-3 rounded-lg border-2 border-accent p-4">
          <p className="text-sm font-semibold">{t("backupKey.saveNow")}</p>
          <code className="block select-all break-all rounded bg-base p-3 font-mono text-base tracking-wide">{made.privateText}</code>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost border border-edge" onClick={() => navigator.clipboard.writeText(made.privateText).catch(() => {})}>
              <Copy className="h-4 w-4" aria-hidden />
              {t("backupKey.copy")}
            </button>
            <button className="btn-ghost border border-edge" onClick={download}>
              <Download className="h-4 w-4" aria-hidden />
              {t("backupKey.download")}
            </button>
            <button className="btn-ghost border border-edge" onClick={print}>
              <Printer className="h-4 w-4" aria-hidden />
              {t("backupKey.print")}
            </button>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
            <li>{t("backupKey.where1")}</li>
            <li>{t("backupKey.where2")}</li>
            <li>{t("backupKey.where3")}</li>
          </ul>
          <label className="block text-sm">
            {t("backupKey.confirm")}
            <input className="input mt-1 w-32 font-mono uppercase" maxLength={5} value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label={t("backupKey.confirm")} />
          </label>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={!confirmed || busy} onClick={save}>{t("backupKey.use")}</button>
            <button className="btn-ghost" onClick={() => setMade(null)}>{t("common.cancel")}</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-primary" disabled={!canMake} onClick={make}>
            {status.key_id ? t("backupKey.replace") : t("backupKey.make")}
          </button>
          {status.key_id && (
            <button className="btn-ghost border border-edge" onClick={() => setTesting(!testing)} aria-expanded={testing}>{t("backupKey.test")}</button>
          )}
          {status.key_id && (
            <button className="btn-ghost text-red-700" onClick={turnOff}>{t("backupKey.turnOff")}</button>
          )}
        </div>
      )}
      {status.key_id && !made && <p className="mt-2 text-xs text-muted">{t("backupKey.replaceHint")}</p>}

      {testing && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted">{t("backupKey.testHint")}</p>
          <div className="flex flex-wrap gap-2">
            <input className="input min-w-64 flex-1 font-mono" value={testKey} onChange={(e) => setTestKey(e.target.value)} placeholder="SFKEY-…" aria-label={t("backupKey.testLabel")} autoComplete="off" spellCheck={false} />
            <button className="btn-primary" disabled={busy || !testKey.trim() || !status.latest} onClick={test}>{t("backupKey.testRun")}</button>
          </div>
          {!status.latest && <p className="text-xs text-muted">{t("backupKey.noSealedYet")}</p>}
        </div>
      )}
      {message && <p role="status" className={`mt-2 text-sm ${message.ok ? "text-green-700" : "text-red-700"}`}>{message.text}</p>}
    </section>
  );
}

function confirm_(text: string): boolean {
  return typeof window !== "undefined" && window.confirm(text);
}
