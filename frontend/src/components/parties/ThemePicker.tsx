"use client";

// Choosing a party page's look (3.4.0): the themes that suit the kind of party first, the others a
// tap away, and the family's own – made here, kept to use again.
import { useState } from "react";
import { ChevronDown, Pencil, Plus } from "lucide-react";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { useApi } from "@/lib/query";
import { CATEGORIES, CustomTheme, PARTY_THEMES, PartyTheme, customTheme, kindCategory, themeStyle } from "@/lib/partyThemes";
import { FONTS } from "@/lib/partyFonts";
import { libraryUrl } from "@/lib/partyLibrary";
import ThemeEditor from "@/components/parties/ThemeEditor";

export const THEMES_PATH = "/api/parties/themes";
export const hostPicture = (id: string) => (slot: "header" | "background", v: string) => `${THEMES_PATH}/${id}/pictures/${slot}?v=${v}`;

export function ThemeSwatch({ theme, label, selected, onClick }: { theme: PartyTheme; label: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onClick} className={`rounded-xl border-2 p-1.5 text-left text-xs ${selected ? "border-accent" : "border-edge"}`}>
      {/* The library's big pictures stay out of the swatch; its stickers show instead of emoji. */}
      <span className="relative block h-14 overflow-hidden rounded-lg" style={themeStyle(theme.category === "custom" ? theme : { ...theme, image: undefined })}>
        <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: theme.band }} />
        {theme.header && theme.category === "custom" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={theme.header} alt="" className="absolute inset-x-0 top-1.5 h-5 w-full object-cover" />
        )}
        <span className="absolute inset-x-0 top-3 text-center text-lg leading-none" style={{ fontFamily: FONTS[theme.fonts].display, color: theme.accent }} aria-hidden>Aa</span>
        <span className="absolute inset-x-0 bottom-1 flex items-center justify-center gap-0.5 text-sm" aria-hidden>
          {theme.stickers.length
            ? theme.stickers.slice(0, 3).map((id) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={id} src={libraryUrl(id)} alt="" className="h-5 w-5 object-contain" loading="lazy" />
            ))
            : theme.decor.slice(0, 4).join("")}
        </span>
      </span>
      <span className="mt-1 block truncate font-semibold">{label}</span>
    </button>
  );
}

type Props = { value: string; customId: string | null; onChange: (key: string, customId: string | null) => void; label: string; kind: string; allowSame?: boolean };

export default function ThemePicker({ value, customId, onChange, label, kind, allowSame = false }: Props) {
  const { t } = useI18n();
  const own = useApi<CustomTheme[]>(THEMES_PATH).data ?? [];
  const first = kindCategory(kind);
  const current = PARTY_THEMES.find((x) => x.key === value);
  const [more, setMore] = useState(!!current && current.category !== first);
  const [editing, setEditing] = useState<CustomTheme | "new" | null>(null);
  const order = [first, ...CATEGORIES.filter((c) => c !== first)];

  const group = (category: string) => (
    <div key={category}>
      <p className="mb-1 mt-2 text-xs font-semibold text-muted">{t(`parties.cat.${category}` as TranslationKey)}</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {PARTY_THEMES.filter((x) => x.category === category).map((theme) => (
          <ThemeSwatch key={theme.key} theme={theme} label={t(`parties.theme.${theme.key}` as TranslationKey)} selected={value === theme.key} onClick={() => onChange(theme.key, null)} />
        ))}
      </div>
    </div>
  );

  return (
    <div role="radiogroup" aria-label={label}>
      <span className="label">{label}</span>
      {allowSame && (
        <button type="button" role="radio" aria-checked={value === ""} onClick={() => onChange("", null)} className={`mb-1 rounded-xl border-2 px-3 py-1.5 text-xs font-semibold ${value === "" ? "border-accent" : "border-edge"}`}>
          {t("parties.themeSame")}
        </button>
      )}
      {group(order[0])}
      <div>
        <p className="mb-1 mt-3 text-xs font-semibold text-muted">{t("parties.cat.custom")}</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {own.map((c) => (
            <div key={c.id} className="relative">
              <ThemeSwatch theme={customTheme(c, hostPicture(c.id))} label={c.name} selected={value === "custom" && customId === c.id} onClick={() => onChange("custom", c.id)} />
              <button type="button" className="absolute right-2 top-2 rounded-full bg-white/90 p-1 text-muted shadow hover:text-ink" aria-label={t("parties.editTheme", { name: c.name })} onClick={() => setEditing(c)}>
                <Pencil className="h-3 w-3" aria-hidden />
              </button>
            </div>
          ))}
          <button type="button" className="flex min-h-[5.5rem] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-edge p-2 text-xs font-semibold text-muted hover:text-ink" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden />
            {t("parties.newTheme")}
          </button>
        </div>
      </div>
      {editing && (
        <ThemeEditor
          theme={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            onChange("custom", saved.id);
          }}
          onDeleted={() => setEditing(null)}
        />
      )}
      <button type="button" className="mt-3 flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink" aria-expanded={more} onClick={() => setMore(!more)}>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${more ? "rotate-180" : ""}`} aria-hidden />
        {t("parties.moreThemes")}
      </button>
      {more && order.slice(1).map(group)}
    </div>
  );
}
