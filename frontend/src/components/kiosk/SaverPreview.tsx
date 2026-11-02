"use client";

// A small picture of each screensaver for choosing one in the family's settings (3.0.4). The fox is
// the real scene, small; the others are drawn to look like themselves.
import { Image as ImageIcon, Moon } from "lucide-react";
import type { KioskScreensaver } from "@/lib/api";
import FoxScene from "./FoxScene";

export default function SaverPreview({ kind }: { kind: KioskScreensaver }) {
  if (kind === "fox")
    return (
      <span className="relative block aspect-[16/10] overflow-hidden rounded-lg bg-[#86bfe6]">
        <FoxScene now={new Date()} kind="partly" temp={12} wind={2} />
      </span>
    );
  if (kind === "flipclock")
    return (
      <span className="grid aspect-[16/10] place-items-center rounded-lg bg-[#1b1b1c]">
        <span className="flex gap-1.5">
          {["12", "34"].map((n) => (
            <span key={n} className="rounded-md bg-[#141415] px-2 py-1 font-semibold leading-none text-[#f4f4f1] shadow-inner [font-size:clamp(1rem,4vw,1.6rem)]">
              {n}
            </span>
          ))}
        </span>
      </span>
    );
  if (kind === "calm")
    return (
      <span className="grid aspect-[16/10] place-items-center rounded-lg bg-gradient-to-b from-[#dbeafe] to-[#f1f5f9] font-extralight text-[#1e293b] [font-size:clamp(1.2rem,5vw,2rem)]">
        12:34
      </span>
    );
  if (kind === "dark")
    return (
      <span className="grid aspect-[16/10] place-items-center rounded-lg bg-black">
        <Moon className="h-6 w-6 text-white/30" aria-hidden />
      </span>
    );
  return (
    <span className="relative grid aspect-[16/10] place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-[#f3b994] via-[#c98f9b] to-[#5b6fa8]">
      <ImageIcon className="h-7 w-7 text-white/80" aria-hidden />
      <span className="absolute bottom-1 left-1.5 text-[10px] font-bold text-white">12:34</span>
    </span>
  );
}
