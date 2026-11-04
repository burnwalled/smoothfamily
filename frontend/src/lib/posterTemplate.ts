// A party's templates (3.4.0): all its posters and its look, to use again – the built-in ones, those
// saved from a party, and those written by any AI from the prompt made here. A template is plain data:
// whatever comes in is rebuilt from what the posters know, the rest is left out and said so. Nothing in
// it runs, and it can't point outside the app.
import type { Block, DecorItem, DetailField, Stage, TextStyle } from "@/lib/poster";
import type { CustomTheme } from "@/lib/partyThemes";

export const TEMPLATE_FORMAT = "smooth-family-template";
const STAGES: Stage[] = ["save", "invite", "portal", "thanks"];
const MAX_BLOCKS = 60;
export const MAX_TEMPLATE_CHARS = 200_000;

export type TemplateLook = Pick<CustomTheme, "bg" | "bg2" | "accent" | "ink" | "pattern" | "decor"> & { font: NonNullable<CustomTheme["font"]>; effect: NonNullable<CustomTheme["effect"]> };
export type Template = { id?: string; name: string; theme: string | null; look: TemplateLook | null; layouts: Partial<Record<Stage, Block[] | null>> };
export type TemplateWarning = { code: "unknownBlock" | "ownPicture" | "unknownTheme" | "badLook" | "tooMany" | "badPart"; detail?: string };
export type TemplateErrorCode = "tooBig" | "notJson" | "notTemplate" | "empty";
export class TemplateError extends Error {
  constructor(public code: TemplateErrorCode) {
    super(code);
  }
}
// What this server's app has to offer: its themes, and the library's pictures.
export type Known = { themes: string[]; pictures: string[] };

const SIDES = ["full", "left", "right"];
const ALIGNS = ["left", "center", "right"];
const SIZES = ["s", "m", "l", "xl", "xxl"];
const COLORS = ["ink", "accent", "gold", "muted"];
const FONT = /^(theme|gala|playful|retro|classic|sporty)-(display|script|body)$/;
const FIELDS: DetailField[] = ["when", "where", "what", "rsvp", "guests"];
const HEX = /^#[0-9a-fA-F]{6}$/;
const PATTERNS = ["none", "confetti", "dots", "stars", "stripes", "hearts", "check"];
const LOOK_FONTS = ["gala", "playful", "retro", "classic", "sporty"];
const EFFECTS = ["none", "confetti", "bokeh", "stars", "bubbles", "snow", "leaves", "embers"];

type Raw = Record<string, unknown>;
const isObject = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");
const oneOf = <T extends string>(v: unknown, list: readonly string[]) => (typeof v === "string" && list.includes(v) ? (v as T) : undefined);
// Without the parts that weren't given, so the blocks stay as small as the editor's.
const compact = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as T;

function style(r: Raw): TextStyle {
  const tilt = typeof r.tilt === "number" && Number.isFinite(r.tilt) ? Math.max(-8, Math.min(8, r.tilt)) : undefined;
  return compact({
    font: typeof r.font === "string" && FONT.test(r.font) ? (r.font as TextStyle["font"]) : undefined,
    size: oneOf<NonNullable<TextStyle["size"]>>(r.size, SIZES),
    align: oneOf<NonNullable<TextStyle["align"]>>(r.align, ALIGNS),
    color: oneOf<NonNullable<TextStyle["color"]>>(r.color, COLORS),
    caps: r.caps === true ? true : undefined,
    tilt: tilt || undefined,
  });
}

function item(r: unknown, known: Known, warnings: TemplateWarning[]): DecorItem | null {
  if (!isObject(r)) return null;
  if (r.kind === "emoji" && text(r.value, 16)) return { kind: "emoji", value: text(r.value, 16) };
  if (r.kind === "library" && typeof r.value === "string" && known.pictures.includes(r.value)) return { kind: "library", value: r.value };
  warnings.push({ code: r.kind === "sticker" ? "ownPicture" : "badPart", detail: text(r.value, 40) });
  return null;
}

function block(r: unknown, id: string, known: Known, warnings: TemplateWarning[]): Block | null {
  if (!isObject(r)) return null;
  const base = compact({ id, side: oneOf<NonNullable<Block["side"]>>(r.side, SIDES) });
  const align = oneOf<"left" | "center" | "right">(r.align, ALIGNS);
  const heading = text(r.heading, 200);
  switch (r.type) {
    case "text":
      return text(r.text) ? { ...base, type: "text", text: text(r.text), ...style(r) } : null;
    case "decor": {
      const items = (Array.isArray(r.items) ? r.items : []).slice(0, 12).map((x) => item(x, known, warnings)).filter((x): x is DecorItem => !!x);
      return items.length ? { ...base, type: "decor", items, ...compact({ align, size: oneOf<"s" | "m" | "l">(r.size, ["s", "m", "l"]) }) } : null;
    }
    case "image": {
      // Only the party's own picture or the library's: no addresses from outside, and a template
      // doesn't carry another party's pictures.
      const library = r.source === "library" && typeof r.asset === "string" && known.pictures.includes(r.asset);
      if (r.source !== "invite" && !library) warnings.push({ code: "ownPicture" });
      const fallback = r.fallback ? item(r.fallback, known, warnings) : null;
      return { ...base, type: "image", source: library ? "library" : "invite", ...compact({ asset: library ? (r.asset as string) : undefined, style: oneOf<"poster" | "plain" | "round" | "polaroid">(r.style, ["poster", "plain", "round", "polaroid"]), tag: text(r.tag, 120), align, fallback: fallback ?? undefined }) };
    }
    case "emblem": {
      const it = item(r.item, known, warnings);
      return { ...base, type: "emblem", item: it ?? { kind: "emoji", value: "🎉" } };
    }
    case "details": {
      const fields = (Array.isArray(r.fields) ? r.fields : []).filter((f): f is DetailField => FIELDS.includes(f as DetailField));
      const perField = (o: unknown) => {
        const out = isObject(o) ? Object.fromEntries(FIELDS.filter((f) => text(o[f], 120)).map((f) => [f, text(o[f], 120)])) : {};
        return Object.keys(out).length ? (out as Partial<Record<DetailField, string>>) : undefined;
      };
      const stub = (Array.isArray(r.stub) ? r.stub : []).filter(isObject).slice(0, 3).map((s) => ({ label: text(s.label, 30), value: text(s.value, 30) })).filter((s) => s.label || s.value);
      return {
        ...base, type: "details", variant: oneOf<"ticket" | "card" | "list" | "bigdate">(r.variant, ["ticket", "card", "list", "bigdate"]) ?? "card", fields: fields.length ? fields : ["when", "where"],
        ...compact({ heading, labels: perField(r.labels), subs: perField(r.subs), note: text(r.note, 120), stub: stub.length ? stub : undefined }), ...style(r),
      };
    }
    case "countdown":
    case "subscribe":
    case "playlist":
    case "schedule":
    case "upload":
    case "gallery":
      return { ...base, type: r.type, ...compact({ heading }), ...style(r) } as Block;
    case "calendar": {
      const buttons = (Array.isArray(r.buttons) ? r.buttons : []).filter((x): x is "ics" | "google" | "outlook" => ["ics", "google", "outlook"].includes(x as string));
      return { ...base, type: "calendar", buttons: buttons.length ? buttons : ["ics", "google"], ...compact({ map: r.map === true ? true : undefined, align }) };
    }
    case "invitation":
      return { ...base, type: "invitation", text: text(r.text) || "{invitation}", ...compact({ ribbon: text(r.ribbon, 120) }), ...style(r) };
    case "ribbon":
      return text(r.text, 120) ? { ...base, type: "ribbon", text: text(r.text, 120), ...compact({ align }) } : null;
    case "divider":
      return { ...base, type: "divider", style: oneOf<"swash" | "line" | "dots" | "stars">(r.style, ["swash", "line", "dots", "stars"]) ?? "swash", ...compact({ align }) };
    case "spacer":
      return { ...base, type: "spacer", size: oneOf<"s" | "m" | "l">(r.size, ["s", "m", "l"]) ?? "m" };
    default:
      warnings.push({ code: "unknownBlock", detail: text(r.type, 40) });
      return null;
  }
}

function look(r: unknown, warnings: TemplateWarning[]): TemplateLook | null {
  if (r === undefined || r === null) return null;
  const c = isObject(r) ? r : {};
  if (![c.bg, c.bg2, c.accent, c.ink].every((x) => typeof x === "string" && HEX.test(x))) {
    warnings.push({ code: "badLook" });
    return null;
  }
  return {
    bg: c.bg as string, bg2: c.bg2 as string, accent: c.accent as string, ink: c.ink as string,
    pattern: oneOf<TemplateLook["pattern"]>(c.pattern, PATTERNS) ?? "none", decor: text(c.decor, 60),
    font: oneOf<TemplateLook["font"]>(c.font, LOOK_FONTS) ?? "gala", effect: oneOf<TemplateLook["effect"]>(c.effect, EFFECTS) ?? "none",
  };
}

// The answer from an AI, a file or a text box: the JSON in it, whatever is said around it.
export function parseTemplate(answer: string, known: Known): { template: Template; warnings: TemplateWarning[] } {
  if (answer.length > MAX_TEMPLATE_CHARS) throw new TemplateError("tooBig");
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  if (start < 0 || end < start) throw new TemplateError("notJson");
  let raw: unknown;
  try {
    raw = JSON.parse(answer.slice(start, end + 1));
  } catch {
    throw new TemplateError("notJson");
  }
  if (!isObject(raw) || !isObject(raw.layouts)) throw new TemplateError("notTemplate");
  const warnings: TemplateWarning[] = [];
  const layouts: Template["layouts"] = {};
  let parts = 0;
  for (const stage of STAGES) {
    const list = raw.layouts[stage];
    if (!Array.isArray(list)) continue;
    if (list.length > MAX_BLOCKS) warnings.push({ code: "tooMany", detail: stage });
    const blocks = list.slice(0, MAX_BLOCKS).map((b, i) => block(b, `${stage}-${i}`, known, warnings)).filter((b): b is Block => !!b);
    if (blocks.length) layouts[stage] = blocks;
    parts += blocks.length;
  }
  if (!parts) throw new TemplateError("empty");
  const themed = typeof raw.theme === "string" && known.themes.includes(raw.theme);
  if (typeof raw.theme === "string" && !themed) warnings.push({ code: "unknownTheme", detail: text(raw.theme, 40) });
  return { template: { name: text(raw.name, 60).trim(), theme: themed ? (raw.theme as string) : null, look: look(raw.look, warnings), layouts }, warnings };
}

// A party's posters as a template: its own pictures stay with the party. The party's main picture
// comes along, as it's every party's own.
export function portableLayouts(layouts: Template["layouts"]): Template["layouts"] {
  const clean = (b: Block): Block | null => {
    if (b.type === "image" && b.source === "asset") return { ...b, source: "invite", asset: undefined };
    if (b.type === "emblem" && b.item.kind === "sticker") return { ...b, item: { kind: "emoji", value: "🎉" } };
    if (b.type === "image" && b.fallback?.kind === "sticker") return { ...b, fallback: undefined };
    if (b.type === "decor") {
      const items = b.items.filter((i) => i.kind !== "sticker");
      return items.length ? { ...b, items } : null;
    }
    return b;
  };
  return Object.fromEntries(STAGES.map((st) => [st, layouts[st]?.map(clean).filter((b): b is Block => !!b) ?? null]));
}

export function templateFile(t: Template): string {
  return JSON.stringify({ format: TEMPLATE_FORMAT, version: 1, name: t.name, theme: t.theme, look: t.look, layouts: t.layouts }, null, 2);
}

// The built-in gala: a dark night in gold – the big title beside the picture, an admission ticket,
// the countdown and a sign-off. The theme's own posters serve the party day and the thank-you.
export function galaTemplate(t: (key: string, values?: Record<string, string | number>) => string): Template {
  const f = (k: string) => `{${t(`poster.token.${k}`)}}`;
  const poster = (stage: "save" | "invite"): Block[] => {
    let n = 0;
    const id = () => `${stage}-${n++}`;
    const line = stage === "save" ? t("party.saveTheDate") : t("party.invited");
    const out: Block[] = [
      { id: id(), type: "text", side: "left", text: `${line} · ${f("weekday")} ${f("date")}`, font: "theme-body", size: "s", color: "accent", caps: true },
      { id: id(), type: "text", side: "left", text: stage === "save" ? t("party.comingUp") : t("party.welcomeTo"), font: "theme-script", size: "l", tilt: -4 },
      { id: id(), type: "text", side: "left", text: f("title"), font: "theme-display", size: "xxl", color: "gold" },
      { id: id(), type: "divider", side: "left", style: "swash" },
      { id: id(), type: "text", side: "left", text: f("theme"), font: "theme-script", size: "l" },
      { id: id(), type: "text", side: "left", text: t("party.from", { family: f("family") }), font: "theme-body", size: "s", color: "muted", caps: true },
      { id: id(), type: "image", side: "right", source: "invite", style: "poster", ...(stage === "save" ? { tag: t("party.saveTheDate") } : {}), fallback: { kind: "library", value: "champagne-glasses" } },
      { id: id(), type: "details", variant: "ticket", heading: t("party.ticket"), note: t("template.gala.note"), stub: [{ label: t("template.gala.row"), value: "1" }, { label: t("template.gala.seat"), value: "1" }], fields: stage === "save" ? ["when", "where", "what"] : ["when", "where", "what", "rsvp", "guests"], font: "theme-display", size: "l", color: "gold" },
      { id: id(), type: "calendar", buttons: ["ics", "google", "outlook"], map: true },
    ];
    if (stage === "save") out.push({ id: id(), type: "subscribe", heading: t("party.subscribeHeading"), font: "theme-display", size: "l" });
    out.push(
      { id: id(), type: "countdown", heading: t("template.gala.countdown"), font: "theme-script", size: "xl", align: "center" },
      { id: id(), type: "emblem", side: "left", item: { kind: "library", value: "champagne-bottle" } },
      { id: id(), type: "text", side: "right", text: t("template.gala.closing"), font: "theme-script", size: "xl", color: "gold" },
      { id: id(), type: "text", side: "right", text: f("invitation"), font: "theme-body", size: "m", color: "muted" },
      { id: id(), type: "ribbon", side: "right", text: stage === "save" ? t("template.gala.more") : t("party.welcomeAll") },
    );
    if (stage === "invite") out.push({ id: id(), type: "playlist", heading: t("party.playlistHeading"), font: "theme-display", size: "l" });
    return out;
  };
  return { id: "gala", name: t("template.gala.name"), theme: "glamour", look: null, layouts: { save: poster("save"), invite: poster("invite"), portal: null, thanks: null } };
}

// What to give any AI: the wishes, and all it needs to answer with a template this app can read. Only
// the wishes leave with it – the party's names, times and places fill in by themselves here.
export function templatePrompt({ wishes, kind, language, themes, stickers }: { wishes: string; kind: string; language: string; themes: string[]; stickers: string[] }): string {
  const example = {
    format: TEMPLATE_FORMAT, version: 1, name: "Short name of the template", theme: themes[0] ?? "glamour",
    layouts: {
      invite: [
        { type: "text", side: "left", text: "You're invited · {weekday} {date}", font: "theme-body", size: "s", color: "accent", caps: true },
        { type: "text", side: "left", text: "{title}", font: "theme-display", size: "xxl", color: "gold" },
        { type: "image", side: "right", source: "invite", style: "poster", fallback: { kind: "emoji", value: "🎉" } },
        { type: "details", variant: "ticket", heading: "Admission", note: "Valid for one evening", stub: [{ label: "Row", value: "1" }], fields: ["when", "where", "what", "rsvp"] },
        { type: "calendar", buttons: ["ics", "google"], map: true },
        { type: "countdown", heading: "Until the party", font: "theme-script", size: "xl", align: "center" },
      ],
    },
  };
  return `You design a party template for the app Smooth Family. Answer with one JSON object only, nothing else.

MY WISHES
${wishes.trim() || "(none – surprise me)"}

THE PARTY
Kind of party: ${kind}. Write all the guests' texts in this language: ${language}.

THE FORMAT
{ "format": "${TEMPLATE_FORMAT}", "version": 1, "name": string, "theme": string, "look": optional object, "layouts": { "save": blocks, "invite": blocks, "portal": blocks, "thanks": blocks } }
The four pages are: save = save-the-date, invite = the invitation, portal = the page during the party (photos, plan), thanks = the thank-you afterwards. Leave a page out to use the theme's own.

"theme" is one of: ${themes.join(", ")}.
To use your own colours instead, leave out "theme" and give "look": { "bg": "#rrggbb", "bg2": "#rrggbb", "accent": "#rrggbb", "ink": "#rrggbb", "pattern": "none|confetti|dots|stars|stripes|hearts|check", "decor": "up to 6 emoji", "font": "gala|playful|retro|classic|sporty", "effect": "none|confetti|bokeh|stars|bubbles|snow|leaves|embers" }. Make sure "ink" is easy to read on "bg" and "bg2".

A block is an object with "type". Any block may have "side": "left" or "right" – blocks next to each other in the list share a row on a wide screen. These types exist, with no others:
- text: "text", and the style fields
- details: "variant": ticket|card|list|bigdate, "heading", "fields" from when, where, what, rsvp, guests, optional "labels" and "subs" (per field: its name, its small line), and for a ticket "note" and "stub": [{ "label", "value" }]
- image: "source": "invite" (the party's own picture; show it with "fallback" when there is none) or "library" with "asset"; "style": poster|polaroid|round|plain; "tag"; "align"
- emblem: "item"
- decor: "items": a list of items, "size": s|m|l, "align"
- calendar: "buttons" from ics, google, outlook, "map": true|false, "align"
- countdown, subscribe (guests register with a name and an e-mail: belongs on save), playlist, schedule, upload, gallery (photos: upload and gallery belong on portal): "heading", and the style fields
- invitation: "text", "ribbon", and the style fields
- ribbon: "text", "align"
- divider: "style": swash|line|dots|stars, "align"
- spacer: "size": s|m|l

The style fields, all optional: "font": theme-display, theme-script, theme-body, or gala|playful|retro|classic|sporty followed by -display, -script or -body. "size": s|m|l|xl|xxl. "align": left|center|right. "color": ink|accent|gold|muted. "caps": true. "tilt": degrees, -8 to 8.

An item is { "kind": "emoji", "value": "🎉" } or { "kind": "library", "value": sticker }. Stickers: ${stickers.join(", ")}.

Use these fields in texts rather than real details, they fill in by themselves: {title} {family} {date} {weekday} {time} {place} {address} {theme} {rsvp} {invitation}.

RULES
No HTML, no CSS, no links and no addresses to pictures: only what's listed above works. Don't make up names, dates or places. Put {title} in a big text at the top of each page.

AN EXAMPLE OF THE FORM (make your own)
${JSON.stringify(example, null, 1)}`;
}
