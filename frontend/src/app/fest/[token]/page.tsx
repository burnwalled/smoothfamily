"use client";

// The party day's portal (3.4.0), opened from the QR code on the table – no account: the day's
// poster in the party's theme, the plan, the playlist, and a place to upload one's photos (they go
// to the family's album for the party), with the photos so far if the hosts show them.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Camera, Check } from "lucide-react";
import { uploadFile, api } from "@/lib/api";
import { isLocale, useI18n } from "@/lib/i18n";
import { CustomTheme, customTheme, partyTheme, themeStyle } from "@/lib/partyThemes";
import PartySky from "@/components/parties/PartySky";
import Poster from "@/components/parties/Poster";
import { Block, PosterData, defaultPoster } from "@/lib/poster";

type Portal = {
  title: string; kind: string; emoji: string; family_name: string; language: string; starts_at: string; ends_at: string; place: string; address: string;
  theme: string; invitation: string; page_theme: string; page_custom: CustomTheme | null; invite_image: string | null;
  layout: Block[] | null; assets: { id: string; v: string | null }[]; playlist_url: string | null;
  steps: { at: string; title: string }[]; gallery: boolean; photos: string[];
};

function Upload({ token, onUploaded }: { token: string; onUploaded: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("sf.guest-name") ?? "";
    } catch {
      return "";
    }
  });
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function send(files: FileList) {
    setError("");
    setNote("");
    try {
      localStorage.setItem("sf.guest-name", name.trim());
    } catch {}
    const list = Array.from(files).slice(0, 30);
    let done = 0;
    setBusy({ done, total: list.length });
    for (const f of list) {
      try {
        await uploadFile(`/api/party-portal/${token}/photos?name=${encodeURIComponent(name.trim())}`, f);
        done += 1;
        setBusy({ done, total: list.length });
      } catch (e) {
        setError(e instanceof Error ? e.message : t("common.error"));
      }
    }
    setBusy(null);
    if (done) {
      setNote(t("portal.uploaded", { n: done }));
      onUploaded();
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{t("portal.uploadHelp")}</p>
      <label className="block"><span className="label">{t("portal.yourName")}</span><input className="input" value={name} maxLength={60} autoComplete="given-name" onChange={(e) => setName(e.target.value)} /></label>
      <label className={`pt-btn w-full cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
        <Camera className="h-5 w-5" aria-hidden />
        {busy ? t("portal.uploading", { done: busy.done, total: busy.total }) : t("portal.choose")}
        <input type="file" accept="image/*,video/*" multiple className="sr-only" onChange={(e) => { if (e.target.files?.length) void send(e.target.files); e.target.value = ""; }} />
      </label>
      {note && <p className="flex items-center gap-1.5 text-sm font-semibold text-accent" role="status"><Check className="h-4 w-4" aria-hidden />{note}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

export default function PartyPortal() {
  const { token } = useParams<{ token: string }>();
  const { t, dateLocale, setLocale } = useI18n();
  const [page, setPage] = useState<Portal | null>(null);
  const [invalid, setInvalid] = useState(false);
  const load = useCallback(() => {
    api.get<Portal>(`/api/party-portal/${token}`)
      .then((p) => {
        setPage(p);
        try {
          if (!localStorage.getItem("sf.locale") && isLocale(p.language)) setLocale(p.language);
        } catch {}
      })
      .catch(() => setInvalid(true));
  }, [token, setLocale]);
  useEffect(load, [load]);

  if (invalid) return <main className="mx-auto max-w-lg p-6 text-center text-muted">{t("party.invalid")}</main>;
  if (!page) return <main className="mx-auto max-w-lg p-6 text-center text-muted">{t("common.loading")}</main>;
  const own = page.page_custom;
  const theme = page.page_theme === "custom" && own ? customTheme(own, (slot, v) => `/api/party-portal/${token}/themes/${own.id}/${slot}?v=${v}`) : partyTheme(page.page_theme);
  const d: PosterData = {
    title: page.title, family: page.family_name, emoji: page.emoji, start: new Date(page.starts_at), end: new Date(page.ends_at), place: page.place, address: page.address,
    theme: page.theme, invitation: page.invitation, rsvp: null, poll: false, guests: null, locale: dateLocale,
    inviteImage: page.invite_image ? `/api/party-portal/${token}/picture?v=${page.invite_image}` : null,
    asset: (id) => `/api/party-portal/${token}/assets/${id}?v=${page.assets.find((x) => x.id === id)?.v ?? ""}`,
    ics: "", thanks: false, playlist: page.playlist_url, steps: page.steps,
  };
  const blocks = page.layout?.length ? page.layout : defaultPoster(theme, d, t, "portal");
  const gallery = page.gallery ? (
    page.photos.length ? (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {page.photos.map((id) => (
          <a key={id} href={`/api/party-portal/${token}/photos/${id}?variant=view`} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/party-portal/${token}/photos/${id}?variant=thumb`} alt="" className="aspect-square w-full rounded-lg object-cover" loading="lazy" />
          </a>
        ))}
      </div>
    ) : <p className="text-sm text-muted">{t("portal.noPhotos")}</p>
  ) : null;

  return (
    <main className="pt" lang={page.language} style={themeStyle(theme)}>
      <PartySky effect={theme.effect} colors={theme.sparks} />
      <div className="relative z-10 h-2" style={{ background: theme.band }} />
      {theme.header && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={theme.header} alt="" className="relative z-10 mx-auto h-40 w-full max-w-5xl object-cover sm:h-60 sm:rounded-b-3xl" />
      )}
      <div className="relative z-10 mx-auto max-w-5xl space-y-6 px-4 pb-10 sm:px-6">
        <Poster blocks={blocks} d={d} theme={theme} slots={{ upload: <Upload token={token} onUploaded={load} />, gallery, subscribe: null }} />
      </div>
    </main>
  );
}
