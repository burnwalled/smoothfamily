"use client";

// The flip clock screensaver (3.0.3), after Familybrain's "Klockan": the time in two big flap cards,
// the weekday, date, month and year above, in the family's language. Black and white by day, dim
// red print at night (21–06) like the red light on military watches; the weekday card turns red on
// the weekend. A tap wakes the screen.
import { useState, type CSSProperties, type ReactNode } from "react";
// The typeface ships with the app (no font service is asked, at build or on the screen).
import "@fontsource/antonio/latin-500.css";
import "@fontsource/antonio/latin-600.css";
import "@fontsource/antonio/latin-ext-500.css";
import "@fontsource/antonio/latin-ext-600.css";
import "./flipclock.css";

export function isNight(now: Date): boolean {
  const h = now.getHours();
  return h >= 21 || h < 6;
}

export default function FlipClock({ now, locale, label, onTap }: { now: Date; locale: string; label: string; onTap: () => void }) {
  const part = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, opts).format(now);
  const two = (n: number) => String(n).padStart(2, "0");
  const year = String(now.getFullYear());
  const weekend = now.getDay() === 0 || now.getDay() === 6;
  // Right to left, like the mechanism: minutes first, then hours, then the date row.
  const delay = (step: number) => step * 0.12;
  return (
    <button type="button" className={`flipclock${isNight(now) ? " night" : ""}`} onClick={onTap} aria-label={label}>
      <span className="fc-case">
        <span className="fc-dates">
          <Window>
            <Flap kind="day" value={part({ weekday: "short" }).replace(".", "").slice(0, 3)} delay={delay(2)} off={weekend} />
          </Window>
          <Window>
            <Flap kind="date" value={String(now.getDate())} delay={delay(3)} />
          </Window>
          <Window>
            <Flap kind="month" value={part({ month: "long" })} delay={delay(4)} />
          </Window>
          <span className="fc-year">
            {[...year].map((digit, i) => (
              <Window key={i}>
                <Flap kind="digit" value={digit} delay={delay(5 + i)} />
              </Window>
            ))}
          </span>
        </span>
        <span className="fc-time">
          <Window>
            <Flap kind="time" value={two(now.getHours())} delay={delay(1)} />
          </Window>
          <Window>
            <Flap kind="time" value={two(now.getMinutes())} delay={delay(0)} />
          </Window>
        </span>
      </span>
    </button>
  );
}

function Window({ children }: { children: ReactNode }) {
  return <span className="fc-window">{children}</span>;
}

/** One flap card: when the value changes, the old print falls away on the top half while the new
 *  one swings down onto the bottom half. */
function Flap({ kind, value, delay, off = false }: { kind: string; value: string; delay: number; off?: boolean }) {
  const [shown, setShown] = useState(value);
  const [previous, setPrevious] = useState(value);
  if (value !== shown) {
    setPrevious(shown);
    setShown(value);
  }
  const flipping = previous !== shown;
  const style = { "--delay": `${delay}s` } as CSSProperties;
  return (
    <span className={`fc-flap fc-${kind}${off ? " off" : ""}`} aria-hidden>
      <Leaf half="top" text={shown} />
      <Leaf half="bottom" text={flipping ? previous : shown} />
      {flipping && (
        <>
          <Leaf key={`fall-${shown}`} half="top fall" text={previous} style={style} />
          <Leaf key={`rise-${shown}`} half="bottom rise" text={shown} style={style} onDone={() => setPrevious(shown)} />
        </>
      )}
      <span className="fc-seam" />
    </span>
  );
}

function Leaf({ half, text, style, onDone }: { half: string; text: string; style?: CSSProperties; onDone?: () => void }) {
  return (
    <span className={`fc-leaf ${half}`} style={style} onAnimationEnd={onDone && ((e) => e.animationName === "fc-rise" && onDone())}>
      <span className="fc-print">
        <b>{text}</b>
      </span>
    </span>
  );
}
