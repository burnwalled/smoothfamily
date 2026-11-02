"use client";

// The vault (2.8.1): every file the family keeps – photos and albums, pictures from the chats,
// receipts and documents – in one place, with a filter per kind. Nothing is moved: each file stays
// with its app and is shown to those that app shows it to. Photos is the vault's view of the albums.
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileText, Folder, Link2, Lock, MessageCircle, Play, Search, Upload, X } from "lucide-react";
import { api, VaultAlbum, VaultItem, VaultShareKind } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { NONE, refreshResource, useApi } from "@/lib/query";
import { APP_PAGES } from "@/lib/nav";
import { useMe } from "@/components/Shell";
import PageTitle, { EmptyState } from "@/components/PageTitle";
import Memories from "@/components/Memories";
import Passwords from "@/components/vault/Passwords";
import ShareDialog from "@/components/vault/ShareDialog";
import SharedLinks from "@/components/vault/SharedLinks";
import Documents, { DocumentFileView } from "@/components/vault/Documents";
import Receipts from "@/components/vault/Receipts";
import FileViewer, { canPreview } from "@/components/vault/FileViewer";

const VIEWS = ["all", "photo", "albums", "file", "document", "receipt", "chat", "logins", "shares"] as const;
type View = (typeof VIEWS)[number];

const UPLOAD_TYPES = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime";

function appName(href: string | null, t: (k: TranslationKey) => string): string | null {
  const page = href ? APP_PAGES.find((p) => p.href === href) : undefined;
  return page ? t(page.labelKey) : null;
}

function Tile({ item, onOpen, onShare, showSource }: { item: VaultItem; onOpen: () => void; onShare?: () => void; showSource: boolean }) {
  const { t } = useI18n();
  return (
    <div className="relative">
      <button onClick={onOpen} className="group block w-full text-left" aria-label={`${item.title}${item.context ? ` · ${item.context}` : ""}`}>
        <span className="relative block aspect-square overflow-hidden rounded-lg border border-edge bg-base">
          {item.kind === "file" ? (
            <span className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
              <FileText className="h-8 w-8 text-accent" strokeWidth={1.5} aria-hidden />
              <span className="line-clamp-2 text-xs font-medium">{item.title}</span>
            </span>
          ) : (
            <img src={item.thumb ?? item.url} alt="" className="h-full w-full object-cover" loading="lazy" />
          )}
          {item.kind === "video" && (
            <span className="absolute inset-0 grid place-items-center">
              <Play className="h-8 w-8 rounded-full bg-black/50 p-1.5 text-white" aria-hidden />
            </span>
          )}
          {showSource && item.source !== "photo" && (
            <span className="absolute left-1 top-1 rounded bg-black/55 px-1.5 text-[10px] font-semibold leading-4 text-white">
              {t(`vault.filter.${item.source}` as TranslationKey)}
            </span>
          )}
        </span>
        {item.source !== "photo" && (item.context || item.private) && (
          <span className="mt-1 flex items-center gap-1 truncate text-xs text-muted">
            {item.private && <Lock className="h-3 w-3 shrink-0" aria-label={t("vault.onlyMe")} />}
            <span className="truncate">{item.context}</span>
          </span>
        )}
      </button>
      {onShare && (
        <button
          onClick={onShare}
          className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white hover:bg-black/75"
          aria-label={t("vault.shareTitle", { name: item.title })}
          title={t("vault.share")}
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

function Grid({ items, onOpen, onShare, showSource = false }: { items: VaultItem[]; onOpen: (item: VaultItem) => void; onShare?: (item: VaultItem) => void; showSource?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
      {items.map((item) => (
        <Tile key={`${item.source}-${item.id}`} item={item} onOpen={() => onOpen(item)} onShare={onShare ? () => onShare(item) : undefined} showSource={showSource} />
      ))}
    </div>
  );
}

export default function VaultPage() {
  return (
    <Suspense>
      <Vault />
    </Suspense>
  );
}

function Vault() {
  const { t } = useI18n();
  const me = useMe();
  // Opened on a view with ?view=… (old links to Photos land on the photos).
  const asked = useSearchParams().get("view");
  const [view, setView] = useState<View>((VIEWS as readonly string[]).includes(asked ?? "") ? (asked as View) : "all");
  const [album, setAlbum] = useState<VaultAlbum | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<VaultItem | null>(null);
  const [newAlbum, setNewAlbum] = useState("");
  const [uploadTo, setUploadTo] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // From the cache: a change here, or a photo added to an album or a chat elsewhere, refreshes it.
  const albums = useApi<VaultAlbum[]>("/api/vault/albums").data ?? NONE;
  const photoAlbums = albums.filter((a) => a.kind === "user");
  // What the view lists (the albums', passwords' and shares' views list theirs themselves).
  const itemsPath = useMemo(() => {
    if ((view === "albums" && !album) || view === "logins" || view === "shares" || view === "document") return null;
    const params = new URLSearchParams();
    if (album) {
      params.set("source", album.kind === "chat" ? "chat" : "photo");
      params.set("album_id", album.id);
    } else if (view !== "all" && view !== "albums") {
      params.set("source", view);
    }
    return `/api/vault?${params}`;
  }, [view, album]);
  const itemsQuery = useApi<VaultItem[]>(itemsPath);
  const items = itemsPath ? (itemsQuery.data ?? (itemsQuery.isError ? NONE : null)) : NONE;
  useEffect(() => {
    if (!uploadTo && photoAlbums.length > 0) setUploadTo(album?.kind === "user" ? album.id : photoAlbums[0].id);
  }, [photoAlbums, uploadTo, album]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!items || !needle) return items ?? [];
    return items.filter((i) => i.title.toLowerCase().includes(needle) || i.context.toLowerCase().includes(needle));
  }, [items, query]);

  function choose(next: View) {
    setView(next);
    setAlbum(null);
    window.history.replaceState(null, "", next === "all" ? "/vault" : `/vault?view=${next}`);
  }

  async function createAlbum() {
    if (!newAlbum.trim()) return;
    await api.post("/api/albums", { name: newAlbum.trim() }).catch(() => {});
    setNewAlbum("");
  }

  async function deleteAlbum(a: VaultAlbum) {
    if (!confirm(t("photos.confirmDeleteAlbum", { name: a.name }))) return;
    await api.del(`/api/albums/${a.id}`).catch(() => {});
    setAlbum(null);
  }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    let target = album?.kind === "user" ? album.id : uploadTo;
    if (!target) target = (await api.post<{ id: string }>("/api/albums", { name: t("vault.defaultAlbum") })).id;
    const all = Array.from(files);
    for (const [i, file] of all.entries()) {
      setProgress(Math.round((i / all.length) * 100));
      const data = new FormData();
      data.append("file", file);
      await fetch(`/api/albums/${target}/media`, { method: "POST", credentials: "same-origin", body: data }).catch(() => {});
    }
    setProgress(null);
    if (fileRef.current) fileRef.current.value = "";
    void refreshResource("albums");
    void refreshResource("vault");
  }

  // Any file into the vault (encrypted there), for the family or only for me.
  const anyFileRef = useRef<HTMLInputElement>(null);
  const [onlyMe, setOnlyMe] = useState(false);
  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const all = Array.from(files);
    let failed = 0;
    for (const [i, file] of all.entries()) {
      setProgress(Math.round((i / all.length) * 100));
      const data = new FormData();
      data.append("file", file);
      data.append("private", onlyMe ? "true" : "false");
      const resp = await fetch("/api/vault/files", { method: "POST", credentials: "same-origin", body: data }).catch(() => null);
      if (!resp?.ok) failed += 1;
    }
    setProgress(null);
    setNotice(failed ? t("vault.uploadFailed", { n: failed }) : "");
    if (anyFileRef.current) anyFileRef.current.value = "";
    void refreshResource("vault");
  }

  async function remove(item: VaultItem) {
    if (item.source === "file") await api.del(`/api/vault/files/${item.id}`).catch(() => {});
    else if (item.media_id) await api.del(`/api/media/${item.media_id}`).catch(() => {});
    else return;
    setOpen(null);
  }

  async function keepIn(item: VaultItem, albumId: string) {
    if (!item.media_id || !albumId) return;
    try {
      await api.post(`/api/vault/media/${item.media_id}/copy`, { album_id: albumId });
      setNotice(t("vault.saved", { name: photoAlbums.find((a) => a.id === albumId)?.name ?? "" }));
    } catch {
      setNotice(t("common.error"));
    }
  }

  function openItem(item: VaultItem) {
    setNotice("");
    setOpen(item);
  }

  // A kept receipt's photo: shown like the vault's other pictures.
  function openReceiptPhoto(mediaId: string, title: string) {
    const item = items?.find((i) => i.media_id === mediaId);
    if (item) openItem({ ...item, title });
    else window.open(`/api/media/${mediaId}/web`, "_blank", "noopener");
  }

  // A file of a document in the Documents view, opened like any of the vault's files.
  function openDocument({ doc, file }: DocumentFileView) {
    const url = `/api/documents/${doc.id}/files/${file.id}`;
    const image = file.content_type.startsWith("image/");
    openItem({
      id: file.id, source: "document", kind: image ? "image" : "file", title: doc.title, context: doc.owner_name ?? "",
      created_at: "", media_id: null, content_type: file.content_type, previewable: canPreview(file.content_type),
      thumb: image ? url : null, url, link: null, album_id: null, can_delete: false,
    });
  }

  // Adults share with a link that runs out; children don't.
  const adult = me.role === "admin" || me.role === "adult";
  const [sharing, setSharing] = useState<{ kind: VaultShareKind; id: string; title: string; downloadOnly?: boolean } | null>(null);
  const shareOf = (item: VaultItem) =>
    item.source === "document" || item.source === "file"
      ? { kind: item.source, id: item.id, title: item.title, downloadOnly: !item.previewable }
      : item.media_id
        ? { kind: "media" as const, id: item.media_id, title: item.title, downloadOnly: false }
        : null;

  const canUpload = view === "photo" || album?.kind === "user";
  const hint: Partial<Record<View, TranslationKey>> = { receipt: "vault.receiptsHint", chat: "vault.chatHint" };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageTitle title={t("vault.title")} />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          className="input w-full !pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("vault.search")}
          aria-label={t("vault.search")}
        />
      </div>

      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1" role="group" aria-label={t("vault.filters")}>
        {VIEWS.filter((v) => v !== "shares" || adult).map((v) => (
          <button
            key={v}
            onClick={() => choose(v)}
            aria-pressed={view === v}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${view === v ? "border-accent bg-accent-soft font-semibold text-ink" : "border-edge bg-card text-muted hover:text-ink"}`}
          >
            {t(`vault.filter.${v}` as TranslationKey)}
          </button>
        ))}
      </div>

      {view === "all" && !query && <Memories />}

      {album && (
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => setAlbum(null)} className="text-sm text-muted hover:text-ink">
            ← {t("photos.backToAlbums")}
          </button>
          <h2 className="flex items-center gap-1.5 text-lg font-bold">
            {album.kind === "chat" && <MessageCircle className="h-5 w-5 text-accent" aria-hidden />}
            {album.name}
          </h2>
          {album.kind === "user" && adult && (
            <button onClick={() => setSharing({ kind: "album", id: album.id, title: album.name })} className="ml-auto flex items-center gap-1 text-sm text-accent hover:underline">
              <Link2 className="h-4 w-4" aria-hidden />
              {t("vault.share")}
            </button>
          )}
          {album.kind === "user" && (me.role === "admin" || album.created_by === me.id) && (
            <button onClick={() => deleteAlbum(album)} className={`${adult ? "" : "ml-auto "}text-sm text-red-600 hover:underline`}>
              {t("common.remove")}
            </button>
          )}
        </div>
      )}

      {(view === "file" || (view === "all" && !album)) && (
        <div className="flex flex-wrap items-center gap-3">
          <input ref={anyFileRef} type="file" multiple className="hidden" onChange={(e) => uploadFiles(e.target.files)} />
          <button onClick={() => anyFileRef.current?.click()} disabled={progress !== null} className="btn btn-primary flex items-center gap-1.5">
            <Upload className="h-4 w-4" aria-hidden />
            {progress !== null ? t("photos.uploading", { pct: progress }) : t("vault.uploadFiles")}
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={onlyMe} onChange={(e) => setOnlyMe(e.target.checked)} />
            {t("vault.onlyMe")}
          </label>
          {notice && !open && (
            <span role="status" className="text-sm text-muted">
              {notice}
            </span>
          )}
        </div>
      )}

      {canUpload && (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" multiple accept={UPLOAD_TYPES} className="hidden" onChange={(e) => upload(e.target.files)} />
          {!album && photoAlbums.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              {t("vault.uploadTo")}
              <select className="input py-1.5" value={uploadTo} onChange={(e) => setUploadTo(e.target.value)}>
                {photoAlbums.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button onClick={() => fileRef.current?.click()} disabled={progress !== null} className="btn btn-primary">
            {progress !== null ? t("photos.uploading", { pct: progress }) : t("photos.upload")}
          </button>
        </div>
      )}

      {view === "receipt" ? (
        <>
          <Receipts query={query} onOpenPhoto={openReceiptPhoto} />
          {shown.some((i) => i.link !== "/vault?view=receipt") && (
            <>
              <h2 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted">{t("receipts.ofExpenses")}</h2>
              <Grid items={shown.filter((i) => i.link !== "/vault?view=receipt")} onOpen={openItem} onShare={adult ? (item) => setSharing(shareOf(item)) : undefined} />
            </>
          )}
        </>
      ) : view === "document" ? (
        <Documents embedded onOpenFile={openDocument} onShareFile={adult ? ({ doc, file }) => setSharing({ kind: "document", id: file.id, title: doc.title, downloadOnly: !canPreview(file.content_type) }) : undefined} />
      ) : view === "shares" ? (
        <SharedLinks />
      ) : view === "logins" ? (
        <Passwords query={query} />
      ) : view === "albums" && !album ? (
        <>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              value={newAlbum}
              onChange={(e) => setNewAlbum(e.target.value)}
              placeholder={t("photos.albumNamePh")}
              aria-label={t("photos.albumNamePh")}
              onKeyDown={(e) => e.key === "Enter" && createAlbum()}
            />
            <button onClick={createAlbum} className="btn btn-primary">
              {t("photos.createAlbum")}
            </button>
          </div>
          {albums.length === 0 ? (
            <EmptyState>{t("photos.noAlbums")}</EmptyState>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {albums
                .filter((a) => !query || a.name.toLowerCase().includes(query.trim().toLowerCase()))
                .map((a) => (
                  <div key={`${a.kind}-${a.id}`} className="relative">
                    <button onClick={() => setAlbum(a)} className="card block w-full overflow-hidden text-left hover:border-accent">
                      <span className="block aspect-[4/3] bg-base">
                        {a.cover ? (
                          <img src={`/api/media/${a.cover}/thumb`} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <span className="grid h-full place-items-center">
                            <Folder className="h-8 w-8 text-accent" strokeWidth={1.5} aria-hidden />
                          </span>
                        )}
                      </span>
                      <span className="block p-3">
                        <span className="flex items-center gap-1.5 truncate font-medium">
                          {a.kind === "chat" && <MessageCircle className="h-4 w-4 shrink-0 text-accent" aria-label={t("vault.filter.chat")} />}
                          <span className="truncate">{a.name}</span>
                        </span>
                        <span className="block text-sm text-muted">{t("photos.itemCount", { n: a.item_count })}</span>
                      </span>
                    </button>
                    {adult && a.kind === "user" && (
                      <button
                        onClick={() => setSharing({ kind: "album", id: a.id, title: a.name })}
                        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white hover:bg-black/75"
                        aria-label={t("vault.shareTitle", { name: a.name })}
                        title={t("vault.share")}
                      >
                        <Link2 className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </div>
                ))}
            </div>
          )}
        </>
      ) : items === null ? (
        <p className="text-sm text-muted">{t("common.loading")}</p>
      ) : shown.length === 0 ? (
        <EmptyState>{query ? t("vault.noMatches") : album ? t("photos.empty") : t((hint[view] ?? "vault.empty") as TranslationKey)}</EmptyState>
      ) : (
        <Grid items={shown} onOpen={openItem} onShare={adult ? (item) => setSharing(shareOf(item)) : undefined} showSource={view === "all"} />
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4" onClick={() => setOpen(null)} role="dialog" aria-label={open.title}>
          <div className="flex items-start gap-3 text-white" onClick={(e) => e.stopPropagation()}>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{open.title}</p>
              {open.context && <p className="truncate text-sm text-white/70">{open.context}</p>}
            </div>
            <button onClick={() => setOpen(null)} aria-label={t("common.close")}>
              <X className="h-7 w-7" strokeWidth={1.75} />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center py-3" onClick={(e) => e.stopPropagation()}>
            {open.kind === "video" ? (
              <video src={open.url} controls className="max-h-full max-w-full" />
            ) : open.kind === "file" ? (
              // A PDF or Word document is shown here; other office files are downloaded.
              <FileViewer
                url={open.url}
                contentType={open.content_type}
                name={open.title}
                fallback={
                  <a href={open.url} download className="flex flex-col items-center gap-2 rounded-xl bg-white/10 p-6 text-white hover:bg-white/20">
                    <FileText className="h-12 w-12" strokeWidth={1.5} aria-hidden />
                    {t("vault.downloadDocument")}
                  </a>
                }
              />
            ) : (
              <img src={open.url} alt={open.title} className="max-h-full max-w-full object-contain" />
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-white" onClick={(e) => e.stopPropagation()}>
            {open.link && open.link !== "/vault" && appName(open.link, t) && (
              <Link href={open.link} className="rounded-full bg-white/15 px-3 py-1.5 hover:bg-white/25">
                {t("vault.openIn", { app: appName(open.link, t) ?? "" })}
              </Link>
            )}
            {open.source !== "photo" && open.media_id && photoAlbums.length > 0 && (
              <label className="flex items-center gap-2 rounded-full bg-white/15 px-3 py-1">
                {t("vault.saveTo")}
                <select
                  className="rounded bg-white/90 px-1 py-0.5 text-ink"
                  value=""
                  onChange={(e) => keepIn(open, e.target.value)}
                  aria-label={t("vault.saveTo")}
                >
                  <option value="">…</option>
                  {photoAlbums.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {adult && shareOf(open) && (
              <button onClick={() => setSharing(shareOf(open))} className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 hover:bg-white/25">
                <Link2 className="h-4 w-4" aria-hidden />
                {t("vault.share")}
              </button>
            )}
            {open.can_delete && (
              <button onClick={() => remove(open)} className="rounded-full bg-red-600/80 px-3 py-1.5 hover:bg-red-600">
                {t("common.remove")}
              </button>
            )}
            {notice && <span role="status">{notice}</span>}
          </div>
        </div>
      )}
      {sharing && <ShareDialog kind={sharing.kind} targetId={sharing.id} title={sharing.title} downloadOnly={sharing.downloadOnly} onClose={() => setSharing(null)} />}
    </div>
  );
}
