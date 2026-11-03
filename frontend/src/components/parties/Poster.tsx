"use client";

// A party's poster (3.4.0), drawn from its blocks – on the guests' page and in the hosts' editor.
// Blocks side by side (left, right) share a row on a wide screen; texts are only ever text.
import { ReactNode, useEffect, useState } from "react";
import { CalendarPlus, Music, Navigation } from "lucide-react";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { mapLinks } from "@/lib/maps";
import type { PartyTheme } from "@/lib/partyThemes";
import { Block, CalendarButton, DecorItem, DetailField, PosterData, TextStyle, calendarLinks, fill, fontCaps, fontFamily } from "@/lib/poster";
import { libraryUrl } from "@/lib/partyLibrary";
import "@/app/party/[token]/party.css";

const SIZES: Record<NonNullable<TextStyle["size"]>, string> = { s: "pt-fs-s", m: "pt-fs-m", l: "pt-fs-l", xl: "pt-fs-xl", xxl: "pt-fs-xxl" };
const ALIGN = { left: "text-left", center: "text-center", right: "text-right" } as const;
const JUSTIFY = { left: "justify-start", center: "justify-center", right: "justify-end" } as const;

// A long title gets smaller letters, so its words fit on their lines.
function bigSize(text: string) {
  const longest = Math.max(0, ...text.split(/\s+/).map((w) => w.length));
  return longest > 13 || text.length > 28 ? "pt-fs-xxl3" : longest > 9 || text.length > 18 ? "pt-fs-xxl2" : SIZES.xxl;
}

function styled(s: TextStyle, theme: PartyTheme, text: string, role: "display" | "script" | "body") {
  const caps = s.caps || fontCaps(s.font, theme, role);
  const cls = [
    s.size === "xxl" ? bigSize(text) : SIZES[s.size ?? "m"],
    ALIGN[s.align ?? "left"],
    s.color === "gold" ? "pt-gold" : s.color === "muted" ? "text-muted" : "",
    caps ? (role === "body" || s.font?.endsWith("body") ? "uppercase tracking-[.25em]" : "uppercase") : "",
    s.size === "xxl" || s.size === "xl" ? "leading-[.98]" : "leading-snug",
  ].join(" ");
  const style = { fontFamily: fontFamily(s.font, theme, role), color: s.color === "accent" ? "var(--pt-accent)" : undefined, hyphens: "auto" as const, overflowWrap: "break-word" as const };
  return { cls, style };
}

function Item({ item, d, size }: { item: DecorItem; d: PosterData; size: string }) {
  if (item.kind === "sticker" || item.kind === "library") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.kind === "library" ? libraryUrl(item.value) : d.asset(item.value)} alt="" className={`${size} inline-block object-contain drop-shadow-md`} />;
  }
  return <span className="inline-block">{item.value}</span>;
}

export function Countdown({ to, heading, s, theme }: { to: number; heading: string; s: TextStyle; theme: PartyTheme }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.floor((to - now) / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  const parts: [string, string][] = [[String(Math.floor(left / 86400)), t("party.days")], [pad(Math.floor((left % 86400) / 3600)), t("party.hours")], [pad(Math.floor((left % 3600) / 60)), t("party.minutes")], [pad(left % 60), t("party.seconds")]];
  const h = styled({ align: "center", ...s }, theme, heading, "script");
  const align = s.align ?? "center";
  return (
    <section className="py-6" aria-label={t("party.countdown")}>
      {heading && <h2 className={h.cls} style={h.style}>{heading}</h2>}
      <div className={`mt-5 flex gap-2 sm:gap-6 ${JUSTIFY[align]}`} role="timer" aria-live="off">
        {parts.map(([v, label]) => <div key={label} className="pt-dial"><b>{v}</b><small>{label}</small></div>)}
      </div>
    </section>
  );
}

function Details({ b, d, theme }: { b: Extract<Block, { type: "details" }>; d: PosterData; theme: PartyTheme }) {
  const { t } = useI18n();
  const time = (x: Date) => x.toLocaleTimeString(d.locale, { hour: "2-digit", minute: "2-digit" });
  const where = d.address || d.place;
  const links = where ? mapLinks(where) : null;
  const label = (f: DetailField) => b.labels?.[f] || t(`party.${f === "rsvp" ? "rsvpShort" : f === "guests" ? "guestsLabel" : f}` as TranslationKey);
  const value = (f: DetailField): { v: string; s?: string; map?: boolean } | null => {
    switch (f) {
      case "when": return d.poll ? { v: t("party.datePending") } : { v: d.start.toLocaleDateString(d.locale, { day: "numeric", month: "short" }), s: `${d.start.toLocaleDateString(d.locale, { weekday: "long" })} · ${time(d.start)}–${time(d.end)}` };
      case "where": return d.place || d.address ? { v: d.place || d.address, s: d.place && d.address ? d.address : undefined, map: true } : null;
      case "what": return d.theme ? { v: d.theme } : null;
      case "rsvp": return d.rsvp ? { v: d.rsvp.toLocaleDateString(d.locale, { day: "numeric", month: "short" }) } : null;
      case "guests": return d.guests && d.guests.coming > 0 ? { v: t("party.comingN", { n: d.guests.coming }), s: d.guests.names?.join(", ") } : null;
    }
  };
  const fields = b.fields.map((f) => [f, value(f)] as const).filter(([, v]) => v);
  const heading = b.heading ? fill(b.heading, d, t("party.dateOpen")) : "";
  const h = styled(b, theme, heading, "display");
  const mapLine = (map?: boolean) => map && links && (
    <div className="pt-s"><a className="text-accent underline underline-offset-2" href={links.osm} target="_blank" rel="noreferrer">{t("places.onMap")}</a> · <a className="underline underline-offset-2" href={links.google} target="_blank" rel="noreferrer">Google Maps</a> · <a className="underline underline-offset-2" href={links.apple} target="_blank" rel="noreferrer">{t("places.appleMaps")}</a></div>
  );

  if (b.variant === "ticket") {
    const stub = fields.find(([f]) => f === "rsvp");
    const main = fields.filter(([f]) => f !== "rsvp");
    return (
      <div className="pt-card pt-ticket">
        <div className="pt-ticket-main">
          {heading && <div className="pt-ticket-head"><h2 className={h.cls} style={h.style}>{heading}</h2></div>}
          {main.map(([f, v], i) => (
            <div key={f} className={i === 2 ? "pt-wide" : ""}>
              <div className="pt-k">{label(f)}</div>
              <div className="pt-v" style={{ fontFamily: fontFamily("theme-display", theme, "display") }}>{v!.v}</div>
              {v!.s && <div className="pt-s first-letter:uppercase">{v!.s}</div>}
              {mapLine(v!.map)}
            </div>
          ))}
        </div>
        <div className="pt-stub">
          {stub ? (<><div className="pt-k">{label("rsvp")}</div><div className="pt-stub-num pt-gold" style={{ fontFamily: fontFamily("theme-display", theme, "display") }}>{d.rsvp!.getDate()}/{d.rsvp!.getMonth() + 1}</div></>) : <div className="text-5xl">{d.emoji}</div>}
        </div>
      </div>
    );
  }
  if (b.variant === "bigdate") {
    return (
      <div className="pt-card pt-bigdate p-6 sm:p-8">
        {!d.poll && (
          <div className="text-center">
            <div className="pt-gold leading-none" style={{ fontFamily: fontFamily("theme-display", theme, "display"), fontSize: "clamp(4rem,12vw,7rem)" }}>{d.start.getDate()}</div>
            <div className="pt-k mt-1">{d.start.toLocaleDateString(d.locale, { month: "long" })}</div>
          </div>
        )}
        <div className="space-y-3">
          {heading && <h2 className={h.cls} style={h.style}>{heading}</h2>}
          {fields.map(([f, v]) => (
            <div key={f}>
              <span className="pt-k">{label(f)}</span>
              <div className="text-lg font-semibold first-letter:uppercase">{f === "when" && v!.s ? v!.s : v!.v}</div>
              {f !== "when" && v!.s && <div className="pt-s">{v!.s}</div>}
              {mapLine(v!.map)}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (b.variant === "list") {
    return (
      <div className="pt-card p-5 sm:p-8">
        {heading && <h2 className={`${h.cls} mb-3`} style={h.style}>{heading}</h2>}
        <dl className="divide-y divide-edge">
          {fields.map(([f, v]) => (
            <div key={f} className="pt-listrow py-3">
              <dt className="pt-k self-center">{label(f)}</dt>
              <dd className="m-0"><span className="text-lg font-semibold">{v!.v}</span>{v!.s && <span className="pt-s block first-letter:uppercase">{v!.s}</span>}{mapLine(v!.map)}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  return (
    <div className="pt-card p-5 sm:p-8">
      {heading && <h2 className={`${h.cls} mb-4`} style={h.style}>{heading}</h2>}
      <div className="pt-grid2">
        {fields.map(([f, v]) => (
          <div key={f}>
            <div className="pt-k">{label(f)}</div>
            <div className="pt-v" style={{ fontFamily: fontFamily("theme-display", theme, "display") }}>{v!.v}</div>
            {v!.s && <div className="pt-s first-letter:uppercase">{v!.s}</div>}
            {mapLine(v!.map)}
          </div>
        ))}
      </div>
    </div>
  );
}

function Calendar({ b, d }: { b: Extract<Block, { type: "calendar" }>; d: PosterData }) {
  const { t } = useI18n();
  if (d.poll) return null;
  const links = calendarLinks(d);
  const where = d.address || d.place;
  const label: Record<CalendarButton, string> = { ics: t("poster.cal.ics"), google: t("poster.cal.google"), outlook: t("poster.cal.outlook"), apple: t("poster.cal.ics") };
  // An older poster's Apple button is the file – shown once.
  const buttons = Array.from(new Set(b.buttons.map((k) => (k === "apple" ? "ics" : k))));
  return (
    <div className={`flex flex-wrap gap-3 ${JUSTIFY[b.align ?? "left"]}`}>
      {buttons.map((k, i) => (
        <a key={k} className={i === 0 ? "pt-btn" : "pt-ghost"} href={links[k]} target={k === "ics" ? undefined : "_blank"} rel="noreferrer" download={k === "ics" ? "" : undefined}>
          <CalendarPlus className="h-4 w-4" aria-hidden />
          {label[k]}
        </a>
      ))}
      {b.map && where && <a className="pt-ghost" href={mapLinks(where).osm} target="_blank" rel="noreferrer"><Navigation className="h-4 w-4" aria-hidden />{t("party.findWay")}</a>}
    </div>
  );
}

function Divider({ b }: { b: Extract<Block, { type: "divider" }> }) {
  const just = JUSTIFY[b.align ?? "left"];
  if (b.style === "swash") return <div className={`flex ${just}`}><svg className="h-5 w-[min(320px,70%)]" viewBox="0 0 320 22" fill="none" aria-hidden><path d="M4 14C70 2 170 2 316 12" stroke="var(--pt-accent)" strokeWidth="3" strokeLinecap="round" /><path d="M60 19C120 12 200 11 260 16" stroke="var(--pt-lo)" strokeWidth="1.5" strokeLinecap="round" /></svg></div>;
  if (b.style === "line") return <div className={`flex ${just}`}><div className="h-px w-2/3" style={{ background: "var(--pt-line)" }} /></div>;
  return <div className={`flex gap-3 text-accent ${just}`} aria-hidden>{(b.style === "stars" ? "✦ ✦ ✦" : "• • •").split(" ").map((x, i) => <span key={i}>{x}</span>)}</div>;
}

// What the interactive pieces hold on the page they're on; in the editor, a picture of them.
export type Slots = Partial<Record<"subscribe" | "upload" | "gallery", ReactNode>>;

function Section({ heading, s, theme, d, children }: { heading?: string; s: TextStyle; theme: PartyTheme; d: PosterData; children: ReactNode }) {
  const { t } = useI18n();
  const text = heading ? fill(heading, d, t("party.dateOpen")) : "";
  const h = styled(s, theme, text, "display");
  return (
    <section className="pt-card space-y-3 p-5 sm:p-8">
      {text && <h2 className={h.cls} style={h.style}>{text}</h2>}
      {children}
    </section>
  );
}

// Spotify's player for a playlist link, and the link itself to add songs.
function Playlist({ url }: { url: string }) {
  const { t } = useI18n();
  const m = url.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album)\/([A-Za-z0-9]+)/);
  return (
    <div className="space-y-3">
      {m && <iframe title="Spotify" src={`https://open.spotify.com/embed/${m[1]}/${m[2]}`} className="h-[352px] w-full rounded-xl border-0" loading="lazy" allow="encrypted-media" />}
      <p className="text-sm text-muted">{t("party.playlistHelp")}</p>
      <a className="pt-btn" href={url} target="_blank" rel="noreferrer"><Music className="h-4 w-4" aria-hidden />{t("party.playlistOpen")}</a>
    </div>
  );
}

function BlockView({ b, d, theme, first, slots }: { b: Block; d: PosterData; theme: PartyTheme; first: boolean; slots: Slots }) {
  const { t } = useI18n();
  const pending = t("party.dateOpen");
  switch (b.type) {
    case "text": {
      const text = fill(b.text, d, pending);
      if (!text) return null;
      const s = styled(b, theme, text, b.font?.endsWith("script") ? "script" : b.font?.endsWith("display") ? "display" : "body");
      return first ? <h1 className={s.cls} style={s.style}>{text}</h1> : <p className={`${s.cls} whitespace-pre-line`} style={s.style}>{text}</p>;
    }
    case "decor": {
      const size = b.size === "s" ? "h-8 w-8" : b.size === "l" ? "h-20 w-20" : "h-12 w-12";
      return (
        <p className={`flex flex-wrap gap-3 ${JUSTIFY[b.align ?? "left"]} ${b.size === "s" ? "text-xl" : b.size === "l" ? "text-5xl" : "text-3xl"}`} aria-hidden>
          {b.items.map((it, i) => <span key={i} className="inline-block" style={{ transform: `rotate(${(i - (b.items.length - 1) / 2) * 9}deg) translateY(${i % 2 ? 4 : -4}px)` }}><Item item={it} d={d} size={size} /></span>)}
        </p>
      );
    }
    case "image": {
      const src = b.source === "invite" ? d.inviteImage : !b.asset ? null : b.source === "library" ? libraryUrl(b.asset) : d.asset(b.asset);
      if (!src) return null;
      const tag = b.tag ? fill(b.tag, d, pending) : "";
      const style = b.style ?? "poster";
      return (
        <div className={`flex ${JUSTIFY[b.align ?? "center"]}`}>
          {style === "poster" ? (
            <figure className="pt-poster m-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" />
              {tag && <span className="pt-tag">{tag}</span>}
            </figure>
          ) : style === "polaroid" ? (
            <figure className="m-0 w-[min(380px,100%)] -rotate-2 bg-white p-3 pb-10 shadow-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="w-full" />
              {tag && <figcaption className="mt-3 text-center text-2xl text-neutral-800" style={{ fontFamily: fontFamily("theme-script", theme, "script") }}>{tag}</figcaption>}
            </figure>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" className={style === "round" ? "aspect-square w-[min(320px,80%)] rounded-full object-cover shadow-2xl" : "w-full rounded-2xl object-cover shadow-xl"} />
          )}
        </div>
      );
    }
    case "emblem":
      return <div className="flex justify-center"><div className="pt-medal" aria-hidden><Item item={b.item} d={d} size="h-1/2 w-1/2" /></div></div>;
    case "details":
      return <Details b={b} d={d} theme={theme} />;
    case "countdown":
      return !d.poll && !d.thanks && d.start.getTime() > Date.now() ? <Countdown to={d.start.getTime()} heading={b.heading ? fill(b.heading, d, pending) : ""} s={b} theme={theme} /> : null;
    case "calendar":
      return <Calendar b={b} d={d} />;
    case "invitation": {
      const text = fill(b.text, d, pending);
      if (!text && !b.ribbon) return null;
      const s = styled(b, theme, text, "body");
      return (
        <section className="pt-card p-5 sm:p-8">
          {text && <p className={`${s.cls} whitespace-pre-line leading-relaxed`} style={s.style}>{text}</p>}
          {b.ribbon && !d.thanks && <span className="pt-ribbon mt-5">{fill(b.ribbon, d, pending)}</span>}
        </section>
      );
    }
    case "ribbon":
      return <div className={`flex ${JUSTIFY[b.align ?? "left"]}`}><span className="pt-ribbon">{fill(b.text, d, pending)}</span></div>;
    case "divider":
      return <Divider b={b} />;
    case "spacer":
      return <div className={b.size === "s" ? "h-4" : b.size === "l" ? "h-16" : "h-8"} aria-hidden />;
    case "playlist":
      return d.playlist ? <Section heading={b.heading} s={b} theme={theme} d={d}><Playlist url={d.playlist} /></Section> : null;
    case "schedule":
      return d.steps.length ? (
        <Section heading={b.heading} s={b} theme={theme} d={d}>
          <ol className="divide-y divide-edge">
            {d.steps.map((st, i) => (
              <li key={i} className="flex gap-4 py-2"><span className="pt-v w-16 shrink-0 tabular-nums" style={{ fontFamily: fontFamily("theme-display", theme, "display"), marginTop: 0 }}>{st.at}</span><span className="text-lg">{st.title}</span></li>
            ))}
          </ol>
        </Section>
      ) : null;
    case "subscribe":
    case "upload":
    case "gallery":
      return slots[b.type] === null ? null : <Section heading={b.heading} s={b} theme={theme} d={d}>{slots[b.type] ?? <p className="text-sm text-muted">{t(`poster.slot.${b.type}`)}</p>}</Section>;
  }
}

// The rows: a block on its own, or blocks on the left beside blocks on the right.
function rows(blocks: Block[]): ({ kind: "full"; b: Block } | { kind: "pair"; left: Block[]; right: Block[] })[] {
  const out: ReturnType<typeof rows> = [];
  for (const b of blocks) {
    const side = b.side ?? "full";
    const last = out[out.length - 1];
    if (side === "full") out.push({ kind: "full", b });
    else if (last?.kind === "pair" && !(side === "left" && last.right.length > 0)) last[side].push(b);
    else out.push({ kind: "pair", left: side === "left" ? [b] : [], right: side === "right" ? [b] : [] });
  }
  return out;
}

export default function Poster({ blocks, d, theme, selected, onSelect, slots = {} }: { blocks: Block[]; d: PosterData; theme: PartyTheme; selected?: string | null; onSelect?: (id: string) => void; slots?: Slots }) {
  const titleId = blocks.find((b) => b.type === "text" && /\{(title|name|namn|navn|nimi)\}/i.test(b.text))?.id;
  const wrap = (b: Block) => {
    const view = <BlockView b={b} d={d} theme={theme} first={b.id === titleId} slots={slots} />;
    if (!onSelect) return <div key={b.id}>{view}</div>;
    return (
      <div key={b.id} role="button" tabIndex={0} aria-pressed={selected === b.id} onClick={(e) => { e.stopPropagation(); onSelect(b.id); }} onKeyDown={(e) => e.key === "Enter" && onSelect(b.id)}
        className={`cursor-pointer rounded-lg outline-offset-4 ${selected === b.id ? "outline outline-2 outline-[var(--pt-accent)]" : "hover:outline hover:outline-1 hover:outline-[var(--pt-line)]"}`}>
        {view}
      </div>
    );
  };
  return (
    <div className="pt-c space-y-6">
      {rows(blocks).map((r, i) =>
        r.kind === "full" ? wrap(r.b) : (
          <div key={i} className="pt-pair py-4">
            <div className="min-w-0 space-y-4">{r.left.map(wrap)}</div>
            <div className="min-w-0 space-y-4">{r.right.map(wrap)}</div>
          </div>
        ),
      )}
    </div>
  );
}
