"use client";

// Family admin → Members: everyone in the family, and adding someone. Each member opens their own
// page (3.0.4) with everything about them – sign-in, language, apps, picture, a child's birthday,
// allowance and medicines, the emergency card.
import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { api, Member } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";
import { fieldErrors } from "@/lib/fieldErrors";
import { APP_PAGES } from "@/lib/nav";
import { GuestLinks } from "@/components/safety/Emergency";
import { COLORS } from "@/lib/colors";
import MemberAvatar from "@/components/MemberAvatar";
import People from "@/components/birthdays/People";
import { useMe } from "@/components/Shell";

export default function MembersSettingsPage() {
  const { t } = useI18n();
  // An adult who may manage the family sees the children's pages; accounts are the admin's.
  const admin = useMe().role === "admin";
  const members = useApi<Member[]>("/api/family/members").data ?? NONE;
  const [error, setError] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberUsername, setMemberUsername] = useState("");
  const [memberPassword, setMemberPassword] = useState("");
  const [memberRole, setMemberRole] = useState<"adult" | "child">("adult");
  // A child's birthday (3.0.1): kept in Birthdays; 6 or younger starts in the little ones' mode.
  const [memberBirth, setMemberBirth] = useState("");


  async function addMember() {
    setError("");
    try {
      await api.post("/api/family/members", {
        display_name: memberName,
        username: memberUsername,
        password: memberPassword,
        role: memberRole,
        color: COLORS[members.length % COLORS.length],
        birth_date: memberRole === "child" && memberBirth ? memberBirth : null,
      });
      setMemberName("");
      setMemberBirth("");
      setMemberUsername("");
      setMemberPassword("");
    } catch (e) {
      setError(fieldErrors(e, t, 4) ?? (e instanceof Error ? e.message : t("settings.memberError")));
    }
  }

  const roleLabel = (role: string) =>
    role === "admin" ? t("settings.role.admin") : role === "child" ? t("settings.role.child") : t("settings.role.adult");

  return (
    <div className="space-y-4">
    <section className="card p-5" aria-label={t("settings.members")}>
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("settings.members")}</h2>
      <p className="mb-3 text-xs text-muted">{t("member.listHint")}</p>
      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
      <ul className="divide-y divide-edge">
        {members.filter((m) => admin || m.role === "child").map((member) => (
          <li key={member.id}>
            <Link href={`/settings/members/${member.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-base">
              <MemberAvatar member={member} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{member.display_name}</span>
                <span className="block truncate text-xs text-muted">
                  @{member.username} · {roleLabel(member.role)} · {member.role === "admin" ? t("settings.appsAll") : t("settings.appsCount", { n: (member.apps ?? []).length, total: APP_PAGES.length })}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {admin && (
      <>
      <h3 className="mb-2 mt-5 text-sm font-semibold">{t("member.add")}</h3>
      <div className="grid gap-3 md:grid-cols-4">
        <input className="input" placeholder={t("settings.namePh")} value={memberName} onChange={(e) => setMemberName(e.target.value)} />
        <input className="input" placeholder={t("settings.usernamePh")} autoCapitalize="none" value={memberUsername} onChange={(e) => setMemberUsername(e.target.value.toLowerCase())} />
        <input className="input" placeholder={t("settings.passwordPh")} type="password" value={memberPassword} onChange={(e) => setMemberPassword(e.target.value)} />
        <div className="flex gap-2">
          <select className="input" value={memberRole} onChange={(e) => setMemberRole(e.target.value as "adult" | "child")}>
            <option value="adult">{t("settings.adult")}</option>
            <option value="child">{t("settings.child")}</option>
          </select>
          <button className="btn-primary shrink-0" onClick={addMember} disabled={!memberName || !memberUsername || !memberPassword}>
            {t("common.add")}
          </button>
        </div>
      </div>
      {memberRole === "child" && (
        <div className="mt-3">
          <label className="text-xs text-muted">
            {t("settings.childBirthday")}
            <input type="date" className="input mt-1 w-auto" value={memberBirth} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setMemberBirth(e.target.value)} />
          </label>
          <p className="mt-1 text-xs text-muted">{t("settings.childBirthdayHint")}</p>
        </div>
      )}
      </>
      )}
    </section>
    {/* Grandma and others without an account: for the birthdays (a guest link lets them see more). */}
    <div id="people" className="scroll-mt-20">
      <People others />
    </div>
    {/* Guests: a babysitter or the grandparents, for some hours or days, without an account. */}
    <div id="guests" className="scroll-mt-20">
      <GuestLinks />
    </div>
    </div>
  );
}
