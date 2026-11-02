"use client";

// What someone outside the family sees through a link from the vault (2.8.1): the photo, album,
// document or – once – login that was shared, until the link runs out. Fetched without the app's
// cache, so nothing of it is kept on the device.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Copy, Download, FileText, KeyRound, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import FileViewer from "@/components/vault/FileViewer";

type Item = { id: string; name: string; kind: "image" | "video" | "file"; content_type: string; previewable: boolean };
type View = {
  kind: "media" | "album" | "document" | "login";
  title: string;
  family_name: string;
  expires_at: string;
  one_time: boolean;
  allow_download: boolean;
  items: Item[];
  login: { title: string; url: string; username: string; password: string; notes: string } | null;
};

export default function SharedFromVault() {
  const { token } = useParams<{ token: string }>();
  const { t } = useI18n();
  const [view, setView] = useState<View | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [open, setOpen] = useState<Item | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetch(`/api/share/${token}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((v: View) => {
        setView(v);
        if (v.items.length === 1 && v.kind !== "album") setOpen(v.items[0]);
      })
      .catch(() => setInvalid(true));
  }, [token]);

  const file = (item: Item, variant: "thumb" | "view" | "original") => `/api/share/${token}/files/${item.id}?variant=${variant}`;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(t("vaultShare.copied"));
    } catch {
      setNotice(t("common.error"));
    }
  }

  if (invalid) {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-xl font-bold">{t("vaultShare.invalidTitle")}</h1>
        <p className="mt-2 text-sm text-muted">{t("vaultShare.invalidText")}</p>
      </main>
    );
  }
  if (!view) return <main className="p-6 text-sm text-muted">{t("common.loading")}</main>;

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4" onContextMenu={view.allow_download ? undefined : (e) => e.preventDefault()}>
      <header>
        <p className="text-sm text-muted">{t("vaultShare.from", { family: view.family_name })}</p>
        <h1 className="text-2xl font-extrabold tracking-tight">{view.title}</h1>
        {view.kind !== "login" && (
          <p className="text-xs text-muted">{view.one_time ? t("vaultShare.onceUntil", { date: new Date(view.expires_at).toLocaleString() }) : t("vaultShare.until", { date: new Date(view.expires_at).toLocaleString() })}</p>
        )}
      </header>

      {view.login && (
        <section className="card space-y-3 p-4">
          <p className="flex items-start gap-2 text-sm text-muted">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
            {t("vaultShare.loginOnce")}
          </p>
          {view.login.url && (
            <a href={view.login.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm text-accent hover:underline">
              {view.login.url}
            </a>
          )}
          {[
            [t("vault.username"), view.login.username],
            [t("vault.password"), view.login.password],
          ]
            .filter(([, v]) => v)
            .map(([label, value]) => (
              <div key={label} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted">{label}</p>
                  <p className="break-all font-mono">{value}</p>
                </div>
                <button className="btn px-2" onClick={() => copy(value)} aria-label={t("vaultShare.copy", { what: label })}>
                  <Copy className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ))}
          {view.login.notes && <p className="whitespace-pre-wrap text-sm">{view.login.notes}</p>}
          {notice && (
            <p role="status" className="text-sm text-muted">
              {notice}
            </p>
          )}
        </section>
      )}

      {view.kind === "album" && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {view.items.map((item) => (
            <button key={item.id} onClick={() => setOpen(item)} className="relative aspect-square overflow-hidden rounded-lg bg-base" aria-label={item.name}>
              {item.kind === "image" ? (
                <img src={file(item, "thumb")} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />
              ) : (
                <span className="grid h-full place-items-center text-3xl" aria-hidden>
                  ▶
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {view.kind === "album" && view.items.length === 0 && <p className="text-sm text-muted">{t("photos.empty")}</p>}

      {open && (
        <div
          className={view.kind === "album" ? "fixed inset-0 z-50 flex flex-col bg-black/90 p-4" : "space-y-3"}
          onClick={view.kind === "album" ? () => setOpen(null) : undefined}
          role={view.kind === "album" ? "dialog" : undefined}
          aria-label={open.name}
        >
          {view.kind === "album" && (
            <button className="self-end text-white" onClick={() => setOpen(null)} aria-label={t("common.close")}>
              <X className="h-7 w-7" aria-hidden />
            </button>
          )}
          <div className="flex min-h-0 flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {open.kind === "image" ? (
              <img src={file(open, "view")} alt={open.name} className="max-h-[80vh] max-w-full rounded object-contain" draggable={false} />
            ) : open.kind === "video" ? (
              <video src={file(open, "view")} controls controlsList={view.allow_download ? undefined : "nodownload"} className="max-h-[80vh] max-w-full" />
            ) : !open.previewable ? (
              // A Word or Excel file can't be shown here: only downloaded, when that was allowed.
              <div className="card flex items-center gap-3 p-4">
                <FileText className="h-8 w-8 text-accent" aria-hidden />
                <span>
                  <span className="block font-semibold">{open.name}</span>
                  <span className="block text-xs text-muted">{view.allow_download ? t("vaultShare.downloadToOpen") : t("vaultShare.noPreview")}</span>
                </span>
              </div>
            ) : (
              <div className="h-[80vh] w-full">
                <FileViewer url={file(open, "view")} contentType={open.content_type} name={open.name} />
              </div>
            )}
          </div>
          {view.allow_download && (
            <div className="flex justify-center py-2" onClick={(e) => e.stopPropagation()}>
              <a href={file(open, "original")} className="btn btn-primary">
                <Download className="mr-1 h-4 w-4" aria-hidden />
                {t("vaultShare.download")}
              </a>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
