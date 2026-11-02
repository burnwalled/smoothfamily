"use client";

// The fox screensaver (3.0.4): a little fox on a hill by a lake, a red cottage across the water, and
// the weather outside played out around it. It reads in the sun with a butterfly about, flies a kite
// when clouds come and go, reads on grey days, holds a lantern in the fog, stands under its umbrella
// in the rain (worried in thunder), builds a snowman when it snows, and sleeps curled up at night.
// The sky follows the time of day, the trees the season. Drawn in SVG; everything moves on the GPU.
import { createContext, useContext, useEffect, useId, useRef } from "react";
import type { WeatherKind } from "@/lib/api";
import { isNight } from "./FlipClock";
import "./fox.css";

type Phase = "dawn" | "day" | "dusk" | "night";
type Season = "spring" | "summer" | "autumn" | "winter";
export type FoxActivity = "butterfly" | "kite" | "book" | "lantern" | "umbrella" | "thunder" | "snowman" | "sleep";

const ORANGE = "#e8762c";
const LEG = "#d4661f";
const DARK = "#3b2418";
const CREAM = "#fff4e8";

// Gradient ids are unique per scene (two scenes on one page would otherwise share the first one's).
const Ids = createContext({ sky: "fx-sky", glow: "fx-glow" });

const WET: WeatherKind[] = ["rain", "thunder", "sleet"];
const GREY: WeatherKind[] = ["cloudy", "fog", "rain", "thunder", "sleet", "snow"];

export function phaseOf(now: Date): Phase {
  const h = now.getHours();
  if (isNight(now)) return "night";
  if (h < 9) return "dawn";
  return h < 17 ? "day" : "dusk";
}

export function seasonOf(now: Date): Season {
  const m = now.getMonth();
  return m <= 1 || m === 11 ? "winter" : m <= 4 ? "spring" : m <= 7 ? "summer" : "autumn";
}

export function activityOf(kind: WeatherKind, night: boolean): FoxActivity {
  if (night) return "sleep";
  if (kind === "thunder") return "thunder";
  if (kind === "rain" || kind === "sleet") return "umbrella";
  if (kind === "snow") return "snowman";
  if (kind === "fog") return "lantern";
  if (kind === "cloudy") return "book";
  return kind === "partly" ? "kite" : "butterfly";
}

// Fixed "random" numbers, so the drops don't jump about on each render.
const rnd = (i: number) => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const SKY: Record<Phase, { clear: [string, string]; grey: [string, string] }> = {
  dawn: { clear: ["#f3b994", "#fbe6c4"], grey: ["#b3a6a2", "#ddd2c8"] },
  day: { clear: ["#86bfe6", "#d6edf7"], grey: ["#9aabb7", "#d0d8de"] },
  dusk: { clear: ["#4f4785", "#f0a47c"], grey: ["#4b526b", "#978892"] },
  night: { clear: ["#08122a", "#1b2848"], grey: ["#0d1320", "#1a2130"] },
};

export default function FoxScene({ now, kind, temp, wind }: { now: Date; kind: WeatherKind; temp: number | null; wind: number | null }) {
  const svg = useRef<SVGSVGElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ids = { sky: `fx-sky-${uid}`, glow: `fx-glow-${uid}` };
  const phase = phaseOf(now);
  const night = phase === "night";
  const season = seasonOf(now);
  const activity = activityOf(kind, night);
  const t = temp ?? 10;
  const grey = GREY.includes(kind);
  const snowy = kind === "snow" || (season === "winter" && t <= 1);
  const frozen = season === "winter" && t <= -2;
  const windy = (wind ?? 0) >= 8;
  const [top, bottom] = grey ? (kind === "thunder" && !night ? ["#6c7a86", "#a3aeb7"] : SKY[phase].grey) : SKY[phase].clear;

  // Respect "reduce motion": the SVG animations stop too (the CSS ones stop in fox.css).
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) svg.current?.pauseAnimations();
  }, []);

  const farHill = night ? (snowy ? "#55606f" : "#1c302b") : snowy ? "#e3ebef" : season === "autumn" ? "#8b9a5c" : "#6f9a6a";
  const nearHill = night ? (snowy ? "#7a8798" : "#16261f") : snowy ? "#f4f8fa" : season === "autumn" ? "#6f7f45" : "#4f7f4a";
  const spruce = night ? "#0f1f19" : "#2e5a3e";
  const lake = frozen ? (night ? "#4a5a6c" : "#cfe2ea") : night ? "#152a45" : grey ? "#7f9aa8" : "#5aa6c9";
  const crown = { spring: "#9cc96b", summer: "#4f8f45", autumn: "#e0902f", winter: "" }[season];
  const cloudFill = night ? "#2a3346" : kind === "thunder" ? "#5d6873" : grey ? "#e6eaed" : "#ffffff";
  const clouds = kind === "clear" ? 2 : kind === "partly" ? 4 : 7;
  const drift = windy ? 0.45 : 1;

  return (
    <Ids.Provider value={ids}>
    <svg ref={svg} className={`foxscene${night ? " night" : ""}`} viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <defs>
        <linearGradient id={ids.sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
        <radialGradient id={ids.glow}>
          <stop offset="0" stopColor="#ffd56b" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffd56b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="1000" fill={`url(#${ids.sky})`} />

      {/* Sun, moon and stars */}
      {night ? (
        <>
          {!grey &&
            Array.from({ length: 60 }, (_, i) => (
              <circle key={i} className="fx-star" cx={rnd(i) * 1600} cy={rnd(i + 99) * 480} r={1 + rnd(i + 7) * 1.8} fill="#fff" style={{ animationDelay: `${-rnd(i + 3) * 4}s` }} />
            ))}
          {kind !== "fog" && (
            <g opacity={grey ? 0.35 : 1}>
              <circle cx="1240" cy="190" r="56" fill="#f4efd8" />
              <circle cx="1268" cy="172" r="52" fill={top} />
            </g>
          )}
        </>
      ) : (
        !grey && <circle cx={phase === "day" ? 1250 : 1310} cy={phase === "day" ? 200 : 470} r={phase === "day" ? 68 : 80} fill={phase === "day" ? "#fff3c4" : "#ffd29a"} opacity="0.95" />
      )}

      {/* Clouds drift by; faster when it's windy */}
      {Array.from({ length: clouds }, (_, i) => (
        <g key={i} className="fx-cloud" style={{ animationDuration: `${(90 + rnd(i + 40) * 70) * drift}s`, animationDelay: `${-rnd(i + 50) * 150}s` }}>
          <Cloud x={0} y={70 + rnd(i + 60) * (grey ? 260 : 220)} s={0.7 + rnd(i + 70) * 0.8} fill={cloudFill} opacity={grey ? 0.95 : 0.85} />
        </g>
      ))}

      {/* Far shore with spruces, a birch or two and the red cottage */}
      <path d="M0 1000 L0 610 C 300 530 600 590 900 555 C 1150 525 1400 555 1600 535 L1600 1000 Z" fill={farHill} />
      {[140, 230, 300, 1460, 1530].map((x, i) => (
        <Spruce key={x} x={x} y={i < 3 ? 600 - i * 18 : 540} s={0.8 + rnd(i) * 0.5} fill={spruce} snow={snowy} />
      ))}
      {[420, 1010].map((x) => (
        <Leafy key={x} x={x} y={x < 600 ? 572 : 548} crown={crown} night={night} trunk={night ? "#2a2a2a" : "#e9e5dc"} />
      ))}
      <Cottage x={1240} y={540} night={night} dusk={phase === "dusk" || phase === "dawn"} snowy={snowy} smoke={t < 10} />

      {/* The lake: glints by day, a frozen sheet in the cold */}
      <path d="M860 1000 L860 760 C 1080 742 1380 738 1600 748 L1600 1000 Z" fill={lake} />
      {!frozen &&
        Array.from({ length: 12 }, (_, i) => (
          <rect key={i} className="fx-glint" x={940 + rnd(i + 200) * 620} y={780 + rnd(i + 210) * 190} width={18 + rnd(i + 220) * 40} height="3" rx="1.5" fill="#fff" style={{ animationDelay: `${-rnd(i + 230) * 6}s` }} />
        ))}
      {WET.includes(kind) &&
        Array.from({ length: 6 }, (_, i) => (
          <ellipse key={i} className="fx-ripple" cx={980 + rnd(i + 300) * 560} cy={800 + rnd(i + 310) * 170} rx="22" ry="6" fill="none" stroke="#fff" strokeWidth="2" style={{ animationDelay: `${-rnd(i + 320) * 2}s` }} />
        ))}

      {kind === "fog" && <Fog y={560} opacity={0.5} />}

      {/* The fox's hill */}
      <path d="M0 1000 L0 790 C 250 705 520 655 760 662 C 950 668 1080 730 1170 1000 Z" fill={nearHill} />
      <Ground season={season} snowy={snowy} night={night} />

      <g transform="translate(700 672) scale(1.5)">
        <Fox activity={activity} scarf={t <= 3 || kind === "snow"} shades={kind === "clear" && t >= 20 && !night} wet={WET.includes(kind)} />
      </g>

      {/* What's falling */}
      {(kind === "rain" || kind === "thunder" || kind === "sleet") &&
        Array.from({ length: kind === "sleet" ? 50 : 90 }, (_, i) => (
          <line key={i} className="fx-rain" x1={rnd(i + 400) * 1700} y1="-40" x2={rnd(i + 400) * 1700 - 8} y2="-8" stroke={night ? "#8ea3c0" : "#e8f0f6"} strokeWidth="2.5" strokeLinecap="round" opacity="0.7" style={{ animationDuration: `${0.7 + rnd(i + 410) * 0.5}s`, animationDelay: `${-rnd(i + 420) * 2}s` }} />
        ))}
      {(kind === "snow" || kind === "sleet") &&
        Array.from({ length: kind === "snow" ? 90 : 40 }, (_, i) => (
          <circle key={i} className="fx-snow" cx={rnd(i + 500) * 1600} cy="-12" r={2.5 + rnd(i + 510) * 4.5} fill="#fff" opacity="0.9" style={{ animationDuration: `${(8 + rnd(i + 520) * 8) * (windy ? 0.6 : 1)}s`, animationDelay: `${-rnd(i + 530) * 16}s` }} />
        ))}
      {season === "autumn" && !WET.includes(kind) && kind !== "snow" && !night &&
        Array.from({ length: windy ? 18 : 9 }, (_, i) => (
          <ellipse key={i} className="fx-leaf" cx={rnd(i + 600) * 1500} cy="-20" rx="9" ry="5" fill={["#e0902f", "#c9572b", "#e8b33c"][i % 3]} style={{ animationDuration: `${(11 + rnd(i + 610) * 8) * drift}s`, animationDelay: `${-rnd(i + 620) * 18}s` }} />
        ))}
      {kind === "fog" && <Fog y={820} opacity={0.35} />}
      {kind === "thunder" && (
        <>
          <path className="fx-bolt" d="M1080 120 L1030 260 L1070 260 L1020 400 L1120 230 L1078 230 L1120 120 Z" fill="#fff6b0" />
          <rect className="fx-flash" width="1600" height="1000" fill="#fff" />
        </>
      )}
    </svg>
    </Ids.Provider>
  );
}

function Cloud({ x, y, s, fill, opacity }: { x: number; y: number; s: number; fill: string; opacity: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill={fill} opacity={opacity}>
      <ellipse cx="0" cy="40" rx="130" ry="38" />
      <circle cx="-50" cy="20" r="48" />
      <circle cx="20" cy="0" r="66" />
      <circle cx="80" cy="25" r="44" />
    </g>
  );
}

function Spruce({ x, y, s, fill, snow }: { x: number; y: number; s: number; fill: string; snow: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-5" y="-12" width="10" height="16" fill="#4a3426" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <path d={`M${-44 + i * 8} ${-10 - i * 34} L0 ${-62 - i * 34} L${44 - i * 8} ${-10 - i * 34} Z`} fill={fill} />
          {snow && <path d={`M${-18 + i * 3} ${-48 - i * 34} L0 ${-62 - i * 34} L${18 - i * 3} ${-48 - i * 34} Q0 ${-42 - i * 34} ${-18 + i * 3} ${-48 - i * 34} Z`} fill="#f4f8fa" />}
        </g>
      ))}
    </g>
  );
}

function Leafy({ x, y, crown, night, trunk }: { x: number; y: number; crown: string; night: boolean; trunk: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-5 0 L-3 -110 L3 -110 L5 0 Z M0 -70 L-26 -100 M0 -85 L22 -112" stroke={trunk} strokeWidth="6" fill={trunk} strokeLinecap="round" />
      {crown && (
        <g fill={crown} opacity={night ? 0.35 : 1}>
          <circle cx="-22" cy="-112" r="34" />
          <circle cx="20" cy="-122" r="38" />
          <circle cx="0" cy="-150" r="34" />
        </g>
      )}
    </g>
  );
}

function Cottage({ x, y, night, dusk, snowy, smoke }: { x: number; y: number; night: boolean; dusk: boolean; snowy: boolean; smoke: boolean }) {
  const lit = night || dusk;
  const { glow } = useContext(Ids);
  return (
    <g transform={`translate(${x} ${y})`}>
      {smoke &&
        [0, 1, 2].map((i) => <circle key={i} className="fx-smoke" cx="52" cy="-118" r="12" fill={night ? "#5b6170" : "#e7e7e7"} style={{ animationDelay: `${-i * 2}s` }} />)}
      <rect x="44" y="-120" width="16" height="34" fill={night ? "#3a1514" : "#7a2a24"} />
      <rect x="-70" y="-70" width="140" height="70" fill={night ? "#4a1714" : "#a32b22"} />
      <path d="M-82 -68 L0 -128 L82 -68 Z" fill={snowy ? "#f4f8fa" : night ? "#141414" : "#2b2b2b"} />
      <rect x="-70" y="-70" width="8" height="70" fill="#f1ece2" opacity={night ? 0.5 : 1} />
      <rect x="62" y="-70" width="8" height="70" fill="#f1ece2" opacity={night ? 0.5 : 1} />
      {[-38, 28].map((wx) => (
        <g key={wx}>
          <rect x={wx - 4} y="-54" width="30" height="26" fill="#f1ece2" opacity={night ? 0.5 : 1} />
          <rect x={wx} y="-50" width="22" height="18" fill={lit ? "#ffd56b" : "#3c5560"} />
          {lit && <circle cx={wx + 11} cy="-41" r="40" fill={`url(#${glow})`} opacity="0.45" />}
        </g>
      ))}
      <rect x="-8" y="-36" width="20" height="36" fill="#f1ece2" opacity={night ? 0.5 : 1} />
    </g>
  );
}

function Fog({ y, opacity }: { y: number; opacity: number }) {
  return (
    <g className="fx-fog" fill="#eef2f4" opacity={opacity}>
      <ellipse cx="300" cy={y} rx="520" ry="60" />
      <ellipse cx="1100" cy={y + 40} rx="620" ry="70" />
      <ellipse cx="700" cy={y + 110} rx="700" ry="60" />
    </g>
  );
}

function Ground({ season, snowy, night }: { season: Season; snowy: boolean; night: boolean }) {
  const blade = night ? "#24382d" : snowy ? "#c9d6dc" : "#6e9d5e";
  const tufts = [120, 260, 380, 520, 900, 1010, 640];
  return (
    <g>
      {tufts.map((x, i) => (
        <path key={x} className="fx-sway" d={`M${x} ${760 - (i === 6 ? 70 : 0) + (x < 600 ? 40 - x / 20 : 0)} l-8 -26 m8 26 l2 -32 m-2 32 l10 -24`} stroke={blade} strokeWidth="4" strokeLinecap="round" fill="none" style={{ animationDelay: `${-i * 0.7}s` }} />
      ))}
      {!snowy && !night && (season === "spring" || season === "summer") &&
        [[200, 780], [330, 748], [470, 726], [960, 735], [560, 712]].map(([x, y], i) => (
          <g key={x} transform={`translate(${x} ${y})`}>
            <path d="M0 0 L0 -18" stroke="#4f7f4a" strokeWidth="3" />
            <circle cy="-20" r="7" fill={["#f6d55c", "#f28fb1", "#ffffff", "#b39ddb", "#f6d55c"][i]} />
            <circle cy="-20" r="2.5" fill="#e8a33c" />
          </g>
        ))}
      {!snowy && season === "autumn" &&
        [[250, 770], [990, 742]].map(([x, y]) => (
          <g key={x} transform={`translate(${x} ${y})`} opacity={night ? 0.4 : 1}>
            <rect x="-4" y="-16" width="8" height="16" fill="#f1ece2" />
            <path d="M-16 -14 Q0 -36 16 -14 Z" fill="#c8372d" />
            <circle cx="-5" cy="-21" r="2.4" fill="#fff" />
            <circle cx="6" cy="-18" r="2" fill="#fff" />
          </g>
        ))}
    </g>
  );
}

// --- The fox -------------------------------------------------------------------------------------
// Drawn around (0, 0) where its paws meet the ground; about 260 tall sitting up.

function Fox({ activity, scarf, shades, wet }: { activity: FoxActivity; scarf: boolean; shades: boolean; wet: boolean }) {
  if (activity === "sleep") return <SleepingFox umbrella={wet} />;
  const eyes = activity === "book" ? "down" : activity === "snowman" ? "up" : activity === "thunder" ? "wide" : "open";
  const tilt = activity === "book" ? 7 : activity === "snowman" ? -8 : 0;
  // Where the paws go for each thing it holds.
  const hands: [number, number][] =
    activity === "book" ? [[-30, -82], [30, -82]] : activity === "kite" ? [[62, -150]] : activity === "lantern" ? [[62, -78]] : activity === "umbrella" || activity === "thunder" ? [[34, -150]] : [];
  return (
    <g>
      {activity === "snowman" && <Snowman x={190} />}
      {wet && (
        <g transform="translate(70 8)">
          <ellipse rx="110" ry="14" fill="#9fb6c4" opacity="0.6" />
          <ellipse className="fx-puddle" rx="30" ry="5" fill="none" stroke="#fff" strokeWidth="2" />
        </g>
      )}
      {/* Tail, wagging */}
      <g>
        <animateTransform attributeName="transform" type="rotate" values={activity === "thunder" ? "-2 50 -25;2 50 -25;-2 50 -25" : "-7 50 -25;7 50 -25;-7 50 -25"} dur={activity === "butterfly" ? "1.6s" : "3.2s"} repeatCount="indefinite" />
        <path d="M50 -25 C 120 -10 178 -52 172 -122 C 168 -152 150 -176 134 -182 C 140 -140 126 -96 96 -76 C 80 -64 62 -56 46 -50 Z" fill={ORANGE} />
        <path d="M134 -182 C 150 -176 168 -152 172 -122 C 162 -128 150 -132 140 -134 C 142 -150 140 -168 134 -182 Z" fill={CREAM} />
      </g>
      {/* Body, chest and front legs */}
      <path d="M-62 0 C -78 -50 -62 -125 0 -135 C 62 -125 78 -50 62 0 Z" fill={ORANGE} />
      <path d="M-34 -4 C -42 -50 -30 -105 0 -112 C 30 -105 42 -50 34 -4 Z" fill={CREAM} />
      <rect x="-34" y="-62" width="20" height="60" rx="10" fill={LEG} />
      <rect x="14" y="-62" width="20" height="60" rx="10" fill={LEG} />
      <ellipse cx="-24" cy="-5" rx="16" ry="8" fill={DARK} />
      <ellipse cx="24" cy="-5" rx="16" ry="8" fill={DARK} />
      {scarf && (
        <g>
          <path d="M-50 -142 Q0 -118 50 -142 L52 -124 Q0 -100 -52 -124 Z" fill="#c8372d" />
          <path d="M-22 -128 L-18 -110 M0 -122 L0 -104 M22 -128 L18 -110" stroke="#f1ece2" strokeWidth="5" />
          <path d="M18 -122 L32 -66 L16 -64 L6 -118 Z" fill="#c8372d" />
        </g>
      )}
      {activity === "book" && <Book />}
      {activity === "lantern" && <Lantern x={62} y={-78} />}
      {activity === "kite" && <Kite hand={[62, -150]} />}
      {(activity === "umbrella" || activity === "thunder") && <Umbrella hand={[34, -150]} />}
      {hands.map(([x, y], i) => (
        <g key={i}>
          <path d={`M${x < 0 ? -36 : 36} -108 L${x} ${y}`} stroke={ORANGE} strokeWidth="20" strokeLinecap="round" />
          <circle cx={x} cy={y} r="11" fill={DARK} />
        </g>
      ))}
      <g transform={`rotate(${tilt} 0 -135)`}>
        <Head y={-140} eyes={eyes} earsDown={activity === "thunder"} hat={activity === "snowman"} shades={shades} />
      </g>
      {activity === "butterfly" && <Butterfly />}
    </g>
  );
}

function Head({ y, eyes, earsDown = false, hat = false, shades = false, scale = 1 }: { y: number; eyes: "open" | "down" | "up" | "wide" | "closed"; earsDown?: boolean; hat?: boolean; shades?: boolean; scale?: number }) {
  const ear = (side: 1 | -1) => (
    <g transform={earsDown ? `rotate(${-side * 32} ${side * 36} -58)` : undefined}>
      <path d={`M${side * 50} -40 L${side * 64} -118 L${side * 10} -72 Z`} fill={ORANGE} />
      <path d={`M${side * 46} -50 L${side * 56} -102 L${side * 22} -72 Z`} fill={DARK} />
    </g>
  );
  const ey = eyes === "down" ? -28 : eyes === "up" ? -42 : -36;
  return (
    <g transform={`translate(0 ${y}) scale(${scale})`}>
      {ear(-1)}
      {ear(1)}
      <path d="M-72 -38 C -74 -92 74 -92 72 -38 C 66 -2 28 24 0 28 C -28 24 -66 -2 -72 -38 Z" fill={ORANGE} />
      <path d="M-72 -38 C -58 -18 -32 -8 -16 2 C -8 14 -4 22 0 28 C -28 24 -66 -2 -72 -38 Z" fill={CREAM} />
      <path d="M72 -38 C 58 -18 32 -8 16 2 C 8 14 4 22 0 28 C 28 24 66 -2 72 -38 Z" fill={CREAM} />
      <path d="M-24 -4 C -14 -20 14 -20 24 -4 C 18 12 9 23 0 28 C -9 23 -18 12 -24 -4 Z" fill={CREAM} />
      <ellipse cy="20" rx="9" ry="6.5" fill={DARK} />
      <circle cx="-46" cy="-10" r="8" fill="#f08a7a" opacity="0.35" />
      <circle cx="46" cy="-10" r="8" fill="#f08a7a" opacity="0.35" />
      {eyes === "closed" ? (
        <path d="M-36 -32 Q-27 -24 -18 -32 M18 -32 Q27 -24 36 -32" stroke={DARK} strokeWidth="4" strokeLinecap="round" fill="none" />
      ) : (
        <g className="fx-blink">
          {[-27, 27].map((x) => (
            <g key={x}>
              {eyes === "wide" && <ellipse cx={x} cy={ey} rx="11" ry="13" fill="#fff" />}
              <ellipse cx={x} cy={ey} rx={eyes === "down" ? 7 : 7} ry={eyes === "down" ? 6 : 10} fill={DARK} />
              <circle cx={x + 2.5} cy={ey - 3.5} r="2.4" fill="#fff" />
            </g>
          ))}
        </g>
      )}
      {eyes === "up" && <ellipse cy="31" rx="6" ry="5" fill="#f08a7a" />}
      {shades && (
        <g>
          <rect x="-44" y="-48" width="34" height="22" rx="9" fill="#1f1f24" />
          <rect x="10" y="-48" width="34" height="22" rx="9" fill="#1f1f24" />
          <path d="M-10 -40 L10 -40" stroke="#1f1f24" strokeWidth="4" />
          <path d="M-38 -44 L-28 -44" stroke="#fff" strokeWidth="2.5" opacity="0.5" strokeLinecap="round" />
        </g>
      )}
      {hat && (
        <g>
          <path d="M-46 -66 C -42 -116 42 -116 46 -66 Z" fill="#3f6fb5" />
          <rect x="-48" y="-72" width="96" height="14" rx="7" fill="#f1ece2" />
          <circle cy="-112" r="13" fill="#f1ece2" />
        </g>
      )}
    </g>
  );
}

function SleepingFox({ umbrella }: { umbrella: boolean }) {
  return (
    <g>
      {umbrella && (
        <g>
          <path d="M40 0 L40 -250" stroke="#5b4636" strokeWidth="6" />
          <Canopy x={40} y={-250} />
        </g>
      )}
      <g className="fx-breathe">
        <ellipse cx="10" cy="-46" rx="118" ry="50" fill={ORANGE} />
        <path d="M-20 -92 C 40 -100 100 -80 120 -50" stroke={LEG} strokeWidth="8" fill="none" strokeLinecap="round" opacity="0.6" />
      </g>
      {/* The tail wrapped round the front, its tip under the chin */}
      <path d="M120 -40 C 128 -2 40 8 -40 2 C -90 -2 -128 -16 -118 -34 C -70 -20 30 -18 84 -34 Z" fill={ORANGE} />
      <path d="M-118 -34 C -128 -16 -100 -2 -70 0 C -74 -14 -90 -26 -118 -34 Z" fill={CREAM} />
      <g transform="translate(-86 0) rotate(-8 0 -46)">
        <Head y={-46} eyes="closed" scale={0.78} />
      </g>
      {["z", "z", "Z"].map((z, i) => (
        <text key={i} className="fx-zzz" x={-10 + i * 26} y={-140 - i * 30} fontSize={22 + i * 8} fontWeight="700" fill="#cfd8ea" style={{ animationDelay: `${i * 1.2}s` }}>
          {z}
        </text>
      ))}
    </g>
  );
}

function Canopy({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-150 10 Q0 -140 150 10 Q112 -6 75 10 Q38 -6 0 10 Q-38 -6 -75 10 Q-112 -6 -150 10 Z" fill="#f2b632" />
      <path d="M0 10 Q-38 -6 -75 10 Q-60 -80 0 -110 Z M0 10 Q38 -6 75 10 Q60 -80 0 -110 Z" fill="#e4a21c" opacity="0.45" />
      <circle cy="-112" r="5" fill="#5b4636" />
    </g>
  );
}

function Umbrella({ hand }: { hand: [number, number] }) {
  const [hx, hy] = hand;
  return (
    <g>
      <animateTransform attributeName="transform" type="rotate" values={`-3 ${hx} ${hy};3 ${hx} ${hy};-3 ${hx} ${hy}`} dur="5s" repeatCount="indefinite" />
      <path d={`M${hx} ${hy + 20} L${hx} ${hy - 150} M${hx} ${hy + 20} q0 14 -12 14`} stroke="#5b4636" strokeWidth="6" fill="none" strokeLinecap="round" />
      <Canopy x={hx - 10} y={hy - 150} />
    </g>
  );
}

function Book() {
  return (
    <g>
      <path d="M-50 -104 L0 -94 L50 -104 L50 -60 L0 -50 L-50 -60 Z" fill="#3f6fb5" />
      <path d="M-45 -101 L0 -91 L0 -54 L-45 -63 Z" fill="#fbf8f2" />
      <path d="M45 -101 L0 -91 L0 -54 L45 -63 Z" fill="#f4efe4" />
      <path d="M-38 -90 L-8 -84 M-38 -82 L-8 -76 M-38 -74 L-14 -69 M8 -84 L38 -90 M8 -76 L38 -82" stroke="#c9c2b4" strokeWidth="2" />
      <path className="fx-page" d="M0 -91 L45 -101 L45 -63 L0 -54 Z" fill="#fffdf8" />
    </g>
  );
}

function Lantern({ x, y }: { x: number; y: number }) {
  const { glow } = useContext(Ids);
  return (
    <g>
      <circle className="fx-glowpulse" cx={x} cy={y + 34} r="120" fill={`url(#${glow})`} />
      <path d={`M${x} ${y} L${x} ${y + 12}`} stroke={DARK} strokeWidth="3" />
      <rect x={x - 15} y={y + 12} width="30" height="40" rx="6" fill="#2d2d2d" />
      <rect x={x - 10} y={y + 17} width="20" height="30" rx="4" fill="#ffd56b" />
    </g>
  );
}

function Kite({ hand }: { hand: [number, number] }) {
  const [hx, hy] = hand;
  return (
    <g>
      <animateTransform attributeName="transform" type="rotate" values={`-2 ${hx} ${hy};2.5 ${hx} ${hy};-2 ${hx} ${hy}`} dur="4.5s" repeatCount="indefinite" />
      <path d={`M${hx} ${hy} Q 230 -200 330 -290`} stroke="#5b4636" strokeWidth="2" fill="none" />
      <g transform="translate(330 -340) rotate(18)">
        <path d="M0 -60 L40 0 L0 64 L-40 0 Z" fill="#e85d75" />
        <path d="M0 -60 L0 64 M-40 0 L40 0" stroke="#fff" strokeWidth="3" opacity="0.8" />
        <path d="M0 -60 L40 0 L0 0 Z" fill="#f2b632" />
        <path d="M0 64 q-20 30 0 60 q20 30 0 60" stroke="#5b4636" strokeWidth="2" fill="none" />
        {[94, 154].map((by) => (
          <path key={by} d={`M-12 ${by - 8} L12 ${by + 8} L12 ${by - 8} L-12 ${by + 8} Z`} fill="#3f6fb5" />
        ))}
      </g>
    </g>
  );
}

function Snowman({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <circle cy="-52" r="54" fill="#fbfdff" />
      <circle cy="-140" r="40" fill="#fbfdff" />
      <circle cy="-204" r="30" fill="#fbfdff" />
      <path d="M-36 -146 L-86 -186 M36 -146 L84 -176 M-70 -173 L-80 -192 M70 -167 L84 -184" stroke="#5b4636" strokeWidth="5" strokeLinecap="round" />
      <circle cx="-10" cy="-212" r="4" fill={DARK} />
      <circle cx="10" cy="-212" r="4" fill={DARK} />
      <path d="M0 -202 L30 -196 L0 -194 Z" fill="#f08a2c" />
      {[-150, -130, -110].map((by) => <circle key={by} cy={by + 10} r="4" fill={DARK} />)}
    </g>
  );
}

function Butterfly() {
  return (
    <g className="fx-butterfly">
      <g transform="scale(1.8)">
      <g className="fx-wing">
        <ellipse cx="-9" cy="-4" rx="11" ry="14" fill="#f2b632" />
        <ellipse cx="9" cy="-4" rx="11" ry="14" fill="#f2b632" />
        <ellipse cx="-7" cy="10" rx="7" ry="9" fill="#e85d75" />
        <ellipse cx="7" cy="10" rx="7" ry="9" fill="#e85d75" />
      </g>
      <rect x="-2" y="-12" width="4" height="26" rx="2" fill={DARK} />
      </g>
    </g>
  );
}
