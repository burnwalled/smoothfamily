"use client";

// A map of what is connected (3.1.0): the server in the middle and around it what talks to it – a
// family's devices, or (for the server admin) the families with their kinds of device around each.
// A line's colour is the device's health; a dashed line, a device that isn't there right now.
import type { LucideIcon } from "lucide-react";
import { Cpu, House, Laptop, MonitorSmartphone, Router, Server, Smartphone, Tablet, UserRound, Users } from "lucide-react";

export type Health = "ok" | "outdated" | "away" | "offline";
export type MapNode = { id: string; kind: string; label: string; sub?: string; status: Health; count?: number; children?: MapNode[] };

export const HEALTH_COLOR: Record<Health, string> = { ok: "#16a34a", outdated: "#d97706", away: "#94a3b8", offline: "#dc2626" };
export const KIND_ICON: Record<string, LucideIcon> = {
  mobile: Smartphone, tablet: Tablet, computer: Laptop, kiosk: MonitorSmartphone, gateway: Router, ha_app: House, family: Users, person: UserRound, server: Server,
};
const W = 800;
const H = 560;
const CX = W / 2;
const CY = H / 2;

/** The worst health of several: offline, then outdated, then away. */
export function worst(states: Health[]): Health {
  return (["offline", "outdated", "away", "ok"] as Health[]).find((s) => states.includes(s)) ?? "ok";
}

function cut(text: string, n: number) {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}

function Node({ x, y, r, node, small = false }: { x: number; y: number; r: number; node: MapNode; small?: boolean }) {
  const Icon = KIND_ICON[node.kind] ?? Cpu;
  const color = HEALTH_COLOR[node.status];
  const icon = small ? 16 : 24;
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="rgb(var(--c-surface))" stroke={color} strokeWidth={small ? 2.5 : 3} />
      <Icon x={x - icon / 2} y={y - icon / 2} width={icon} height={icon} color={color} strokeWidth={2} aria-hidden />
      {node.count !== undefined && node.count > 1 && (
        <g>
          <circle cx={x + r * 0.75} cy={y - r * 0.75} r={9} fill={color} />
          <text x={x + r * 0.75} y={y - r * 0.75 + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">{node.count}</text>
        </g>
      )}
      {!small && (
        <>
          <text x={x} y={y + r + 15} textAnchor="middle" fontSize="12" fontWeight="600" fill="currentColor" stroke="rgb(var(--c-surface))" strokeWidth="4" paintOrder="stroke">{cut(node.label, 20)}</text>
          {node.sub && <text x={x} y={y + r + 29} textAnchor="middle" fontSize="10.5" fill="currentColor" fillOpacity="0.6" stroke="rgb(var(--c-surface))" strokeWidth="4" paintOrder="stroke">{cut(node.sub, 24)}</text>}
        </>
      )}
    </g>
  );
}

export default function Topology({ center, nodes, label }: { center: string; nodes: MapNode[]; label: string }) {
  const n = nodes.length;
  const nested = nodes.some((x) => x.children?.length);
  const ring = nested ? 175 : n <= 6 ? 160 : 205;
  const place = (i: number, count: number, radius: number, start = -Math.PI / 2) => {
    const a = start + (i * 2 * Math.PI) / Math.max(count, 1);
    return { x: CX + radius * Math.cos(a), y: CY + radius * Math.sin(a), a };
  };
  // A node's own kinds of device fan out beyond it – further out when there are many, so they don't overlap.
  const fan = (p: { x: number; y: number; a: number }, j: number, count: number) => {
    const spread = Math.min(Math.PI * 0.9, 0.55 * count);
    const a = p.a - spread / 2 + (count > 1 ? (j * spread) / (count - 1) : spread / 2);
    const out = count > 1 ? Math.max(62, (38 * (count - 1)) / spread) : 62;
    return { x: p.x + out * Math.cos(a), y: p.y + out * Math.sin(a) };
  };
  // The picture is cut to what is on it (with room for the names), so a few devices aren't lost in
  // the middle of a phone's screen.
  const points: { x: number; y: number }[] = [{ x: CX, y: CY }];
  nodes.forEach((node, i) => {
    const p = place(i, n, ring);
    points.push(p);
    (node.children ?? []).forEach((_, j, kids) => points.push(fan(p, j, kids.length)));
  });
  const minX = Math.min(...points.map((q) => q.x)) - 80;
  const maxX = Math.max(...points.map((q) => q.x)) + 80;
  const minY = Math.min(...points.map((q) => q.y)) - 50;
  const maxY = Math.max(...points.map((q) => q.y)) + 70;
  const w = Math.max(maxX - minX, 560);
  const h = Math.max(maxY - minY, 420);
  const box = `${(minX + maxX - w) / 2} ${(minY + maxY - h) / 2} ${w} ${h}`;
  return (
    <svg viewBox={box} className="mx-auto h-auto w-full max-w-3xl text-ink" role="img" aria-label={label}>
      {nodes.map((node, i) => {
        const p = place(i, n, ring);
        const dashed = node.status === "offline" || node.status === "away";
        return <line key={`l-${node.id}`} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke={HEALTH_COLOR[node.status]} strokeWidth="2.5" strokeDasharray={dashed ? "6 6" : undefined} opacity="0.75" />;
      })}
      <g>
        <rect x={CX - 46} y={CY - 34} width="92" height="68" rx="16" fill="rgb(var(--c-surface))" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
        <Server x={CX - 14} y={CY - 24} width={28} height={28} strokeWidth={2} aria-hidden />
        <text x={CX} y={CY + 22} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="currentColor">{cut(center, 14)}</text>
      </g>
      {nodes.map((node, i) => {
        const p = place(i, n, ring);
        const kids = node.children ?? [];
        return (
          <g key={node.id}>
            {kids.map((kid, j) => {
              const { x, y } = fan(p, j, kids.length);
              return (
                <g key={kid.id}>
                  <line x1={p.x} y1={p.y} x2={x} y2={y} stroke={HEALTH_COLOR[kid.status]} strokeWidth="2" strokeDasharray={kid.status === "offline" || kid.status === "away" ? "4 4" : undefined} />
                  <Node x={x} y={y} r={17} node={kid} small />
                </g>
              );
            })}
            <Node x={p.x} y={p.y} r={nested ? 26 : 28} node={node} />
          </g>
        );
      })}
    </svg>
  );
}

export function Legend({ t }: { t: (key: "devices.health.ok" | "devices.health.outdated" | "devices.health.away" | "devices.health.offline") => string }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {(Object.keys(HEALTH_COLOR) as Health[]).map((h) => (
        <li key={h} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: HEALTH_COLOR[h] }} aria-hidden />
          {t(`devices.health.${h}`)}
        </li>
      ))}
    </ul>
  );
}
