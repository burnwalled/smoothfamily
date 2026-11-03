"use client";

// Choosing a party page's look (3.4.0): a small picture of each theme.
import { TranslationKey, useI18n } from "@/lib/i18n";
import { PARTY_THEMES } from "@/lib/partyThemes";

export default function ThemePicker({ value, onChange, label, allowSame = false }: { value: string; onChange: (key: string) => void; label: string; allowSame?: boolean }) {
  const { t } = useI18n();
  return (
    <div role="radiogroup" aria-label={label}>
      <span className="label">{label}</span>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {allowSame && (
          <button type="button" role="radio" aria-checked={value === ""} onClick={() => onChange("")} className={`rounded-xl border-2 p-2 text-left text-xs ${value === "" ? "border-accent" : "border-edge"}`}>
            <span className="block h-10 rounded-lg bg-base" />
            <span className="mt-1 block font-semibold">{t("parties.themeSame")}</span>
          </button>
        )}
        {PARTY_THEMES.map((theme) => (
          <button key={theme.key} type="button" role="radio" aria-checked={value === theme.key} onClick={() => onChange(theme.key)} className={`rounded-xl border-2 p-2 text-left text-xs ${value === theme.key ? "border-accent" : "border-edge"}`}>
            <span className="relative block h-10 overflow-hidden rounded-lg" style={{ background: theme.background }}>
              <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: theme.band }} />
              <span className="absolute inset-0 flex items-center justify-center gap-1 text-base" aria-hidden>{theme.decor.slice(0, 3).join("")}</span>
            </span>
            <span className="mt-1 block font-semibold">{t(`parties.theme.${theme.key}` as TranslationKey)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
