"use client";

// The moving layer behind a party page (3.4.0): confetti, gold bokeh, twinkling stars, rising
// bubbles, snow, drifting leaves or embers – in the theme's colours. Still (one frame) for those
// who ask for less motion, and paused while the page is hidden.
import { useEffect, useRef } from "react";
import type { Effect } from "@/lib/partyThemes";

type Bit = { x: number; y: number; r: number; vx: number; vy: number; rot: number; vr: number; col: string; a: number; p: number; kind: number };

export default function PartySky({ effect, colors }: { effect: Effect; colors: string[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = `${effect}:${colors.join(",")}`;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || effect === "none") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    let bits: Bit[] = [];
    let frame = 0;
    const pick = (i: number) => colors[i % colors.length] ?? "#ffffff";
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    function seed() {
      const area = (w * h) / 10000;
      const count = { confetti: area / 1.6, bokeh: area / 3.2, stars: area / 1.4, bubbles: area / 4, snow: area / 1.5, leaves: area / 6, embers: area / 2.5 }[effect as Exclude<Effect, "none">] ?? 0;
      bits = Array.from({ length: Math.min(260, Math.round(count)) }, (_, i) => ({
        x: rnd(0, w), y: rnd(0, h), r: 0, vx: 0, vy: 0, rot: rnd(0, 6.28), vr: rnd(-0.05, 0.05), col: pick(i), a: rnd(0.25, 0.7), p: rnd(0, 6.28), kind: Math.random() < 0.3 ? 1 : 0,
      })).map((b) => {
        switch (effect) {
          case "confetti": return { ...b, r: rnd(3, 6), vy: rnd(0.35, 1), vx: rnd(-0.3, 0.3) };
          case "bokeh": return { ...b, r: b.kind ? rnd(1.5, 3) : rnd(10, 46), a: b.kind ? 0.6 : rnd(0.05, 0.16), vy: b.kind ? rnd(0.2, 0.6) : 0, vx: 0 };
          case "stars": return { ...b, r: rnd(0.6, 2.2), vy: 0, vx: 0 };
          case "bubbles": return { ...b, r: rnd(3, 14), vy: -rnd(0.25, 0.8), vx: 0, a: rnd(0.2, 0.5) };
          case "snow": return { ...b, r: rnd(1.2, 3.5), vy: rnd(0.3, 1), vx: rnd(-0.2, 0.2), a: rnd(0.5, 0.9) };
          case "leaves": return { ...b, r: rnd(5, 10), vy: rnd(0.3, 0.8), vx: rnd(-0.4, 0.4), a: rnd(0.4, 0.75) };
          case "embers": return { ...b, r: rnd(1, 2.8), vy: -rnd(0.4, 1.2), vx: rnd(-0.3, 0.3), a: rnd(0.5, 0.95) };
          default: return b;
        }
      });
    }
    function size() {
      w = canvas!.clientWidth;
      h = canvas!.clientHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function draw() {
      ctx!.clearRect(0, 0, w, h);
      for (const b of bits) {
        if (!reduce) {
          b.p += 0.02;
          b.x += b.vx + (effect === "leaves" || effect === "snow" || effect === "confetti" ? Math.sin(b.p + b.y / 80) * 0.3 : effect === "bubbles" || effect === "embers" ? Math.sin(b.p) * 0.25 : 0);
          b.y += b.vy;
          b.rot += b.vr;
          if (b.y > h + 20) { b.y = -20; b.x = rnd(0, w); }
          if (b.y < -20) { b.y = h + 20; b.x = rnd(0, w); }
          if (b.x > w + 20) b.x = -20;
          if (b.x < -20) b.x = w + 20;
        }
        ctx!.save();
        ctx!.translate(b.x, b.y);
        ctx!.globalAlpha = b.a;
        ctx!.fillStyle = b.col;
        ctx!.strokeStyle = b.col;
        switch (effect) {
          case "confetti":
            ctx!.rotate(b.rot);
            if (b.kind) { ctx!.beginPath(); ctx!.arc(0, 0, b.r * 0.6, 0, 6.28); ctx!.fill(); }
            else ctx!.fillRect(-b.r / 2, -b.r, b.r, b.r * 2 * Math.abs(Math.cos(b.rot * 1.7)) + 1);
            break;
          case "bokeh": {
            if (b.kind) {
              ctx!.rotate(b.rot);
              ctx!.fillRect(-b.r / 2, -b.r * 1.5, b.r, b.r * 3 * Math.abs(Math.cos(b.rot * 1.7)) + 0.5);
            } else {
              const a = b.a * (0.6 + 0.4 * Math.sin(b.p));
              const g = ctx!.createRadialGradient(0, 0, 0, 0, 0, b.r);
              g.addColorStop(0, b.col);
              g.addColorStop(1, "transparent");
              ctx!.globalAlpha = a;
              ctx!.fillStyle = g;
              ctx!.beginPath();
              ctx!.arc(0, 0, b.r, 0, 6.28);
              ctx!.fill();
            }
            break;
          }
          case "stars": {
            ctx!.globalAlpha = b.a * (0.35 + 0.65 * Math.abs(Math.sin(b.p * 1.3)));
            if (b.kind && b.r > 1.4) {
              const s = b.r * 3;
              ctx!.beginPath();
              ctx!.moveTo(0, -s); ctx!.lineTo(s * 0.25, -s * 0.25); ctx!.lineTo(s, 0); ctx!.lineTo(s * 0.25, s * 0.25);
              ctx!.lineTo(0, s); ctx!.lineTo(-s * 0.25, s * 0.25); ctx!.lineTo(-s, 0); ctx!.lineTo(-s * 0.25, -s * 0.25);
              ctx!.fill();
            } else { ctx!.beginPath(); ctx!.arc(0, 0, b.r, 0, 6.28); ctx!.fill(); }
            break;
          }
          case "bubbles":
            ctx!.lineWidth = 1.2;
            ctx!.beginPath(); ctx!.arc(0, 0, b.r, 0, 6.28); ctx!.stroke();
            ctx!.globalAlpha = b.a * 0.6;
            ctx!.beginPath(); ctx!.arc(-b.r * 0.35, -b.r * 0.35, b.r * 0.25, 0, 6.28); ctx!.fill();
            break;
          case "snow":
            ctx!.beginPath(); ctx!.arc(0, 0, b.r, 0, 6.28); ctx!.fill();
            break;
          case "leaves":
            ctx!.rotate(b.rot);
            ctx!.beginPath();
            ctx!.ellipse(0, 0, b.r, b.r * 0.45, 0, 0, 6.28);
            ctx!.fill();
            break;
          case "embers": {
            const g = ctx!.createRadialGradient(0, 0, 0, 0, 0, b.r * 3);
            g.addColorStop(0, b.col);
            g.addColorStop(1, "transparent");
            ctx!.globalAlpha = b.a * (0.6 + 0.4 * Math.sin(b.p * 2));
            ctx!.fillStyle = g;
            ctx!.beginPath(); ctx!.arc(0, 0, b.r * 3, 0, 6.28); ctx!.fill();
            break;
          }
        }
        ctx!.restore();
      }
      if (!reduce && !document.hidden) frame = requestAnimationFrame(draw);
    }
    const onVisible = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) draw();
    };
    const onResize = () => {
      size();
      if (reduce) draw();
    };
    size();
    draw();
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (effect === "none") return null;
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-0 h-full w-full" />;
}
