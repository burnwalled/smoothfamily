"use client";

// Family settings → Family members → one member (3.0.4): everything about a person in one place –
// name, colour and picture, sign-in (a new password, two-step reset), language, which apps they use,
// and for a child the birthday, the allowance, the little ones' mode and two homes; their medicines
// and emergency card. Adults keep their own medicines private, and choose their own picture.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, CircleCheck, KeyRound, LayoutGrid, ShieldOff, Trash2 } from "lucide-react";
import { api, Member } from "@/lib/api";
import { LOCALES, useI18n } from "@/lib/i18n";
import { refreshResource, setApiData, useApi } from "@/lib/query";
import { APP_PAGES } from "@/lib/nav";
import { COLORS } from "@/lib/colors";
import { useMe } from "@/components/Shell";
import MemberAvatar from "@/components/MemberAvatar";
import AllowanceRates from "@/components/allowance/AllowanceRates";
import Emergency from "@/components/safety/Emergency";
import Medicine from "@/components/safety/Medicine";
import TwoHomes from "@/components/custody/TwoHomes";

const PRESETS = ["bear", "cat", "dog", "fox", "frog", "hedgehog", "koala", "lion", "owl", "panda", "penguin", "rabbit"];
type Person = { id: string; name: string; user_id: string | null; birth_year: number | null; birth_month: number | null; birth_day: number | null };
type EasyChild = { id: string; easy_mode: boolean };

function Section({ title, icon: Icon, children }: { title: string; icon?: typeof KeyRound; children: React.ReactNode }) {
  return (
    <section className="card p-5" aria-label={title}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
        {Icon && <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />}
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function MemberPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const me = useMe();
  // From the cache: the member in the family's list (undefined while it loads, null if gone).
  const membersQuery = useApi<Member[]>("/api/family/members");
  const member = membersQuery.data ? (membersQuery.data.find((m) => m.id === id) ?? null) : membersQuery.isError ? null : undefined;
  // A change shows at once in the list (and so everywhere), then the saved one replaces it.
  const setMember = (next: Member) => setApiData<Member[]>("/api/family/members", (all) => all?.map((m) => (m.id === next.id ? next : m)));
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const child = member?.role === "child";
  const people = useApi<Person[]>(child ? "/api/birthdays/people" : null).data;
  const person = people ? (people.find((x) => x.user_id === id) ?? null) : undefined;
  const easyChildren = useApi<EasyChild[]>(child ? "/api/easy/children" : null).data;
  const easy = easyChildren ? (easyChildren.find((r) => r.id === id)?.easy_mode ?? false) : null;
  const setEasy = (on: boolean) => setApiData<EasyChild[]>("/api/easy/children", (rows) => rows?.map((r) => (r.id === id ? { ...r, easy_mode: on } : r)));

  // The name and the birthday fields start from what is saved.
  const savedName = member?.display_name;
  useEffect(() => {
    if (savedName) setName(savedName);
  }, [savedName]);
  const personId = person?.id;
  useEffect(() => {
    if (person?.birth_month && person.birth_day) setBirth(person.birth_year ? `${person.birth_year}-${String(person.birth_month).padStart(2, "0")}-${String(person.birth_day).padStart(2, "0")}` : "");
  }, [personId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(action: () => Promise<unknown>, message = "") {
    setError("");
    setDone("");
    try {
      await action();
      if (message) setDone(message);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
      return false;
    }
  }

  if (member === undefined) return <p className="text-sm text-muted">{t("common.loading")}</p>;
  if (member === null) return <p className="text-sm text-muted">{t("member.notFound")}</p>;

  const isAdmin = member.role === "admin";
  // An adult who may manage the family (not the admin) keeps a child's everyday things here; the
  // account – name, picture, sign-in, apps – is the admin's.
  const iAmAdmin = me.role === "admin";
  if (!iAmAdmin && member.role !== "child") return <p className="text-sm text-muted">{t("settings.adminOnly")}</p>;
  const self = member.id === me.id;
  const ownPicture = child || self;
  const apps = member.apps ?? [];
  // Shown at once, saved behind (and read back).
  const patch = (body: Partial<Member>) => {
    setMember({ ...member, ...body });
    return run(() => api.patch(`/api/family/members/${member.id}`, body), t("home.saved"));
  };
  const saveApps = (next: string[] | null) => {
    setMember({ ...member, app_access: next, apps: next ?? member.apps });
    return run(() => api.put(`/api/family/members/${member.id}/apps`, { apps: next }));
  };
  const roleLabel = isAdmin ? t("settings.role.admin") : child ? t("settings.role.child") : t("settings.role.adult");

  async function upload(file: File) {
    const form = new FormData();
    form.append("file", file);
    await run(async () => {
      const resp = await fetch(`/api/family/members/${member!.id}/avatar`, { method: "POST", credentials: "same-origin", body: form });
      if (!resp.ok) throw new Error((await resp.json().catch(() => null))?.detail ?? resp.statusText);
      // The upload went past api.post: read the family again for the new picture.
      await refreshResource("family");
    });
  }

  async function saveBirthday() {
    const [y, m, d] = birth.split("-").map(Number);
    const body = { name: member!.display_name, user_id: member!.id, birth_year: y || null, birth_month: m || null, birth_day: d || null };
    await run(() => (person ? api.patch(`/api/birthdays/people/${person.id}`, body) : api.post("/api/birthdays/people", body)), t("home.saved"));
  }

  return (
    <div className="space-y-4">
      <Link href="/settings/members" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="h-4 w-4" aria-hidden />
        {t("member.back")}
      </Link>

      {/* Who it is: picture, name, colour */}
      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-4">
          <MemberAvatar member={member} className="h-20 w-20 text-2xl ring-2 ring-edge" />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-extrabold">{member.display_name}</h2>
            <p className="text-sm text-muted">@{member.username} · {roleLabel}</p>
          </div>
        </div>
        {iAmAdmin && (
        <>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="label">{t("profile.displayName")}</span>
            <input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name.trim() !== member.display_name && patch({ display_name: name.trim() })} />
          </label>
          <div>
            <span className="label">{t("member.color")}</span>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button key={c} type="button" className={`h-8 w-8 rounded-full ring-offset-2 ${member.color === c ? "ring-2 ring-ink" : ""}`} style={{ background: c }} onClick={() => patch({ color: c })} aria-label={c} aria-pressed={member.color === c} />
              ))}
            </div>
          </div>
        </div>
        {ownPicture ? (
          <div className="mt-4">
            <span className="label">{t("profile.avatar")}</span>
            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map((p) => (
                <button key={p} type="button" onClick={() => run(() => api.post(`/api/family/members/${member.id}/avatar/preset`, { name: p }))} className={`h-11 w-11 overflow-hidden rounded-full border-2 ${member.avatar_key === `preset:${p}` ? "border-primary-700 ring-2 ring-primary-700" : "border-edge"}`} aria-label={p}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/avatars/avatar-${p}.svg`} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
              <label className="btn-ghost cursor-pointer border border-edge text-sm">
                {t("profile.uploadAvatar")}
                <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
              </label>
              {member.avatar_key && (
                <button className="text-xs text-muted hover:underline" onClick={() => run(() => api.del(`/api/family/members/${member.id}/avatar`))}>{t("member.pictureRemove")}</button>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted">{t("member.pictureOwn", { name: member.display_name })}</p>
        )}
        </>
        )}
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        {done && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-green-700">
            <CircleCheck className="h-4 w-4" aria-hidden />
            {done}
          </p>
        )}
      </section>

      {/* Signing in */}
      {iAmAdmin && (
      <Section title={t("member.account")} icon={KeyRound}>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => api.post(`/api/family/members/${member.id}/password`, { password }), t("settings.passwordResetDone", { name: member.display_name }))) setPassword("");
          }}
        >
          <input className="input min-w-0 flex-1" type="password" autoComplete="new-password" placeholder={t("settings.newPasswordPh", { name: member.display_name })} value={password} onChange={(e) => setPassword(e.target.value)} aria-label={t("settings.resetPassword")} />
          <button className="btn-primary shrink-0" type="submit" disabled={password.length < 4}>{t("settings.savePassword")}</button>
        </form>
        <p className="mt-1 text-xs text-muted">{t("settings.resetPasswordHint")}</p>
        <button
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink hover:underline"
          onClick={() => confirm(t("security.resetMfaConfirm", { name: member.display_name })) && run(() => api.post(`/api/family/members/${member.id}/reset-mfa`), t("security.resetMfaDone", { name: member.display_name }))}
        >
          <ShieldOff className="h-4 w-4" aria-hidden />
          {t("security.resetMfa")}
        </button>
        {child && (
          <label className="mt-4 flex items-center gap-2 text-sm">
            {t("settings.memberLanguage")}
            <select className="input !w-auto py-1" value={member.language ?? "en"} onChange={(e) => patch({ language: e.target.value })}>
              {LOCALES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </label>
        )}
        {member.role === "adult" && (
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary-700" checked={!!member.can_manage_family} onChange={(e) => patch({ can_manage_family: e.target.checked })} />
            <span>
              {t("settings.canManage")}
              <span className="block text-xs text-muted">{t("settings.canManageHelp")}</span>
            </span>
          </label>
        )}
      </Section>

      )}

      {/* Apps */}
      {iAmAdmin && (
      <Section title={isAdmin ? t("settings.appsAll") : t("settings.appsCount", { n: apps.length, total: APP_PAGES.length })} icon={LayoutGrid}>
        {isAdmin ? (
          <p className="text-xs text-muted">{t("settings.appsAdminHint")}</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted">{t("settings.appsHint", { name: member.display_name })}</p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {APP_PAGES.map((item) => (
                <label key={item.key} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-edge bg-surface px-2.5 text-xs">
                  <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={apps.includes(item.key)} onChange={() => saveApps(apps.includes(item.key) ? apps.filter((k) => k !== item.key) : [...apps, item.key])} />
                  <item.icon className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
                  {t(item.labelKey)}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              {member.app_access == null ? t("settings.appsDefault") : <button className="underline hover:text-ink" onClick={() => saveApps(null)}>{t("settings.appsResetDefault")}</button>}
            </p>
          </>
        )}
      </Section>

      )}

      {/* A child: birthday, the little ones' mode, allowance, two homes */}
      {child && (
        <Section title={t("member.childTitle")}>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="label">{t("member.birthday")}</span>
              <input type="date" className="input w-auto" value={birth} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setBirth(e.target.value)} />
            </label>
            <button className="btn-ghost border border-edge" disabled={!birth} onClick={saveBirthday}>{t("common.save")}</button>
          </div>
          <p className="mt-1 text-xs text-muted">{t("member.birthdayHint")}</p>
          {easy !== null && (
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary-700" checked={easy} onChange={(e) => { setEasy(e.target.checked); void run(() => api.put(`/api/easy/children/${member.id}`, { easy_mode: e.target.checked })); }} />
              <span>
                {t("easy.title")}
                <span className="block text-xs text-muted">{t("easy.intro")}</span>
              </span>
            </label>
          )}
        </Section>
      )}
      {child && (
        <section id="two-homes" className="card p-5">
          <TwoHomes manage only={member.id} />
        </section>
      )}
      {child && <AllowanceRates only={member.id} />}

      {/* Medicines: a child's here; an adult's own are private (in their profile) */}
      {(child || self) && (
        <section className="card p-5">
          <Medicine manage only={member.id} />
        </section>
      )}
      {!child && !self && <p className="text-xs text-muted">{t("member.privateMeds", { name: member.display_name })}</p>}

      <section className="card p-5">
        <Emergency manage only={member.id} />
      </section>

      {!self && iAmAdmin && (
        <button
          className="inline-flex items-center gap-1.5 text-sm text-red-700 hover:underline"
          onClick={async () => {
            if (confirm(t("common.confirmRemove", { name: member.display_name })) && (await run(() => api.del(`/api/family/members/${member.id}`)))) router.push("/settings/members");
          }}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          {t("member.remove", { name: member.display_name })}
        </button>
      )}
    </div>
  );
}
