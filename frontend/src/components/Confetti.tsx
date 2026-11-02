"use client";

import { useState } from "react";

const COLORS = ["#E0B33D", "#B0793F", "#4F7A5B", "#9CA3AF", "#ef4444", "#3b82f6", "#a855f7"];

type Particle = { id: number; x: number; color: string; delay: number; size: number; round: boolean };

const PARTICLES: Particle[] = Array.from({ length: 32 }, (_, i) => ({
  id: i,
  x: (i / 32) * 100 + Math.random() * 3,
  color: COLORS[i % COLORS.length],
  delay: (i % 8) * 0.07,
  size: 6 + (i % 5) * 2,
  round: i % 3 !== 0,
}));

export default function Confetti({ show }: { show: boolean }) {
  if (!show) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {PARTICLES.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: "-12px",
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: p.round ? "50%" : "2px",
            animation: `confetti-fall 2.8s ease-in ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}
