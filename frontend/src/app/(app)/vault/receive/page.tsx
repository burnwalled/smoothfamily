"use client";

// Something shared to Smooth Family from another app (Android, 2.8.4): a receipt from the mail or
// Kivra, a screenshot, a PDF. Kept as a receipt (and read by the local AI) or as a file in the vault.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageTitle, { EmptyState } from "@/components/PageTitle";
import { api } from "@/lib/api";
import { uploadReceipt } from "@/lib/receipts";
import { useI18n } from "@/lib/i18n";
import { useAiStatus } from "@/components/LocalAi";

export default function ReceivePage() {
  const { t } = useI18n();
  const router = useRouter();
  const ai = useAiStatus();
  const [file, setFile] = useState<File | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const cache = await caches.open("sf-shared");
        const hit = await cache.match("/shared-file");
        if (!hit) return setFile(null);
        const blob = await hit.blob();
        setFile(new File([blob], decodeURIComponent(hit.headers.get("X-Name") ?? "shared"), { type: blob.type }));
      } catch {
        setFile(null);
      }
    })();
  }, []);

  async function done() {
    try {
      await (await caches.open("sf-shared")).delete("/shared-file");
    } catch {
      /* nothing to clear */
    }
  }

  async function asReceipt() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const media_id = await uploadReceipt(file);
      const created = await api.post<{ receipt: { id: string } }>("/api/receipts", { media_id, purchased_on: new Date().toISOString().slice(0, 10) });
      if (ai?.available) await api.post("/api/ai/jobs", { kind: "receipt_info", receipt_id: created.receipt.id });
      await done();
      router.push("/vault?view=receipt");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
      setBusy(false);
    }
  }

  async function asFile() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const data = new FormData();
      data.append("file", file);
      const resp = await fetch("/api/vault/files", { method: "POST", body: data, credentials: "same-origin" });
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).detail ?? t("common.error"));
      await done();
      router.push("/vault?view=file");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageTitle title={t("receive.title")} />
      {file === undefined ? (
        <p className="text-sm text-muted">{t("common.loading")}</p>
      ) : file === null ? (
        <EmptyState>{t("receive.nothing")}</EmptyState>
      ) : (
        <div className="card space-y-3 p-4">
          <p className="text-sm"><span className="font-semibold">{file.name}</span> <span className="text-muted">({Math.ceil(file.size / 1024)} kB)</span></p>
          {file.type.startsWith("image/") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={URL.createObjectURL(file)} alt="" className="max-h-72 rounded border border-edge object-contain" />
          )}
          <div className="flex flex-wrap gap-2">
            {file.type.startsWith("image/") && <button className="btn-primary" disabled={busy} onClick={asReceipt}>{ai?.available ? t("receive.asReceiptAi") : t("receive.asReceipt")}</button>}
            <button className="btn-ghost border border-edge" disabled={busy} onClick={asFile}>{t("receive.asFile")}</button>
            <button className="btn-ghost" disabled={busy} onClick={() => done().then(() => router.push("/vault"))}>{t("common.cancel")}</button>
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>
      )}
    </div>
  );
}
