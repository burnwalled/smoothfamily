"use client";

// A party's templates (3.4.0): put all its posters and its look on at once – the built-in ones, those
// the family saved, or one written by any AI from the prompt made here, seen before it's used. Everything
// stays editable afterwards under the posters.
import { useMemo, useState } from "react";
import { Copy, Download, Eye, Sparkles, Trash2, Upload, X } from "lucide-react";
import { api } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { setApiData, useApi } from "@/lib/query";
import { LIBRARY } from "@/lib/partyLibrary";
import { CustomTheme, PARTY_THEMES, customTheme, partyTheme, themeStyle } from "@/lib/partyThemes";
import { STAGES, type Block, type PosterData, type Stage, defaultPoster } from "@/lib/poster";
import { MAX_TEMPLATE_CHARS, Template, TemplateError, TemplateWarning, galaTemplate, parseTemplate, portableLayouts, templateFile, templatePrompt } from "@/lib/posterTemplate";
import Poster from "@/components/parties/Poster";
import { THEMES_PATH } from "@/components/parties/ThemePicker";

const TEMPLATES_PATH = "/api/parties/templates";
const NO_PICTURE = () => (_slot: "header" | "background", _v: string) => "";

type PartyBits = { id: string; kind: string; layouts: Partial<Record<Stage, Block[] | null>>; page_theme: string; page_custom_id: string | null };
type Props = { party: PartyBits; data: PosterData; customId: string | null; onApplied: (detail: unknown) => void };

function themeOf(tpl: Template, name: string) {
  return tpl.look ? customTheme({ ...tpl.look, id: "preview", name, header: null, background: null }, NO_PICTURE()) : partyTheme(tpl.theme);
}

// A template's posters, a page at a time, as the guests would see them with this party's details.
function Preview({ tpl, data, error, onUse, onClose }: { tpl: Template; data: PosterData; error: string; onUse: () => void; onClose: () => void }) {
  const { t } = useI18n();
  const T = (k: string, v?: Record<string, string | number>) => t(k as TranslationKey, v);
  const first = STAGES.find((st) => tpl.layouts[st]?.length) ?? "invite";
  const [stage, setStage] = useState<Stage>(first);
  const theme = themeOf(tpl, tpl.name);
  const d = { ...data, thanks: stage === "thanks" };
  const blocks = tpl.layouts[stage]?.length ? tpl.layouts[stage]! : defaultPoster(theme, d, T, stage);
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-base p-3 sm:p-5" role="dialog" aria-modal="true" aria-label={t("template.preview")}>
      <div className="mx-auto max-w-5xl space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold">{tpl.name}</h2>
          <div role="tablist" aria-label={t("parties.posters")} className="inline-flex overflow-hidden rounded-lg border border-edge">
            {STAGES.map((st) => <button key={st} role="tab" aria-selected={stage === st} className={`px-3 py-1.5 text-sm ${stage === st ? "bg-accent-soft font-semibold" : "hover:bg-surface"}`} onClick={() => setStage(st)}>{T(`parties.stage.${st}`)}</button>)}
          </div>
          <button className="btn-primary ml-auto" onClick={onUse}>{t("template.use")}</button>
          <button className="flex items-center gap-1 rounded-lg border border-edge px-3 py-1.5 text-sm hover:bg-surface" onClick={onClose}><X className="h-4 w-4" aria-hidden />{t("common.close")}</button>
        </div>
        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
        <div className="pt overflow-hidden rounded-2xl border border-edge" style={themeStyle(theme)}>
          <div className="h-2" style={{ background: theme.band }} />
          <div className="px-4 py-6 sm:px-8"><Poster blocks={blocks} d={d} theme={theme} /></div>
        </div>
      </div>
    </div>
  );
}

export default function TemplatePicker({ party, data, customId, onApplied }: Props) {
  const { t, locale } = useI18n();
  const T = (k: string, v?: Record<string, string | number>) => t(k as TranslationKey, v);
  const own = useApi<Template[]>(TEMPLATES_PATH).data ?? [];
  const gala = useMemo(() => galaTemplate(T), [locale]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showing, setShowing] = useState<Template | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [making, setMaking] = useState(false);
  const [wishes, setWishes] = useState("");
  const [copied, setCopied] = useState(false);
  const [answer, setAnswer] = useState("");
  const [read, setRead] = useState<{ template: Template; warnings: TemplateWarning[] } | null>(null);

  const known = useMemo(() => ({ themes: PARTY_THEMES.map((x) => x.key), pictures: LIBRARY.map((x) => x.id) }), []);
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : t("common.error"));

  // An own look becomes one of the family's themes – the same one, when it's been used before.
  async function themeFor(tpl: Template): Promise<{ page_theme: string; page_custom_id: string | null }> {
    if (!tpl.look) {
      const key = tpl.theme ?? party.page_theme;
      const custom = key === "custom" ? party.page_custom_id : null;
      return { page_theme: key, page_custom_id: custom };
    }
    const themes = await api.get<CustomTheme[]>(THEMES_PATH);
    const look = tpl.look;
    let theme = themes.find((x) => x.bg === look.bg && x.bg2 === look.bg2 && x.accent === look.accent && x.ink === look.ink && x.pattern === look.pattern && x.font === look.font && x.effect === look.effect && x.decor === look.decor);
    if (!theme) {
      theme = await api.post<CustomTheme>(THEMES_PATH, { ...look, name: (tpl.name || t("template.ownLook")).slice(0, 60) });
      themes.push(theme);
    }
    setApiData<CustomTheme[]>(THEMES_PATH, () => themes);
    return { page_theme: "custom", page_custom_id: theme.id };
  }

  async function use(tpl: Template) {
    if (!window.confirm(t("template.useConfirm", { name: tpl.name || t("template.unnamed") }))) return;
    setError("");
    try {
      const layouts = Object.fromEntries(STAGES.map((st) => [st, tpl.layouts[st] ?? []]));
      onApplied(await api.put(`/api/parties/${party.id}`, { ...(await themeFor(tpl)), layouts }));
      setShowing(null);
      setRead(null);
      setMaking(false);
      setNote(t("template.used", { name: tpl.name || t("template.unnamed") }));
    } catch (e) {
      fail(e);
    }
  }

  async function keep(tpl: Template) {
    setError("");
    try {
      const saved = await api.post<Template>(TEMPLATES_PATH, tpl);
      setApiData<Template[]>(TEMPLATES_PATH, (all) => [...(all ?? []), saved]);
      setNote(t("template.saved", { name: saved.name }));
    } catch (e) {
      fail(e);
    }
  }

  async function saveParty() {
    const themes = party.page_theme === "custom" ? await api.get<CustomTheme[]>(THEMES_PATH) : [];
    const c = themes.find((x) => x.id === customId);
    const look = c ? { bg: c.bg, bg2: c.bg2, accent: c.accent, ink: c.ink, pattern: c.pattern, decor: c.decor, font: c.font ?? "playful", effect: c.effect ?? "confetti" } : null;
    await keep({ name: name.trim(), theme: c ? null : party.page_theme, look, layouts: portableLayouts(party.layouts) });
    setSaving(false);
    setName("");
  }

  const remove = (tpl: Template) => {
    if (!window.confirm(t("template.removeConfirm", { name: tpl.name }))) return;
    api.del(`${TEMPLATES_PATH}/${tpl.id}`).then(() => setApiData<Template[]>(TEMPLATES_PATH, (all) => all?.filter((x) => x.id !== tpl.id))).catch(fail);
  };

  const download = (tpl: Template) => {
    const url = URL.createObjectURL(new Blob([templateFile(tpl)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tpl.name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() || "template"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const language = new Intl.DisplayNames(["en"], { type: "language" }).of(locale) ?? "English";
  const copyPrompt = async () => {
    const prompt = templatePrompt({ wishes, kind: T(`parties.kind.${party.kind}`), language, themes: known.themes, stickers: LIBRARY.filter((x) => x.kind === "sticker").map((x) => x.id) });
    await navigator.clipboard?.writeText(prompt);
    setCopied(true);
  };
  const check = (text: string) => {
    setError("");
    setRead(null);
    try {
      const out = parseTemplate(text, known);
      if (!out.template.name) out.template.name = t("template.fromAi");
      setRead(out);
    } catch (e) {
      setError(e instanceof TemplateError ? T(`template.err.${e.code}`) : t("common.error"));
    }
  };
  const openFile = async (file: File) => {
    if (file.size > MAX_TEMPLATE_CHARS) {
      setError(t("template.err.tooBig"));
      return;
    }
    const text = await file.text();
    setAnswer(text);
    check(text);
  };

  const row = (tpl: Template, builtIn: boolean) => {
    const theme = themeOf(tpl, tpl.name);
    return (
      <li key={tpl.id ?? tpl.name} className="flex flex-wrap items-center gap-3 py-2">
        <span className="h-10 w-14 shrink-0 rounded-lg border border-edge" style={{ background: theme.background }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{tpl.name}</span>
          <span className="block text-xs text-muted">{builtIn ? t("template.gala.about") : t("template.ownAbout")}</span>
        </span>
        <button className="btn-ghost flex items-center gap-1 border border-edge text-sm" onClick={() => setShowing(tpl)}><Eye className="h-4 w-4" aria-hidden />{t("template.preview")}</button>
        {!builtIn && <button className="p-1 text-muted hover:text-ink" aria-label={t("template.export", { name: tpl.name })} title={t("template.export", { name: tpl.name })} onClick={() => download(tpl)}><Download className="h-4 w-4" aria-hidden /></button>}
        {!builtIn && <button className="p-1 text-muted hover:text-red-700" aria-label={t("template.remove", { name: tpl.name })} title={t("template.remove", { name: tpl.name })} onClick={() => remove(tpl)}><Trash2 className="h-4 w-4" aria-hidden /></button>}
      </li>
    );
  };

  return (
    <section className="card space-y-3 p-5 lg:col-span-2" aria-label={t("template.title")}>
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("template.title")}</h2>
      <p className="text-xs text-muted">{t("template.help")}</p>
      <ul className="divide-y divide-edge">
        {row(gala, true)}
        {own.map((x) => row(x, false))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost border border-edge text-sm" onClick={() => { setSaving(!saving); setMaking(false); }}>{t("template.saveParty")}</button>
        <button className="btn-ghost flex items-center gap-1 border border-edge text-sm" onClick={() => { setMaking(!making); setSaving(false); }}><Sparkles className="h-4 w-4" aria-hidden />{t("template.make")}</button>
      </div>
      {note && <p className="text-sm text-accent" role="status">{note}</p>}
      {saving && (
        <form className="space-y-1" onSubmit={(e) => { e.preventDefault(); saveParty().catch(fail); }}>
          <label className="block"><span className="label">{t("template.name")}</span><input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
          <p className="text-xs text-muted">{t("template.saveHelp")}</p>
          <button className="btn-primary" type="submit" disabled={!name.trim()}>{t("template.saveButton")}</button>
        </form>
      )}
      {making && (
        <div className="space-y-4 rounded-xl border border-edge p-4">
          <div className="space-y-2">
            <h3 className="text-sm font-bold">{t("template.step1")}</h3>
            <label className="block"><span className="label">{t("template.wishes")}</span><textarea className="input min-h-20" value={wishes} maxLength={2000} placeholder={t("template.wishesHint")} onChange={(e) => { setWishes(e.target.value); setCopied(false); }} /></label>
            <button className="btn-ghost flex items-center gap-1.5 border border-edge" onClick={() => { copyPrompt().catch(fail); }}><Copy className="h-4 w-4" aria-hidden />{copied ? t("template.copied") : t("template.copy")}</button>
            <p className="text-xs text-muted">{t("template.aiHelp")}</p>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-bold">{t("template.step2")}</h3>
            <label className="block"><span className="label">{t("template.answer")}</span><textarea className="input min-h-28 font-mono text-xs" value={answer} onChange={(e) => { setAnswer(e.target.value); setRead(null); }} /></label>
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-primary" disabled={!answer.trim()} onClick={() => check(answer)}>{t("template.check")}</button>
              <label className="btn-ghost flex cursor-pointer items-center gap-1.5 border border-edge">
                <Upload className="h-4 w-4" aria-hidden />{t("template.file")}
                <input type="file" accept=".json,application/json,text/plain" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f).catch(fail); e.target.value = ""; }} />
              </label>
            </div>
          </div>
          {read && (
            <div className="space-y-2 rounded-lg bg-accent-soft p-3" role="status">
              <p className="text-sm font-semibold">{t("template.readOk", { name: read.template.name })}</p>
              {read.warnings.length > 0 && (
                <ul className="list-disc pl-5 text-xs">
                  {read.warnings.slice(0, 8).map((w, i) => <li key={i}>{T(`template.warn.${w.code}`, { what: w.detail ?? "" })}</li>)}
                  {read.warnings.length > 8 && <li>{t("template.warnMore", { n: read.warnings.length - 8 })}</li>}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" onClick={() => setShowing(read.template)}>{t("template.preview")}</button>
                <button className="btn-ghost border border-edge" onClick={() => { keep(read.template).catch(fail); }}>{t("template.keep")}</button>
              </div>
            </div>
          )}
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {showing && <Preview tpl={showing} data={data} error={error} onUse={() => { use(showing).catch(fail); }} onClose={() => { setShowing(null); setError(""); }} />}
    </section>
  );
}
