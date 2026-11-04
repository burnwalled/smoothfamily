"use client";

// Family settings → Calendars: subscribed iCal feeds, whose own calendar each is (2.8.4), and who sees
// them (and their details).
import { useState } from "react";
import Link from "next/link";
import { api, Feed, Member } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";
import { COLOR_NAMES, COLORS } from "@/lib/colors";

function toggleUser(list: string[], userId: string): string[] {
  return list.includes(userId) ? list.filter((x) => x !== userId) : [...list, userId];
}

export default function CalendarSettingsPage() {
  const { t } = useI18n();
  const members = useApi<Member[]>("/api/family/members").data ?? NONE;
  const feeds = useApi<Feed[]>("/api/calendar/feeds").data ?? NONE;
  const [error, setError] = useState("");
  const [feedName, setFeedName] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [feedColor, setFeedColor] = useState(COLORS[0]);
  const [feedMember, setFeedMember] = useState("");
  const [savingFeedId, setSavingFeedId] = useState<string | null>(null);


  async function addFeed() {
    setError("");
    try {
      await api.post("/api/calendar/feeds", { name: feedName, url: feedUrl, color: feedColor, member_id: feedMember || null });
      setFeedName("");
      setFeedUrl("");
      setFeedMember("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("settings.feedError"));
    }
  }

  async function updateFeedPrivacy(feedId: string, patch: Partial<Pick<Feed, "visible_to" | "details_for" | "member_id">>) {
    setSavingFeedId(feedId);
    try {
      await api.patch(`/api/calendar/feeds/${feedId}`, patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSavingFeedId(null);
    }
  }

  const memberChecks = (feed: Feed, field: "visible_to" | "details_for") => (
    <div className="mt-1 space-y-1">
      {members.map((m) => {
        const current = feed[field];
        const checked = !current.length || current.includes(m.id);
        return (
          <label key={`${feed.id}-${field}-${m.id}`} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary-700"
              checked={checked}
              onChange={() => {
                const base = current.length ? current : members.map((x) => x.id);
                const next = toggleUser(base, m.id);
                updateFeedPrivacy(feed.id, { [field]: next.length === members.length ? [] : next });
              }}
              disabled={savingFeedId === feed.id}
            />
            {m.display_name}
          </label>
        );
      })}
    </div>
  );

  const whose = (value: string, onChange: (id: string) => void, label: string, disabled = false) => (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} disabled={disabled}>
      <option value="">{t("settings.feedFamily")}</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {t("settings.feedOwn", { name: m.display_name })}
        </option>
      ))}
    </select>
  );

  return (
    <section className="card p-5">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("settings.calendars")}</h2>
      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
      <ul className="space-y-2">
        {feeds.map((feed) => (
          <li key={feed.id} className="rounded border border-edge p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: feed.color }} />
                <span className="font-semibold">{feed.name}</span>
                {feed.url && <span className="max-w-[40ch] truncate text-xs text-muted">{feed.url}</span>}
              </span>
              {feed.can_edit !== false ? (
                <button
                  className="text-xs text-red-700 hover:underline"
                  onClick={async () => {
                    if (confirm(t("common.confirmRemove", { name: feed.name }))) {
                      await api.del(`/api/calendar/feeds/${feed.id}`);
                    }
                  }}
                >
                  {t("common.remove")}
                </button>
              ) : (
                <span className="text-xs text-muted">{t("settings.feedSomeoneElses")}</span>
              )}
            </div>
            {feed.can_edit !== false && (
              <>
              <div className="mt-2 max-w-sm">
                {whose(feed.member_id ?? "", (id) => updateFeedPrivacy(feed.id, { member_id: id || null }), t("settings.feedWhose", { name: feed.name }), savingFeedId === feed.id)}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("settings.feedVisibleTo")}</p>
                  {memberChecks(feed, "visible_to")}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("settings.feedDetailsFor")}</p>
                  {memberChecks(feed, "details_for")}
                </div>
              </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <input className="input" placeholder={t("settings.feedNamePh")} value={feedName} onChange={(e) => setFeedName(e.target.value)} />
        <input className="input md:col-span-2" placeholder={t("settings.feedUrlPh")} value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} />
        <div className="md:col-span-4">{whose(feedMember, setFeedMember, t("settings.feedWhoseNew"))}</div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span
              className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full"
              style={{ background: feedColor }}
              aria-hidden
            />
            <select
              className="input pl-8"
              value={feedColor}
              onChange={(e) => setFeedColor(e.target.value)}
              aria-label={t("settings.feedColor")}
            >
              {COLORS.map((c) => (
                <option key={c} value={c}>{t(COLOR_NAMES[c])}</option>
              ))}
            </select>
          </div>
          <button className="btn-primary shrink-0" onClick={addFeed} disabled={!feedName || !feedUrl}>
            {t("common.add")}
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">{t("settings.feedOwnHint")}</p>
      <p className="mt-2 text-xs text-muted">
        {t("settings.icalHelp")}{" "}
        <Link href="/help/calendar" className="font-semibold text-accent hover:underline">
          {t("settings.icalGuideLink")} →
        </Link>
      </p>
    </section>
  );
}
