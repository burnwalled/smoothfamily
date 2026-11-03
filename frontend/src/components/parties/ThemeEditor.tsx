"use client";

// Making a party theme of one's own (3.4.0): its colours, a pattern, the emoji that decorate it,
// and its own pictures – a top picture and a background. Kept for the family to use again.
import { useState } from "react";
import { ImagePlus, Trash2, X } from "lucide-react";
import { api, uploadFile } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { setApiData } from "@/lib/query";
import { CustomTheme, PatternKey, customTheme, themeStyle } from "@/lib/partyThemes";
import { THEMES_PATH, hostPicture } from "@/components/parties/ThemePicker";

const PATTERNS: PatternKey[] = ["none", "confetti", "dots", "stars", "stripes", "hearts", "check"];
const START = { name: "", bg: "#fff1f4", bg2: "#f4f7ff", accent: "#e85d75", ink: "#3b2430", pattern: "confetti" as PatternKey, decor: "🎉🎈✨" };

type Props = { theme: CustomTheme | null; onClose: () => void; onSaved: (t: CustomTheme) => void; onDeleted: () => void };

export default function ThemeEditor({ theme, onClose, onSaved, onDeleted }: Props) {
  const { t } = useI18n();
  const [saved, setSaved] = useState<CustomTheme | null>(theme);
  const [form, setForm] = useState(theme ? { name: theme.name, bg: theme.bg, bg2: theme.bg2, accent: theme.accent, ink: theme.ink, pattern: theme.pattern, decor: theme.decor } : START);
  const [error, setError] = useState("");
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const keep = (next: CustomTheme) => {
    setSaved(next);
    setApiData<CustomTheme[]>(THEMES_PATH, (all) => (all?.some((x) => x.id === next.id) ? all.map((x) => (x.id === next.id ? next : x)) : [...(all ?? []), next]));
  };
  const preview = customTheme({ id: saved?.id ?? "", header: saved?.header ?? null, background: saved?.background ?? null, ...form }, hostPicture(saved?.id ?? ""));

  async function run(action: () => Promise<void>) {
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  const save = () => run(async () => {
    const next = saved ? await api.put<CustomTheme>(`${THEMES_PATH}/${saved.id}`, form) : await api.post<CustomTheme>(THEMES_PATH, form);
    keep(next);
    onSaved(next);
  });

  const picture = (slot: "header" | "background") => (
    <div className="space-y-1">
      <span className="label">{t(slot === "header" ? "parties.headerPicture" : "parties.backgroundPicture")}</span>
      {saved?.[slot] ? (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hostPicture(saved.id)(slot, saved[slot]!)} alt="" className="h-12 w-20 rounded object-cover" />
          <button type="button" className="text-muted hover:text-red-700" aria-label={t("parties.removePicture")} onClick={() => run(async () => keep((await api.del(`${THEMES_PATH}/${saved.id}/pictures/${slot}`)) as unknown as CustomTheme))}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : (
        <label className={`flex w-fit items-center gap-1.5 rounded-lg border border-edge px-2 py-1 text-xs ${saved ? "cursor-pointer hover:bg-surface" : "cursor-not-allowed opacity-50"}`}>
          <ImagePlus className="h-4 w-4" aria-hidden />
          {t("parties.addPicture")}
          <input type="file" accept="image/*" className="sr-only" disabled={!saved} onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && saved) void run(async () => keep(await uploadFile<CustomTheme>(`${THEMES_PATH}/${saved.id}/pictures/${slot}`, file)));
            e.target.value = "";
          }} />
        </label>
      )}
    </div>
  );

  const color = (key: "bg" | "bg2" | "accent" | "ink", label: TranslationKey) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="color" className="h-8 w-10 cursor-pointer rounded border border-edge" value={form[key]} onChange={(e) => set({ [key]: e.target.value })} />
      {t(label)}
    </label>
  );

  return (
    <section className="mt-3 space-y-3 rounded-xl border border-edge bg-surface p-4" aria-label={t("parties.themeEditor")}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">{saved ? t("parties.editTheme", { name: saved.name }) : t("parties.newTheme")}</h3>
        <button type="button" className="text-muted hover:text-ink" aria-label={t("common.close")} onClick={onClose}><X className="h-4 w-4" aria-hidden /></button>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
        <div className="space-y-3">
          <label className="block"><span className="label">{t("parties.themeName")}</span><input className="input" value={form.name} maxLength={60} placeholder={t("parties.themeNamePh")} onChange={(e) => set({ name: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-2">
            {color("bg", "parties.colorTop")}
            {color("bg2", "parties.colorBottom")}
            {color("accent", "parties.colorAccent")}
            {color("ink", "parties.colorText")}
          </div>
          <label className="block">
            <span className="label">{t("parties.pattern")}</span>
            <select className="input" value={form.pattern} onChange={(e) => set({ pattern: e.target.value as PatternKey })}>
              {PATTERNS.map((p) => <option key={p} value={p}>{t(`parties.pattern.${p}` as TranslationKey)}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">{t("parties.decor")}</span><input className="input text-lg" value={form.decor} maxLength={60} onChange={(e) => set({ decor: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-2">
            {picture("header")}
            {picture("background")}
          </div>
          {!saved && <p className="text-xs text-muted">{t("parties.picturesAfterSave")}</p>}
        </div>
        <div className="overflow-hidden rounded-xl border border-edge" aria-hidden>
          <div className="h-48" style={themeStyle(preview)}>
            <div className="h-1.5" style={{ background: preview.band }} />
            {preview.header && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.header} alt="" className="h-16 w-full object-cover" />
            )}
            <p className="mt-2 text-center text-2xl font-extrabold" style={{ color: preview.ink }}>{form.name || t("parties.themeNamePh")}</p>
            <p className="mt-1 text-center text-xl">{preview.decor.slice(0, 5).join(" ")}</p>
            <div className="mx-auto mt-2 w-28 rounded-lg py-1 text-center text-xs font-semibold text-white" style={{ backgroundColor: preview.accent }}>{t("party.send")}</div>
          </div>
        </div>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" disabled={!form.name.trim()} onClick={save}>{saved ? t("common.save") : t("parties.saveTheme")}</button>
        {saved && (
          <button type="button" className="text-xs text-red-700 hover:underline" onClick={() => window.confirm(t("parties.deleteThemeConfirm", { name: saved.name })) && run(async () => {
            await api.del(`${THEMES_PATH}/${saved.id}`);
            setApiData<CustomTheme[]>(THEMES_PATH, (all) => (all ?? []).filter((x) => x.id !== saved.id));
            onDeleted();
          })}>
            {t("parties.deleteTheme")}
          </button>
        )}
      </div>
    </section>
  );
}
