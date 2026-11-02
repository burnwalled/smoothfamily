"use client";

// A family member's picture: a preset animal, an uploaded photo, or their initials on their colour.
import type { Member } from "@/lib/api";

export function avatarUrl(member: Pick<Member, "id" | "avatar_key">): string | null {
  const key = member.avatar_key;
  if (!key) return null;
  return key.startsWith("preset:") ? `/avatars/avatar-${key.slice(7)}.svg` : `/api/family/members/${member.id}/avatar?v=${encodeURIComponent(key)}`;
}

export default function MemberAvatar({ member, className = "h-10 w-10 text-sm" }: { member: Pick<Member, "id" | "display_name" | "color" | "avatar_key">; className?: string }) {
  const url = avatarUrl(member);
  const initials = member.display_name.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase() ?? "").join("");
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-full font-bold text-white ${className}`} style={{ background: url ? undefined : member.color }} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : initials}
    </span>
  );
}
