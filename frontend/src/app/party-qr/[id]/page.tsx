"use client";

// The party day's QR code to put on the tables (3.4.0): a page in the party's own theme, made for
// printing. Outside the app's frame so nothing else is printed; the member's own session reads the
// data. Preparing the link here doesn't open the portal: that follows its set time.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Printer } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { libraryUrl } from "@/lib/partyLibrary";
import { fontFamily } from "@/lib/poster";
import { CustomTheme, customTheme, partyTheme, themeStyle } from "@/lib/partyThemes";
import "@/app/party/[token]/party.css";

type Party = { title: string; emoji: string; page_theme: string; page_custom_id: string | null; portal: { qr_svg: string } | null };

async function call<T>(path: string, method = "GET"): Promise<T> {
  const resp = await fetch(path, { method, credentials: "same-origin", cache: "no-store" });
  if (!resp.ok) throw new Error(String(resp.status));
  return resp.json();
}

export default function PartyQrPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const [party, setParty] = useState<Party | null>(null);
  const [own, setOwn] = useState<CustomTheme | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      let p = await call<Party>(`/api/parties/${id}`);
      if (!p.portal) p = await call<Party>(`/api/parties/${id}/portal/prepare`, "POST");
      if (p.page_theme === "custom") {
        const themes = await call<CustomTheme[]>("/api/parties/themes");
        setOwn(themes.find((x) => x.id === p.page_custom_id) ?? null);
      }
      setParty(p);
    })().catch(() => setError(true));
  }, [id]);

  if (error) return <main className="p-6 text-center text-sm text-muted">{t("common.error")}</main>;
  if (!party?.portal) return <main className="p-6 text-center text-sm text-muted">{t("common.loading")}</main>;
  const theme = party.page_theme === "custom" && own ? customTheme(own, (slot, v) => `/api/parties/themes/${own.id}/pictures/${slot}?v=${v}`) : partyTheme(party.page_theme);
  return (
    <main className="pt pt-print flex min-h-screen flex-col" style={themeStyle(theme)}>
      <div className="flex justify-center gap-2 p-3 print:hidden">
        <button className="pt-btn" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden />{t("parties.portalPrintButton")}</button>
      </div>
      <div className="h-2" style={{ background: theme.band }} />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-6 py-10 text-center">
        <p className="flex items-center justify-center gap-3 text-5xl" aria-hidden>
          {theme.stickers.length
            // eslint-disable-next-line @next/next/no-img-element
            ? theme.stickers.slice(0, 3).map((s) => <img key={s} src={libraryUrl(s)} alt="" className="h-20 w-20 object-contain" />)
            : theme.decor.slice(0, 3).map((e) => <span key={e}>{e}</span>)}
        </p>
        <h1 className="pt-gold text-6xl leading-none" style={{ fontFamily: fontFamily("theme-display", theme, "display") }}>{party.title}</h1>
        <p className="text-4xl leading-tight" style={{ fontFamily: fontFamily("theme-script", theme, "script") }}>{t("parties.portalPrint")}</p>
        <div className="w-80 max-w-full rounded-3xl bg-white p-5 shadow-2xl [&>svg]:h-auto [&>svg]:w-full" aria-label={t("parties.qr")} dangerouslySetInnerHTML={{ __html: party.portal.qr_svg }} />
      </div>
    </main>
  );
}
