"use client";

// The hosts' poster editor (3.4.0): the invitation's blocks beside a live picture of the page.
// Add, move and remove blocks, write every text with its typeface, size, alignment and colour,
// swap the emoji for others or for pictures of one's own, choose the details' look and which
// calendar buttons the guests get. Without changes the theme's poster is shown.
import { useMemo, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, ImagePlus, Plus, RotateCcw, Trash2 } from "lucide-react";
import { api, uploadFile } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import type { PartyTheme } from "@/lib/partyThemes";
import { themeStyle } from "@/lib/partyThemes";
import {
  Align, BLOCK_TYPES, Block, BlockType, CALENDAR_BUTTONS, DETAIL_FIELDS, DecorItem, FONT_CHOICES, FontChoice, PosterData, Side, TOKENS, TextStyle,
  Stage, blankBlock, defaultPoster, fill, fontFamily,
} from "@/lib/poster";
import Poster from "@/components/parties/Poster";
import { LIBRARY, libraryUrl } from "@/lib/partyLibrary";

type Asset = { id: string; v: string | null };
type Props = {
  partyId: string; theme: PartyTheme; data: PosterData; layout: Block[] | null; assets: Asset[]; stage: Stage; device: "desktop" | "phone";
  onSaved: (detail: unknown) => void;
};

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; label: React.ReactNode; title?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex overflow-hidden rounded-lg border border-edge">
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} title={o.title} aria-label={o.title} onClick={() => onChange(o.v)} className={`px-2.5 py-1 text-xs ${value === o.v ? "bg-accent-soft font-semibold" : "hover:bg-base"}`}>{o.label}</button>
      ))}
    </div>
  );
}

export default function PosterEditor({ partyId, theme, data, layout, assets, stage, device, onSaved }: Props) {
  const { t } = useI18n();
  const T = (k: string, v?: Record<string, string | number>) => t(k as TranslationKey, v);
  const start = useMemo(() => layout?.length ? layout : defaultPoster(theme, data, T, stage), // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, theme.key, stage]);
  const [blocks, setBlocks] = useState<Block[]>(start);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState<BlockType>("text");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const path = `/api/parties/${partyId}`;
  const block = blocks.find((b) => b.id === selected) ?? null;

  const change = (next: Block[]) => {
    setBlocks(next);
    setDirty(true);
    setNote("");
  };
  const patch = (id: string, p: Partial<Block>) => change(blocks.map((b) => (b.id === id ? ({ ...b, ...p } as Block) : b)));
  const move = (id: string, by: number) => {
    const i = blocks.findIndex((b) => b.id === id);
    const j = i + by;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    change(next);
  };
  const add = () => {
    const b = blankBlock(adding, theme, T);
    const i = selected ? blocks.findIndex((x) => x.id === selected) + 1 : blocks.length;
    change([...blocks.slice(0, i), b, ...blocks.slice(i)]);
    setSelected(b.id);
  };
  async function run(action: () => Promise<unknown>, done: string) {
    setError("");
    try {
      const r = await action();
      onSaved(r);
      setNote(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }
  const save = () => run(async () => { const r = await api.put(path, { layouts: { [stage]: blocks } }); setDirty(false); return r; }, t("poster.saved"));
  const reset = () => {
    if (!window.confirm(t("poster.resetConfirm"))) return;
    void run(async () => { const r = await api.put(path, { layouts: { [stage]: [] } }); setBlocks(defaultPoster(theme, data, T, stage)); setDirty(false); setSelected(null); return r; }, t("poster.resetDone"));
  };
  const upload = (file: File) => run(() => uploadFile(`${path}/assets`, file), t("poster.pictureAdded"));
  const assetUrl = (id: string) => `${path}/assets/${id}?v=${assets.find((a) => a.id === id)?.v ?? ""}`;
  const preview: PosterData = { ...data, asset: assetUrl, thanks: stage === "thanks" };

  const textStyle = (b: Block & TextStyle, role: "display" | "script" | "body") => (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label><span className="label">{t("poster.font")}</span>
          <select className="input" value={b.font ?? `theme-${role}`} onChange={(e) => patch(b.id, { font: e.target.value as FontChoice })}>
            {FONT_CHOICES.map((f) => {
              const [set, r] = f.split("-");
              return <option key={f} value={f} style={{ fontFamily: fontFamily(f, theme) }}>{set === "theme" ? T(`poster.fontTheme.${r}`) : `${T(`parties.font.${set}`)} – ${T(`poster.fontRole.${r}`)}`}</option>;
            })}
          </select>
        </label>
        <label><span className="label">{t("poster.size")}</span>
          <select className="input" value={b.size ?? "m"} onChange={(e) => patch(b.id, { size: e.target.value as TextStyle["size"] })}>
            {(["s", "m", "l", "xl", "xxl"] as const).map((s) => <option key={s} value={s}>{T(`poster.size.${s}`)}</option>)}
          </select>
        </label>
        <label><span className="label">{t("poster.color")}</span>
          <select className="input" value={b.color ?? "ink"} onChange={(e) => patch(b.id, { color: e.target.value as TextStyle["color"] })}>
            {(["ink", "accent", "gold", "muted"] as const).map((c) => <option key={c} value={c}>{T(`poster.color.${c}`)}</option>)}
          </select>
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary-700" checked={!!b.caps} onChange={(e) => patch(b.id, { caps: e.target.checked })} />{t("poster.caps")}</label>
      </div>
      {alignPick(b.align ?? "left", (align) => patch(b.id, { align }))}
    </div>
  );
  const alignPick = (value: Align, onChange: (a: Align) => void) => (
    <div className="flex items-center gap-2 text-xs text-muted">{t("poster.align")}
      <Seg label={t("poster.align")} value={value} onChange={onChange} options={[{ v: "left", label: <AlignLeft className="h-4 w-4" />, title: t("poster.alignLeft") }, { v: "center", label: <AlignCenter className="h-4 w-4" />, title: t("poster.alignCenter") }, { v: "right", label: <AlignRight className="h-4 w-4" />, title: t("poster.alignRight") }]} />
    </div>
  );
  const textField = (b: Block, field: string, multi = false) => {
    const value = (b as Record<string, unknown>)[field] as string | undefined;
    const Tag = multi ? "textarea" : "input";
    return (
      <div className="space-y-1">
        <Tag className={`input ${multi ? "min-h-20" : ""}`} value={value ?? ""} maxLength={2000} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => patch(b.id, { [field]: e.target.value } as Partial<Block>)} aria-label={t("poster.text")} />
        <div className="flex flex-wrap gap-1" aria-label={t("poster.tokens")}>
          {TOKENS.map((k) => <button key={k} type="button" className="rounded border border-edge px-1.5 text-[11px] text-muted hover:text-ink" onClick={() => patch(b.id, { [field]: `${value ?? ""}{${T(`poster.token.${k}`)}}` } as Partial<Block>)}>{`{${T(`poster.token.${k}`)}}`}</button>)}
        </div>
      </div>
    );
  };
  // The library's stickers: the theme's own first.
  const stickers = [...LIBRARY.filter((x) => x.kind === "sticker" && theme.stickers.includes(x.id)), ...LIBRARY.filter((x) => x.kind === "sticker" && !theme.stickers.includes(x.id))];
  const itemPick = (item: DecorItem, onChange: (i: DecorItem) => void, onRemove?: () => void, key?: number) => (
    <div key={key} className="flex flex-wrap items-center gap-2">
      <Seg label={t("poster.itemKind")} value={item.kind} onChange={(kind) => onChange({ kind, value: kind === "emoji" ? "🎉" : kind === "library" ? stickers[0]?.id ?? "" : assets[0]?.id ?? "" })} options={[{ v: "emoji", label: t("poster.emoji") }, { v: "library", label: t("poster.library") }, { v: "sticker", label: t("poster.own") }]} />
      {item.kind === "library" ? (
        <details className="relative">
          <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg border border-edge px-2 py-1 text-xs" aria-label={t("poster.chooseSticker")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={libraryUrl(item.value)} alt="" className="h-7 w-7 object-contain" />
            {t("poster.chooseSticker")}
          </summary>
          <div className="absolute right-0 z-30 mt-1 grid w-72 grid-cols-6 gap-1 rounded-xl border border-edge bg-surface p-2 shadow-xl" role="listbox" aria-label={t("poster.library")}>
            {stickers.map((x) => (
              <button key={x.id} type="button" role="option" aria-selected={item.value === x.id} title={T(`lib.${x.id}`)} aria-label={T(`lib.${x.id}`)} onClick={(e) => { onChange({ kind: "library", value: x.id }); (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); }} className={`rounded-lg p-1 hover:bg-base ${item.value === x.id ? "ring-2 ring-accent" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={libraryUrl(x.id)} alt="" className="h-9 w-9 object-contain" loading="lazy" />
              </button>
            ))}
          </div>
        </details>
      ) : item.kind === "emoji" ? (
        <input className="input !w-20 text-center text-xl" value={item.value} maxLength={16} aria-label={t("poster.emoji")} onChange={(e) => onChange({ kind: "emoji", value: e.target.value })} />
      ) : assets.length ? (
        <select className="input !w-auto" value={item.value} aria-label={t("poster.picture")} onChange={(e) => onChange({ kind: "sticker", value: e.target.value })}>
          {assets.map((a, i) => <option key={a.id} value={a.id}>{t("poster.pictureN", { n: i + 1 })}</option>)}
        </select>
      ) : <span className="text-xs text-muted">{t("poster.noPictures")}</span>}
      {item.kind === "sticker" && item.value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={assetUrl(item.value)} alt="" className="h-8 w-8 rounded object-contain" />
      )}
      {onRemove && <button type="button" className="text-muted hover:text-red-700" aria-label={t("common.remove")} onClick={onRemove}><Trash2 className="h-4 w-4" aria-hidden /></button>}
    </div>
  );

  const props = (b: Block) => {
    switch (b.type) {
      case "text": return (<>{textField(b, "text", true)}{textStyle(b, b.font?.endsWith("script") ? "script" : b.font?.endsWith("display") ? "display" : "body")}
        <label className="block"><span className="label">{t("poster.tilt")}</span>
          <select className="input" value={b.tilt ?? 0} onChange={(e) => patch(b.id, { tilt: Number(e.target.value) || undefined })}>
            {[-6, -4, -2, 0, 2, 4, 6].map((n) => <option key={n} value={n}>{n ? `${n > 0 ? "+" : "−"}${Math.abs(n)}°` : t("poster.tiltNone")}</option>)}
          </select>
        </label></>);
      case "decor": return (
        <div className="space-y-2">
          {b.items.map((it, i) => itemPick(it, (n) => patch(b.id, { items: b.items.map((x, j) => (j === i ? n : x)) }), () => patch(b.id, { items: b.items.filter((_, j) => j !== i) }), i))}
          <button type="button" className="btn-ghost flex items-center gap-1 border border-edge text-xs" disabled={b.items.length >= 12} onClick={() => patch(b.id, { items: [...b.items, { kind: "emoji", value: "✨" }] })}><Plus className="h-3.5 w-3.5" aria-hidden />{t("poster.addItem")}</button>
          <div className="flex flex-wrap items-center gap-3">
            {alignPick(b.align ?? "left", (align) => patch(b.id, { align }))}
            <Seg label={t("poster.size")} value={b.size ?? "m"} onChange={(size) => patch(b.id, { size })} options={[{ v: "s", label: "S" }, { v: "m", label: "M" }, { v: "l", label: "L" }]} />
          </div>
        </div>
      );
      case "image": return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label><span className="label">{t("poster.imageSource")}</span>
              <select className="input" value={b.source === "invite" ? "invite" : `${b.source}:${b.asset ?? ""}`} onChange={(e) => { const [src, id] = e.target.value.split(":"); patch(b.id, src === "invite" ? { source: "invite", asset: undefined } : { source: src as "asset" | "library", asset: id }); }}>
                <option value="invite">{t("parties.invitePicture")}</option>
                {assets.map((a, i) => <option key={a.id} value={`asset:${a.id}`}>{t("poster.pictureN", { n: i + 1 })}</option>)}
                <optgroup label={t("poster.library")}>
                  {LIBRARY.filter((x) => x.kind !== "sticker").map((x) => <option key={x.id} value={`library:${x.id}`}>{`${T(`parties.theme.${x.theme}`)} – ${T(`poster.lib.${x.kind}`)}`}</option>)}
                  {stickers.map((x) => <option key={x.id} value={`library:${x.id}`}>{T(`lib.${x.id}`)}</option>)}
                </optgroup>
              </select>
            </label>
            <label><span className="label">{t("poster.imageStyle")}</span>
              <select className="input" value={b.style ?? "poster"} onChange={(e) => patch(b.id, { style: e.target.value as "poster" })}>
                {(["poster", "polaroid", "round", "plain"] as const).map((s) => <option key={s} value={s}>{T(`poster.imageStyle.${s}`)}</option>)}
              </select>
            </label>
          </div>
          {(b.style ?? "poster") !== "round" && (b.style ?? "poster") !== "plain" && <label className="block"><span className="label">{t("poster.tag")}</span>{textField(b, "tag")}</label>}
          {b.source === "invite" && <div className="space-y-1"><span className="label">{t("poster.fallback")}</span>{b.fallback ? itemPick(b.fallback, (fallback) => patch(b.id, { fallback }), () => patch(b.id, { fallback: undefined })) : <button type="button" className="btn-ghost border border-edge text-xs" onClick={() => patch(b.id, { fallback: { kind: "emoji", value: "🎉" } })}>{t("poster.addItem")}</button>}</div>}
          {alignPick(b.align ?? "center", (align) => patch(b.id, { align }))}
        </div>
      );
      case "emblem": return itemPick(b.item, (item) => patch(b.id, { item }));
      case "details": return (
        <div className="space-y-2">
          <label className="block"><span className="label">{t("poster.detailsLook")}</span>
            <select className="input" value={b.variant} onChange={(e) => patch(b.id, { variant: e.target.value as "card" })}>
              {(["ticket", "card", "list", "bigdate"] as const).map((v) => <option key={v} value={v}>{T(`poster.details.${v}`)}</option>)}
            </select>
          </label>
          <span className="label">{t("poster.heading")}</span>
          {textField(b, "heading")}
          {textStyle(b, "display")}
          <span className="label">{t("poster.fields")}</span>
          {DETAIL_FIELDS.map((f) => (
            <div key={f} className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-primary-700" aria-label={T(`poster.field.${f}`)} checked={b.fields.includes(f)} onChange={(e) => patch(b.id, { fields: e.target.checked ? DETAIL_FIELDS.filter((x) => x === f || b.fields.includes(x)) : b.fields.filter((x) => x !== f) })} />
              <input className="input flex-1 py-1 text-sm" placeholder={T(`party.${f === "rsvp" ? "rsvpShort" : f === "guests" ? "guestsLabel" : f}`)} aria-label={t("poster.fieldLabel", { field: T(`poster.field.${f}`) })} value={b.labels?.[f] ?? ""} onChange={(e) => patch(b.id, { labels: { ...b.labels, [f]: e.target.value } })} />
              <input className="input flex-1 py-1 text-sm" placeholder={t("poster.fieldSub")} aria-label={t("poster.fieldSubOf", { field: T(`poster.field.${f}`) })} value={b.subs?.[f] ?? ""} maxLength={120} onChange={(e) => patch(b.id, { subs: { ...b.subs, [f]: e.target.value } })} />
            </div>
          ))}
          {b.variant === "ticket" && (
            <div className="space-y-2">
              <label className="block"><span className="label">{t("poster.ticketNote")}</span><input className="input" value={b.note ?? ""} maxLength={120} onChange={(e) => patch(b.id, { note: e.target.value })} /></label>
              <span className="label">{t("poster.stub")}</span>
              {(b.stub ?? []).map((x, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className="input flex-1 py-1 text-sm" placeholder={t("poster.stubLabel")} aria-label={t("poster.stubLabel")} value={x.label} maxLength={30} onChange={(e) => patch(b.id, { stub: b.stub!.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)) })} />
                  <input className="input w-20 py-1 text-sm" placeholder={t("poster.stubValue")} aria-label={t("poster.stubValue")} value={x.value} maxLength={30} onChange={(e) => patch(b.id, { stub: b.stub!.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)) })} />
                  <button type="button" className="text-muted hover:text-red-700" aria-label={t("common.remove")} onClick={() => patch(b.id, { stub: b.stub!.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" aria-hidden /></button>
                </div>
              ))}
              <button type="button" className="btn-ghost flex items-center gap-1 border border-edge text-xs" disabled={(b.stub?.length ?? 0) >= 3} onClick={() => patch(b.id, { stub: [...(b.stub ?? []), { label: "", value: "" }] })}><Plus className="h-3.5 w-3.5" aria-hidden />{t("poster.addItem")}</button>
              <p className="text-xs text-muted">{t("poster.stubHelp")}</p>
            </div>
          )}
        </div>
      );
      case "countdown": return (<><span className="label">{t("poster.heading")}</span>{textField(b, "heading")}{textStyle(b, "script")}</>);
      case "calendar": return (
        <div className="space-y-2">
          <span className="label">{t("poster.calendarButtons")}</span>
          {CALENDAR_BUTTONS.map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={b.buttons.includes(k)} onChange={(e) => patch(b.id, { buttons: e.target.checked ? CALENDAR_BUTTONS.filter((x) => x === k || b.buttons.includes(x)) : b.buttons.filter((x) => x !== k) })} />
              {T(`poster.cal.${k}`)}
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary-700" checked={!!b.map} onChange={(e) => patch(b.id, { map: e.target.checked })} />{t("party.findWay")}</label>
          {alignPick(b.align ?? "left", (align) => patch(b.id, { align }))}
        </div>
      );
      case "invitation": return (<>{textField(b, "text", true)}<label className="block"><span className="label">{t("poster.ribbon")}</span><input className="input" value={b.ribbon ?? ""} maxLength={120} onChange={(e) => patch(b.id, { ribbon: e.target.value })} /></label>{textStyle(b, "body")}</>);
      case "ribbon": return (<>{textField(b, "text")}{alignPick(b.align ?? "left", (align) => patch(b.id, { align }))}</>);
      case "divider": return (
        <div className="flex flex-wrap items-center gap-3">
          <Seg label={t("poster.dividerStyle")} value={b.style} onChange={(style) => patch(b.id, { style })} options={(["swash", "line", "dots", "stars"] as const).map((v) => ({ v, label: T(`poster.divider.${v}`) }))} />
          {alignPick(b.align ?? "left", (align) => patch(b.id, { align }))}
        </div>
      );
      case "spacer": return <Seg label={t("poster.size")} value={b.size} onChange={(size) => patch(b.id, { size })} options={[{ v: "s", label: "S" }, { v: "m", label: "M" }, { v: "l", label: "L" }]} />;
    }
  };

  const summary = (b: Block) => {
    if (b.type === "text" || b.type === "ribbon") return fill(b.text, preview, t("party.dateOpen")).slice(0, 40);
    if (b.type === "decor") return b.items.map((i) => (i.kind === "emoji" ? i.value : i.kind === "library" ? T(`lib.${i.value}`) : "🖼")).join(" ");
    if (b.type === "details") return T(`poster.details.${b.variant}`);
    if (b.type === "emblem") return b.item.kind === "emoji" ? b.item.value : b.item.kind === "library" ? T(`lib.${b.item.value}`) : "🖼";
    return "";
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className={`pt overflow-hidden rounded-2xl border border-edge ${device === "phone" ? "mx-auto w-[390px] max-w-full" : "w-full"}`} style={{ ...themeStyle(theme), minHeight: 0 }} onClick={() => setSelected(null)}>
        <div className="h-2" style={{ background: theme.band }} />
        <div className="px-4 py-6 sm:px-8">
          <Poster blocks={blocks} d={preview} theme={theme} selected={selected} onSelect={setSelected} />
          {stage === "invite" && <p className="pt-card mt-6 p-4 text-center text-sm text-muted">{t("poster.replyBelow")}</p>}
        </div>
      </div>
      <div className="min-w-0 space-y-3">
        <section className="card space-y-2 p-4" aria-label={t("poster.blocks")}>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" disabled={!dirty} onClick={save}>{t("poster.save")}</button>
            <button className="btn-ghost flex items-center gap-1 text-sm" onClick={reset}><RotateCcw className="h-4 w-4" aria-hidden />{t("poster.reset")}</button>
          </div>
          {note && <p className="text-xs text-accent" role="status">{note}</p>}
          {error && <p className="text-xs text-red-700">{error}</p>}
          <p className="text-xs text-muted">{t("poster.help")}</p>
          <ol className="divide-y divide-edge text-sm">
            {blocks.map((b, i) => (
              <li key={b.id} className={`flex items-center gap-1 py-1 ${selected === b.id ? "font-semibold" : ""}`}>
                <button className="min-w-0 flex-1 truncate py-1 text-left" aria-pressed={selected === b.id} onClick={() => setSelected(b.id)}>
                  {T(`poster.type.${b.type}`)} {summary(b) && <span className="ml-1 font-normal text-muted">{summary(b)}</span>}
                </button>
                <button className="p-1 text-muted hover:text-ink disabled:opacity-30" disabled={i === 0} aria-label={t("poster.moveUp")} onClick={() => move(b.id, -1)}><ArrowUp className="h-4 w-4" aria-hidden /></button>
                <button className="p-1 text-muted hover:text-ink disabled:opacity-30" disabled={i === blocks.length - 1} aria-label={t("poster.moveDown")} onClick={() => move(b.id, 1)}><ArrowDown className="h-4 w-4" aria-hidden /></button>
                <button className="p-1 text-muted hover:text-red-700" aria-label={t("poster.removeBlock")} onClick={() => { change(blocks.filter((x) => x.id !== b.id)); if (selected === b.id) setSelected(null); }}><Trash2 className="h-4 w-4" aria-hidden /></button>
              </li>
            ))}
          </ol>
          <div className="flex gap-2">
            <select className="input flex-1" value={adding} aria-label={t("poster.newBlock")} onChange={(e) => setAdding(e.target.value as BlockType)}>
              {BLOCK_TYPES.map((k) => <option key={k} value={k}>{T(`poster.type.${k}`)}</option>)}
            </select>
            <button className="btn-ghost flex items-center gap-1 border border-edge" onClick={add}><Plus className="h-4 w-4" aria-hidden />{t("poster.add")}</button>
          </div>
        </section>
        {block && (
          <section className="card space-y-3 p-4" aria-label={t("poster.blockSettings")}>
            <h3 className="text-sm font-bold">{T(`poster.type.${block.type}`)}</h3>
            <div className="flex items-center gap-2 text-xs text-muted">{t("poster.place")}
              <Seg label={t("poster.place")} value={block.side ?? "full"} onChange={(side: Side) => patch(block.id, { side })} options={[{ v: "full", label: t("poster.side.full") }, { v: "left", label: t("poster.side.left") }, { v: "right", label: t("poster.side.right") }]} />
            </div>
            {props(block)}
          </section>
        )}
        <section className="card space-y-2 p-4" aria-label={t("poster.pictures")}>
          <h3 className="text-sm font-bold">{t("poster.pictures")}</h3>
          <p className="text-xs text-muted">{t("poster.picturesHelp")}</p>
          <div className="flex flex-wrap gap-2">
            {assets.map((a, i) => (
              <div key={a.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetUrl(a.id)} alt={t("poster.pictureN", { n: i + 1 })} className="h-16 w-16 rounded-lg border border-edge object-contain" />
                <button className="absolute -right-1 -top-1 rounded-full bg-white p-0.5 text-red-700 shadow" aria-label={t("common.remove")} onClick={() => window.confirm(t("poster.removePictureConfirm")) && run(() => api.del(`${path}/assets/${a.id}`), t("poster.pictureRemoved"))}><Trash2 className="h-3 w-3" aria-hidden /></button>
              </div>
            ))}
            <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-edge text-muted hover:text-ink" title={t("poster.addPicture")}>
              <ImagePlus className="h-5 w-5" aria-hidden />
              <span className="sr-only">{t("poster.addPicture")}</span>
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
            </label>
          </div>
          <p className="text-xs text-muted">{t("parties.pictureFormats")}</p>
        </section>
      </div>
    </div>
  );
}

