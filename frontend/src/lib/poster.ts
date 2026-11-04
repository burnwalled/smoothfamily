// A party's poster (3.4.0): the blocks the hosts put together – texts in the typeface, size,
// alignment and colour they choose, pictures and stickers in place of emoji, the details as a
// ticket or a card or a list, a countdown, the calendar buttons they want. Without blocks of its
// own, an invitation wears its theme's poster (defaultPoster).
import { FONTS, FontSet, FONT_SETS } from "@/lib/partyFonts";
import type { PartyTheme, ThemeCategory } from "@/lib/partyThemes";
import type { TranslationKey } from "@/lib/i18n";

export type Align = "left" | "center" | "right";
export type Side = "full" | "left" | "right";
export type FontChoice = "theme-display" | "theme-script" | "theme-body" | `${FontSet}-${"display" | "script" | "body"}`;
export type TextStyle = { font?: FontChoice; size?: "s" | "m" | "l" | "xl" | "xxl"; align?: Align; color?: "ink" | "accent" | "gold" | "muted"; caps?: boolean; tilt?: number };
// An emoji, one of the library's stickers, or a picture the hosts added ("sticker").
export type DecorItem = { kind: "emoji" | "library" | "sticker"; value: string };
export type CalendarButton = "ics" | "google" | "outlook" | "apple";
export type DetailField = "when" | "where" | "what" | "rsvp" | "guests";

export type Device = "desktop" | "phone";
// What's the phone's own: its place in the order, its alignment and size. hide: where it isn't shown.
export type PhoneLook = { order?: number; align?: Align; size?: TextStyle["size"] };
type Base = { id: string; side?: Side; hide?: Device[]; phone?: PhoneLook };
export type Block = Base & (
  | ({ type: "text"; text: string } & TextStyle)
  | { type: "decor"; items: DecorItem[]; align?: Align; size?: "s" | "m" | "l" }
  | { type: "image"; source: "invite" | "asset" | "library"; asset?: string; style?: "poster" | "plain" | "round" | "polaroid"; tag?: string; align?: Align; fallback?: DecorItem }
  | { type: "emblem"; item: DecorItem }
  | ({ type: "details"; variant: "ticket" | "card" | "list" | "bigdate"; heading?: string; fields: DetailField[]; labels?: Partial<Record<DetailField, string>>; subs?: Partial<Record<DetailField, string>>; note?: string; stub?: { label: string; value: string }[] } & TextStyle)
  | ({ type: "countdown"; heading?: string } & TextStyle)
  | { type: "calendar"; buttons: CalendarButton[]; map?: boolean; align?: Align }
  | ({ type: "invitation"; text: string; ribbon?: string } & TextStyle)
  | { type: "ribbon"; text: string; align?: Align }
  | { type: "divider"; style: "swash" | "line" | "dots" | "stars"; align?: Align }
  | { type: "spacer"; size: "s" | "m" | "l" }
  // The pieces that do something on the guests' page: sign up for updates (the save-the-date), the
  // playlist, the day's plan, uploading photos and seeing them (the portal).
  | ({ type: "subscribe"; heading?: string } & TextStyle)
  | ({ type: "playlist"; heading?: string } & TextStyle)
  | ({ type: "schedule"; heading?: string } & TextStyle)
  | ({ type: "upload"; heading?: string } & TextStyle)
  | ({ type: "gallery"; heading?: string } & TextStyle)
);
// The posters of one party, in its theme: before, the invitation, the day itself, after.
export type Stage = "save" | "invite" | "portal" | "thanks";
export const STAGES: Stage[] = ["save", "invite", "portal", "thanks"];
export type BlockType = Block["type"];
export const BLOCK_TYPES: BlockType[] = ["text", "image", "emblem", "decor", "details", "countdown", "calendar", "invitation", "ribbon", "divider", "spacer", "subscribe", "playlist", "schedule", "upload", "gallery"];
// Apple's calendar has no link of its own: the file opens it on an iPhone or a Mac ("apple" in an
// older poster shows as the file).
export const CALENDAR_BUTTONS: CalendarButton[] = ["ics", "google", "outlook"];
export const DETAIL_FIELDS: DetailField[] = ["when", "where", "what", "rsvp", "guests"];

// The typefaces one can pick for a text: the theme's own three, or any of the sets'.
export const FONT_CHOICES: FontChoice[] = [
  "theme-display", "theme-script", "theme-body",
  ...FONT_SETS.flatMap((f) => [`${f}-display`, `${f}-script`] as FontChoice[]),
];
export function fontFamily(choice: FontChoice | undefined, theme: PartyTheme, fallback: "display" | "script" | "body" = "body") {
  const [set, role] = (choice ?? `theme-${fallback}`).split("-") as [string, "display" | "script" | "body"];
  return FONTS[set === "theme" ? theme.fonts : (set as FontSet)]?.[role] ?? FONTS[theme.fonts][fallback];
}
export const fontCaps = (choice: FontChoice | undefined, theme: PartyTheme, fallback: "display" | "script" | "body") => {
  const [set, role] = (choice ?? `theme-${fallback}`).split("-");
  return role === "display" && !!FONTS[set === "theme" ? theme.fonts : (set as FontSet)]?.caps;
};

// What the texts may say of the party: {title}, {date} … filled in for each one.
export type PosterData = {
  title: string; family: string; emoji: string; start: Date; end: Date; place: string; address: string; theme: string; invitation: string;
  rsvp: Date | null; poll: boolean; guests: { coming: number; names?: string[] } | null; locale: string;
  inviteImage: string | null; asset: (id: string) => string; ics: string; thanks: boolean;
  playlist: string | null; steps: { at: string; title: string }[];
  // The guest's first name, when they came by their personal link.
  guest?: string;
};
export const TOKENS = ["title", "guest", "family", "date", "weekday", "time", "place", "address", "theme", "rsvp", "invitation"] as const;
// The same fields by their names in the five languages: {namn}, {datum} … work as well as {title}.
const ALIASES: Record<string, string> = {"guest": "guest", "gäst": "guest", "gjest": "guest", "gæst": "guest", "vieras": "guest", "title": "title", "name": "title", "namn": "title", "navn": "title", "nimi": "title", "family": "family", "familj": "family", "familie": "family", "perhe": "family", "date": "date", "datum": "date", "dato": "date", "päivä": "date", "weekday": "weekday", "veckodag": "weekday", "ukedag": "weekday", "ugedag": "weekday", "viikonpäivä": "weekday", "time": "time", "tid": "time", "aika": "time", "place": "place", "plats": "place", "sted": "place", "paikka": "place", "address": "address", "adress": "address", "adresse": "address", "osoite": "address", "theme": "theme", "tema": "theme", "teema": "theme", "rsvp": "rsvp", "osa": "rsvp", "svarfrist": "rsvp", "vastaus": "rsvp", "invitation": "invitation", "inbjudan": "invitation", "invitasjon": "invitation", "kutsu": "invitation"};

// A text with the guest's name means nothing to someone without one: it isn't shown to them.
export const needsGuest = (text: string, d: PosterData) => !d.guest && /\{(guest|gäst|gjest|gæst|vieras)\}/i.test(text);

export function fill(text: string, d: PosterData, pending: string): string {
  const time = (x: Date) => x.toLocaleTimeString(d.locale, { hour: "2-digit", minute: "2-digit" });
  const values: Record<string, string> = {
    title: d.title, guest: d.guest ?? "", family: d.family, place: d.place, address: d.address, theme: d.theme, invitation: d.invitation,
    date: d.poll ? pending : d.start.toLocaleDateString(d.locale, { day: "numeric", month: "long" }),
    weekday: d.poll ? "" : d.start.toLocaleDateString(d.locale, { weekday: "long" }),
    time: d.poll ? "" : `${time(d.start)}–${time(d.end)}`,
    rsvp: d.rsvp ? d.rsvp.toLocaleDateString(d.locale, { day: "numeric", month: "long" }) : "",
  };
  return text.replace(/\{([\p{L}]+)\}/gu, (all, k: string) => { const key = ALIASES[k.toLowerCase()] ?? k; return key in values ? values[key] : all; }).trim();
}

// The calendar buttons: a file for any calendar, or straight into Google's or Outlook's.
export function calendarLinks(d: PosterData) {
  const stamp = (x: Date) => x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const where = [d.place, d.address].filter(Boolean).join(", ");
  const q = (o: Record<string, string>) => new URLSearchParams(o).toString();
  return {
    ics: d.ics,
    apple: d.ics,
    google: `https://calendar.google.com/calendar/render?${q({ action: "TEMPLATE", text: d.title, dates: `${stamp(d.start)}/${stamp(d.end)}`, location: where, details: d.invitation })}`,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?${q({ path: "/calendar/action/compose", rru: "addevent", subject: d.title, startdt: d.start.toISOString(), enddt: d.end.toISOString(), location: where, body: d.invitation })}`,
  };
}

const uid = () => Math.random().toString(36).slice(2, 9);
// A theme's decoration: its stickers when the library has some, else its emoji.
const decorOf = (theme: PartyTheme): DecorItem[] => (theme.stickers.length ? theme.stickers.map((v) => ({ kind: "library", value: v })) : theme.decor.map((e) => ({ kind: "emoji", value: e })));
export const newId = uid;

type T = (key: TranslationKey, values?: Record<string, string | number>) => string;

// The details' look that suits the kind of party.
const DETAILS: Record<ThemeCategory | "custom", "ticket" | "card" | "list" | "bigdate"> = { party: "ticket", sports: "ticket", kids: "card", dinner: "card", outdoor: "list", custom: "card" };

// A theme's poster, in the hosts' language: the hero (texts beside the picture or an emblem), the
// details, the calendar buttons, the countdown and the invitation.
export function defaultPoster(theme: PartyTheme, d: Pick<PosterData, "theme" | "inviteImage" | "emoji" | "invitation" | "thanks" | "playlist">, t: T, stage: Stage = "invite"): Block[] {
  // The fields by their names in the hosts' language, so the editor reads naturally: {namn}, {datum} …
  const f = (k: (typeof TOKENS)[number]) => `{${t(`poster.token.${k}` as TranslationKey)}}`;
  // Ids that stay the same each time it's drawn, so the parts keep what they hold.
  let n = 0;
  const pid = () => `${stage}-${n++}`;
  const side: Side = "left";
  const lines: Record<Stage, [string, string]> = {
    save: [`${t("party.saveTheDate")} · ${f("date")}`, t("party.comingUp")],
    invite: [`${t("party.invited")} · ${f("date")}`, t("party.welcomeTo")],
    portal: [`${t("party.today")} · ${f("place")}`, t("party.welcomeTo")],
    thanks: [t("party.thanks"), t("party.thanksFor")],
  };
  const out: Block[] = [
    { id: pid(), type: "text", side, text: lines[stage][0], font: "theme-body", size: "s", color: "accent", caps: true },
    // A personal link's greeting; without a name it isn't shown.
    ...(stage === "invite" || stage === "thanks" ? [{ id: pid(), type: "text", side, text: t("party.hello", { name: f("guest") }), font: "theme-script", size: "l" } as Block] : []),
    { id: pid(), type: "text", side, text: lines[stage][1], font: "theme-script", size: "l" },
    { id: pid(), type: "text", side, text: f("title"), font: "theme-display", size: "xxl", color: "gold" },
    { id: pid(), type: "divider", side, style: "swash" },
  ];
  if (d.theme && stage !== "thanks") out.push({ id: pid(), type: "text", side, text: f("theme"), font: "theme-script", size: "l" });
  out.push(
    { id: pid(), type: "text", side, text: t("party.from", { family: f("family") }), font: "theme-body", size: "s", color: "muted", caps: true },
    // With no picture of the hosts', the emblem wears the theme's first sticker – the row the others.
    { id: pid(), type: "decor", side, items: !d.inviteImage && theme.stickers.length > 1 ? decorOf(theme).slice(1) : decorOf(theme), size: theme.stickers.length ? "l" : "m" },
    d.inviteImage
      ? { id: pid(), type: "image", side: "right", source: "invite", style: "poster", tag: stage === "save" || stage === "invite" ? t("party.saveTheDate") : "" }
      : { id: pid(), type: "emblem", side: "right", item: theme.stickers[0] ? { kind: "library", value: theme.stickers[0] } : { kind: "emoji", value: d.emoji || theme.decor[0] || "🎉" } },
  );
  if (stage === "save") {
    out.push(
      { id: pid(), type: "details", variant: "bigdate", heading: t("party.saveTheDate"), fields: ["when", "where"], font: "theme-display", size: "l", color: "gold" },
      { id: pid(), type: "calendar", buttons: ["ics", "google", "outlook"], map: false },
      { id: pid(), type: "subscribe", heading: t("party.subscribeHeading"), font: "theme-display", size: "l" },
      { id: pid(), type: "countdown", heading: t("party.countdown"), font: "theme-script", size: "xl", align: "center" },
    );
  } else if (stage === "invite") {
    out.push(
      { id: pid(), type: "details", variant: DETAILS[theme.category], heading: DETAILS[theme.category] === "ticket" ? t("party.ticket") : t("party.about"), fields: ["when", "where", "what", "rsvp", "guests"], font: "theme-display", size: "l", color: "gold" },
      { id: pid(), type: "calendar", buttons: ["ics", "google", "outlook"], map: true },
      { id: pid(), type: "countdown", heading: t("party.countdown"), font: "theme-script", size: "xl", align: "center" },
    );
    if (d.invitation) out.push({ id: pid(), type: "invitation", text: f("invitation"), ribbon: t("party.welcomeAll"), size: "m" });
    if (d.playlist) out.push({ id: pid(), type: "playlist", heading: t("party.playlistHeading"), font: "theme-display", size: "l" });
  } else if (stage === "portal") {
    out.push(
      { id: pid(), type: "upload", heading: t("party.uploadHeading"), font: "theme-display", size: "l" },
      { id: pid(), type: "schedule", heading: t("party.scheduleHeading"), font: "theme-display", size: "l" },
      { id: pid(), type: "details", variant: "list", heading: t("party.about"), fields: ["when", "where"], font: "theme-display", size: "l" },
    );
    if (d.playlist) out.push({ id: pid(), type: "playlist", heading: t("party.playlistHeading"), font: "theme-display", size: "l" });
    out.push({ id: pid(), type: "gallery", heading: t("party.galleryHeading"), font: "theme-display", size: "l" });
  }
  return out;
}

// A new block of a kind, as it starts in the editor.
export function blankBlock(type: BlockType, theme: PartyTheme, t: T): Block {
  const id = uid();
  switch (type) {
    case "text": return { id, type, text: t("poster.newText"), font: "theme-body", size: "m" };
    case "image": return { id, type, source: "invite", style: "poster" };
    case "emblem": return { id, type, item: theme.stickers[0] ? { kind: "library", value: theme.stickers[0] } : { kind: "emoji", value: theme.decor[0] ?? "🎉" } };
    case "decor": return { id, type, items: decorOf(theme).slice(0, 4), size: "m" };
    case "details": return { id, type, variant: "card", heading: t("party.about"), fields: ["when", "where"], font: "theme-display", size: "l" };
    case "countdown": return { id, type, heading: t("party.countdown"), font: "theme-script", size: "xl", align: "center" };
    case "calendar": return { id, type, buttons: ["ics", "google"], map: true };
    case "invitation": return { id, type, text: `{${t("poster.token.invitation")}}`, size: "m" };
    case "ribbon": return { id, type, text: t("party.welcomeAll") };
    case "divider": return { id, type, style: "swash" };
    case "spacer": return { id, type, size: "m" };
    case "subscribe": return { id, type, heading: t("party.subscribeHeading"), font: "theme-display", size: "l" };
    case "playlist": return { id, type, heading: t("party.playlistHeading"), font: "theme-display", size: "l" };
    case "schedule": return { id, type, heading: t("party.scheduleHeading"), font: "theme-display", size: "l" };
    case "upload": return { id, type, heading: t("party.uploadHeading"), font: "theme-display", size: "l" };
    case "gallery": return { id, type, heading: t("party.galleryHeading"), font: "theme-display", size: "l" };
  }
}
