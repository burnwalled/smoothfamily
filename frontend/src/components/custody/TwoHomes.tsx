"use client";

// Calendar → Two homes (2.7.5): for a child who lives part of the time with their other parent –
// the pattern, exceptions for holidays, the handover list, and a link for the other parent that
// shows only this child. The adults set it up; a child sees their own.
import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, Copy, Link2, Plus, Trash2 } from "lucide-react";
import { api, Member } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";
import { useMe } from "@/components/Shell";
import PageTitle, { EmptyState } from "@/components/PageTitle";
import SettingsLink from "@/components/SettingsLink";
import CoParents from "@/components/custody/CoParents";
import CustodyStrip, { CustodyDay } from "@/components/custody/CustodyStrip";

type Schedule = {
  user_id: string;
  name: string;
  color: string;
  other_home: string;
  pattern: "week" | "223" | "weekend" | "custom";
  anchor_date: string;
  handover_time: string;
  pause_tasks: boolean;
  handover_list_id: string | null;
  exceptions: { id: string; start_date: string; end_date: string; place: "here" | "other"; note: string }[];
  place: "here" | "other";
  next_handover: string | null;
  next_place: "here" | "other" | null;
  days: CustodyDay[];
};

const PATTERNS = ["week", "223", "weekend", "custom"] as const;
const today = () => new Date().toISOString().slice(0, 10);

function ScheduleCard({ child, schedule, adult, reload }: { child: Member; schedule: Schedule | null; adult: boolean; reload: () => void }) {
  const { t, dateLocale } = useI18n();
  const [editing, setEditing] = useState(!schedule && adult);
  const [form, setForm] = useState({
    other_home: schedule?.other_home ?? "", pattern: schedule?.pattern ?? "week", anchor_date: schedule?.anchor_date ?? today(),
    handover_time: schedule?.handover_time ?? "17:00", pause_tasks: schedule?.pause_tasks ?? true,
  });
  const [ex, setEx] = useState({ start_date: today(), end_date: today(), place: "here" as "here" | "other", note: "" });
  const [link, setLink] = useState<{ url: string; qr_svg: string } | null>(null);
  const [linkName, setLinkName] = useState("");
  const [error, setError] = useState("");
  const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "short", day: "numeric", month: "short" });

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  return (
    <section className="card space-y-4 p-4" aria-label={child.display_name}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <span className="h-3 w-3 rounded-full" style={{ background: child.color }} aria-hidden />
          {child.display_name}
        </h2>
        {schedule && (
          <p className="text-sm">
            <span className="font-semibold">{schedule.place === "here" ? t("custody.isHere") : t("custody.isAway", { home: schedule.other_home })}</span>
            {schedule.next_handover && (
              <span className="text-muted"> · {t(schedule.next_place === "other" ? "custody.nextAway" : "custody.nextHome", { home: schedule.other_home, day: day(schedule.next_handover), time: schedule.handover_time })}</span>
            )}
          </p>
        )}
      </div>

      {schedule && !editing && <CustodyStrip days={schedule.days} color={child.color} otherHome={schedule.other_home} weeks={6} />}

      {editing ? (
        <form
          className="grid gap-2 rounded-lg border border-edge p-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api.put(`/api/custody/${child.id}`, { ...form, other_home: form.other_home.trim(), handover_list: true });
              setEditing(false);
            });
          }}
        >
          <label className="text-sm">
            <span className="text-xs text-muted">{t("custody.otherHome")}</span>
            <input className="input mt-1 w-full" value={form.other_home} required maxLength={60} placeholder={t("custody.otherHomePh")} onChange={(e) => setForm({ ...form, other_home: e.target.value })} />
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted">{t("custody.pattern")}</span>
            <select className="input mt-1 w-full" value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value as Schedule["pattern"] })}>
              {PATTERNS.map((p) => <option key={p} value={p}>{t(`custody.pattern.${p}` as TranslationKey)}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted">{t(`custody.anchor.${form.pattern}` as TranslationKey)}</span>
            <input className="input mt-1 w-full" type="date" required value={form.anchor_date} onChange={(e) => setForm({ ...form, anchor_date: e.target.value })} />
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted">{t("custody.handoverTime")}</span>
            <input className="input mt-1 w-full" type="time" required value={form.handover_time} onChange={(e) => setForm({ ...form, handover_time: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={form.pause_tasks} onChange={(e) => setForm({ ...form, pause_tasks: e.target.checked })} />
            {t("custody.pauseTasks", { name: child.display_name })}
          </label>
          <p className="text-xs text-muted sm:col-span-2">{t("custody.help")}</p>
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" disabled={!form.other_home.trim()}>{t("custody.save")}</button>
            {schedule && <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>{t("common.cancel")}</button>}
          </div>
        </form>
      ) : (
        schedule && adult && (
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost border border-edge" onClick={() => setEditing(true)}>{t("custody.change")}</button>
            {schedule.handover_list_id && <Link className="btn-ghost border border-edge" href="/lists">{t("custody.handoverList")}</Link>}
            <button className="btn-ghost text-red-700" onClick={() => { if (window.confirm(t("custody.removeConfirm", { name: child.display_name }))) run(() => api.del(`/api/custody/${child.id}`)); }}>
              {t("custody.remove")}
            </button>
          </div>
        )
      )}

      {schedule && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted">{t("custody.exceptions")}</h3>
          {schedule.exceptions.length === 0 && <p className="text-xs text-muted">{t("custody.noExceptions")}</p>}
          <ul className="divide-y divide-edge text-sm">
            {schedule.exceptions.map((e) => (
              <li key={e.id} className="flex items-center gap-2 py-1.5">
                <span className="flex-1">
                  {day(e.start_date)}{e.end_date !== e.start_date && ` – ${day(e.end_date)}`} · <span className="font-semibold">{e.place === "here" ? t("custody.here") : schedule.other_home}</span>
                  {e.note && <span className="text-muted"> · {e.note}</span>}
                </span>
                {adult && (
                  <button className="text-red-700" onClick={() => run(() => api.del(`/api/custody/exceptions/${e.id}`))} aria-label={t("custody.removeException")}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {adult && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await api.post(`/api/custody/${child.id}/exceptions`, { ...ex, note: ex.note.trim() });
                  setEx({ start_date: today(), end_date: today(), place: "here", note: "" });
                });
              }}
            >
              <label className="text-sm">
                <span className="text-xs text-muted">{t("custody.from")}</span>
                <input className="input mt-1 block" type="date" value={ex.start_date} onChange={(e) => setEx({ ...ex, start_date: e.target.value, end_date: e.target.value > ex.end_date ? e.target.value : ex.end_date })} />
              </label>
              <label className="text-sm">
                <span className="text-xs text-muted">{t("custody.to")}</span>
                <input className="input mt-1 block" type="date" value={ex.end_date} min={ex.start_date} onChange={(e) => setEx({ ...ex, end_date: e.target.value })} />
              </label>
              <label className="text-sm">
                <span className="text-xs text-muted">{t("custody.where")}</span>
                <select className="input mt-1 block" value={ex.place} onChange={(e) => setEx({ ...ex, place: e.target.value as "here" | "other" })}>
                  <option value="here">{t("custody.here")}</option>
                  <option value="other">{schedule.other_home}</option>
                </select>
              </label>
              <input className="input min-w-32 flex-1" value={ex.note} maxLength={120} placeholder={t("custody.notePh")} aria-label={t("custody.note")} onChange={(e) => setEx({ ...ex, note: e.target.value })} />
              <button className="btn-ghost inline-flex items-center gap-1 border border-edge">
                <Plus className="h-4 w-4" aria-hidden />
                {t("custody.addException")}
              </button>
            </form>
          )}
        </div>
      )}

      {schedule && adult && (
        <div className="space-y-2 rounded-lg border border-edge p-3">
          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
            <Link2 className="h-3.5 w-3.5" aria-hidden />
            {t("custody.linkTitle")}
          </h3>
          <p className="text-xs text-muted">{t("custody.linkHelp", { name: child.display_name })}</p>
          {link ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <input className="input min-w-0 flex-1 font-mono text-xs" readOnly value={link.url} aria-label={t("custody.linkTitle")} onFocus={(e) => e.target.select()} />
                <button className="btn-ghost inline-flex items-center gap-1 border border-edge" onClick={() => navigator.clipboard?.writeText(link.url)}>
                  <Copy className="h-4 w-4" aria-hidden />
                  {t("guests.copy")}
                </button>
              </div>
              {/* SVG generated by our own backend (qrcode library), not user content. */}
              <div className="h-36 w-36 rounded bg-white p-2 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: link.qr_svg }} />
              <p className="text-xs text-muted">{t("custody.linkOnce")}</p>
            </div>
          ) : (
            <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => setLink(await api.post(`/api/custody/${child.id}/link`, { name: linkName.trim(), days: 180 }))); }}>
              <input className="input min-w-40 flex-1" value={linkName} maxLength={80} placeholder={t("custody.linkNamePh")} aria-label={t("custody.linkName")} onChange={(e) => setLinkName(e.target.value)} />
              <button className="btn-primary" disabled={!linkName.trim()}>{t("custody.makeLink")}</button>
            </form>
          )}
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}

/** In the calendar (`manage` off) the schedules are read; they are set up in the family's settings. */
// `only`: just this child (their page in the family's settings, 3.0.4).
export default function TwoHomes({ manage = false, only }: { manage?: boolean; only?: string }) {
  const { t } = useI18n();
  const me = useMe();
  const adult = me.role !== "child" && manage;
  const mayManage = me.role === "admin" || !!me.can_manage_family;
  // From the cache: a saved schedule or exception refreshes it.
  const schedulesQuery = useApi<Schedule[]>("/api/custody");
  const schedules = schedulesQuery.data ?? (schedulesQuery.isError ? NONE : null);
  const members = useApi<Member[]>("/api/family/members").data ?? NONE;
  const children = members.filter((m) => m.role === "child" && (!only || m.id === only));
  const [adding, setAdding] = useState("");
  if (schedules === null) return <p className="text-sm text-muted">{t("common.loading")}</p>;
  const withSchedule = new Set(schedules.map((s) => s.user_id));
  const shown = adult
    ? children.filter((c) => withSchedule.has(c.id) || c.id === adding)
    : children.filter((c) => withSchedule.has(c.id) && (me.role !== "child" || c.id === me.id));
  const others = children.filter((c) => !withSchedule.has(c.id) && c.id !== adding);

  return (
    <>
      {manage ? (
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("custody.title")}</h2>
      ) : (
        <>
          <Link href="/calendar" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:underline">
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {t("calendar.title")}
          </Link>
          <PageTitle title={t("custody.title")} />
        </>
      )}
      <p className="mt-1 text-sm text-muted">{t("custody.intro")}</p>
      {!manage && mayManage && <SettingsLink href="/settings/members" />}
      <div className="mt-4 space-y-4">
        {shown.length === 0 && <EmptyState>{me.role !== "child" ? t("custody.empty") : t("custody.emptyChild")}</EmptyState>}
        {shown.map((child) => (
          <ScheduleCard key={child.id} child={child} schedule={schedules.find((s) => s.user_id === child.id) ?? null} adult={adult} reload={() => setAdding("")} />
        ))}
        {adult && others.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">{t("custody.addFor")}</span>
            {others.map((c) => (
              <button key={c.id} className="btn-ghost inline-flex items-center gap-1 border border-edge" onClick={() => setAdding(c.id)}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} aria-hidden />
                {c.display_name}
              </button>
            ))}
          </div>
        )}
        {adult && children.length === 0 && <p className="text-sm text-muted">{t("custody.noChildren")}</p>}
        {me.role !== "child" && <CoParents children={children} />}
      </div>
    </>
  );
}
