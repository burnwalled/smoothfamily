"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import NavPreferences from "@/components/NavPreferences";
import SecuritySettings from "@/components/SecuritySettings";
import { Achievement, AchievementsResponse, api, ApiError, Me, NotificationPrefs, PushSubscription } from "@/lib/api";
import { LOCALES, Locale, TranslationKey, useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";
import { THEMES, ThemeId, useTheme } from "@/lib/theme";
import { useSetMe } from "@/components/Shell";
import { PresenceSetting } from "@/components/Presence";
import HealthImport from "@/components/health/HealthImport";
import { MyEmergencyCard } from "@/components/safety/Emergency";
import Medicine from "@/components/safety/Medicine";
import PageTitle from "@/components/PageTitle";
import TabNav from "@/components/TabNav";
import PhoneCalendar from "@/components/PhoneCalendar";

const PROFILE_TABS = ["about", "menu", "notifications", "security"] as const;

export default function ProfilePage() {
  // My profile in four parts (2.8.0); opened on one with ?tab=… (e.g. from a notification setting).
  const [tab, setTab] = useState<(typeof PROFILE_TABS)[number]>(() => {
    if (typeof window === "undefined") return "about";
    const asked = new URLSearchParams(window.location.search).get("tab");
    return (PROFILE_TABS as readonly string[]).includes(asked ?? "") ? (asked as (typeof PROFILE_TABS)[number]) : "about";
  });
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  // The same cached answer as the Shell's: a saved change shows everywhere at once.
  const me = useApi<Me>("/api/auth/me").data ?? null;
  const setMe = useSetMe();
  const achievements = useApi<AchievementsResponse>("/api/achievements").data?.achievements ?? NONE;
  const [displayName, setDisplayName] = useState(me?.display_name ?? "");
  const [email, setEmail] = useState(me?.email ?? "");
  const meId = me?.id;
  useEffect(() => {
    if (!me) return;
    setDisplayName(me.display_name);
    setEmail(me.email ?? "");
  }, [meId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<PushSubscription[]>([]);

  useEffect(() => {

    const swOk = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
    setPushSupported(swOk);

    refreshSubscriptions().catch(() => {});
  }, []);

  // Push is per device: "enabled" means this browser has a subscription the server knows,
  // not that some other device of mine does.
  async function refreshSubscriptions() {
    const rows = await api.get<PushSubscription[]>("/api/push/subscriptions");
    setSubscriptions(rows);
    let endpoint: string | null = null;
    if ("serviceWorker" in navigator && "PushManager" in window) {
      const reg = await navigator.serviceWorker.getRegistration();
      endpoint = (await reg?.pushManager.getSubscription())?.endpoint ?? null;
    }
    setThisEndpoint(endpoint);
    setPushEnabled(endpoint !== null && rows.some((row) => row.endpoint === endpoint));
  }

  const recent = useMemo(() => {
    return achievements
      .filter((a) => !!a.unlocked_at)
      .sort((a, b) => (new Date(b.unlocked_at!).getTime() - new Date(a.unlocked_at!).getTime()))
      .slice(0, 5);
  }, [achievements]);

  const avatarUrl = me?.avatar_key
    ? me.avatar_key.startsWith("preset:")
      ? `/avatars/avatar-${me.avatar_key.slice(7)}.svg`
      : `/api/auth/me/avatar?v=${encodeURIComponent(me.avatar_key)}`
    : null;

  const PRESETS = ["bear", "cat", "dog", "fox", "frog", "hedgehog", "koala", "lion", "owl", "panda", "penguin", "rabbit"];

  async function selectPreset(name: string) {
    setError("");
    try {
      const updated = await api.post<Me>("/api/auth/me/avatar/preset", { name });
      setMe(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function saveProfile() {
    if (!me) return;
    setSaving(true);
    setError("");
    try {
      const updated = await api.patch<Me>("/api/auth/me", { display_name: displayName, email: email.trim(), language: locale, theme });
      setMe(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    setPasswordMsg(null);
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ ok: false, text: t("profile.passwordMismatch") });
      return;
    }
    try {
      await api.post("/api/auth/me/password", { current_password: currentPassword, new_password: newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMsg({ ok: true, text: t("profile.passwordChanged") });
    } catch (e) {
      const wrong = e instanceof ApiError && e.status === 400;
      setPasswordMsg({ ok: false, text: wrong ? t("profile.passwordWrong") : t("common.error") });
    }
  }

  async function changeLanguage(next: Locale) {
    setLocale(next);
    try {
      const updated = await api.patch<Me>("/api/auth/me", { language: next });
      setMe(updated);
    } catch {}
  }

  async function changeTheme(next: ThemeId) {
    setTheme(next);
    try {
      const updated = await api.patch<Me>("/api/auth/me", { theme: next });
      setMe(updated);
    } catch {}
  }

  async function uploadAvatar(file: File) {
    const form = new FormData();
    form.append("file", file);
    setUploading(true);
    setError("");
    try {
      const resp = await fetch("/api/auth/me/avatar", {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      if (!resp.ok) {
        let msg = resp.statusText;
        try {
          const b = await resp.json();
          if (typeof b.detail === "string") msg = b.detail;
        } catch {}
        throw new Error(msg);
      }
      const updated = await resp.json() as Me;
      setMe(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setUploading(false);
    }
  }

  function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = window.atob(base64);
    return Uint8Array.from([...raw].map((ch) => ch.charCodeAt(0)));
  }

  async function enablePush() {
    if (!pushSupported) return;
    if (!(window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
      setError(t("profile.pushNeedHttps"));
      return;
    }

    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      setError(t("profile.pushUnavailable"));
      return;
    }

    const reg = await navigator.serviceWorker.ready;
    const vapid = await api.get<{ public_key: string }>("/api/push/vapid-public-key");
    const appServerKey = urlBase64ToUint8Array(vapid.public_key);
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey as unknown as BufferSource,
    });
    const payload = sub.toJSON();
    await api.post("/api/push/subscribe", payload);
    await refreshSubscriptions();
  }

  async function unsubscribeEndpoint(endpoint: string) {
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ endpoint }),
    });
    await refreshSubscriptions();
  }

  async function updateNotificationPrefs(prefs: NotificationPrefs) {
    const updated = await api.patch<Me>("/api/auth/me", { notification_prefs: prefs });
    setMe(updated);
  }

  async function updateMorning(changes: Partial<Pick<Me, "morning_summary" | "morning_time" | "morning_days">>) {
    const updated = await api.patch<Me>("/api/auth/me", changes);
    setMe(updated);
  }

  if (!me) {
    return (
      <>
        <p className="text-sm text-muted">{t("common.loading")}</p>
      </>
    );
  }

  return (
    <>
      <TabNav label={t("profile.title")} tabs={PROFILE_TABS.map((x) => ({ key: x, label: t(`profile.tab.${x}` as TranslationKey), current: tab === x, onClick: () => setTab(x) }))} />
      <PageTitle title={t("profile.title")} />
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {tab === "about" && (
        <>
      <section className="card mt-4 p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("profile.avatar")}</h2>
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 overflow-hidden rounded-full border-2 border-primary-700 bg-base">
            {avatarUrl ? (
              <img src={avatarUrl} alt={me.display_name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl font-bold text-white" style={{ background: me.color }}>
                {me.display_name.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase() ?? "").join("")}
              </div>
            )}
          </div>
          <label className={`btn-primary cursor-pointer ${uploading ? "opacity-60" : ""}`}>
            {uploading ? t("profile.uploading") : t("profile.uploadAvatar")}
            <input
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAvatar(f);
                e.target.value = "";
              }}
              disabled={uploading}
            />
          </label>
        </div>
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t("profile.avatarPresets")}</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((name) => {
              const active = me.avatar_key === `preset:${name}`;
              return (
                <button
                  key={name}
                  onClick={() => selectPreset(name)}
                  className={`h-12 w-12 overflow-hidden rounded-full border-2 transition-all ${active ? "border-primary-700 ring-2 ring-primary-700" : "border-edge hover:border-primary-500"}`}
                  title={name}
                >
                  <img src={`/avatars/avatar-${name}.svg`} alt={name} className="h-full w-full object-cover" />
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="card mt-4 p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("profile.preferences")}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">{t("profile.displayName")}</label>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div>
            <label className="label">{t("login.email")}</label>
            <input
              className="input"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label">{t("settings.language")}</label>
            <select className="input" value={locale} onChange={(e) => changeLanguage(e.target.value as Locale)}>
              {LOCALES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">{t("settings.theme")}</label>
            <div className="flex flex-wrap gap-2">
              {THEMES.map((th) => (
                <button
                  key={th.id}
                  onClick={() => changeTheme(th.id)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
                    theme === th.id ? "border-primary-700 ring-1 ring-primary-700" : "border-edge"
                  }`}
                >
                  <span className="flex overflow-hidden rounded-full border border-edge">
                    {th.swatch.map((color) => (
                      <span key={color} className="h-4 w-2.5" style={{ background: color }} />
                    ))}
                  </span>
                  {t(`theme.${th.id}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button className="btn-primary mt-4" onClick={saveProfile} disabled={saving || !displayName.trim()}>
          {saving ? t("common.loading") : t("profile.save")}
        </button>
      </section>

      <section className="card mt-4 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("profile.recentAchievements")}</h2>
          <Link href="/achievements" className="text-xs underline hover:text-ink">{t("profile.viewAllAchievements")}</Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted">{t("profile.noAchievements")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {recent.map((a) => (
              <Link key={a.id} href="/achievements" className="rounded-full border border-edge bg-base px-3 py-1 text-xs">
                {a.icon} {t(`achievements.${a.id}.name` as Parameters<typeof t>[0])}
              </Link>
            ))}
          </div>
        )}
      </section>

      {me?.apps.includes("emergency") && <MyEmergencyCard />}
      {me?.apps.includes("medicine") && me.role !== "child" && (
        <section className="card mt-4 p-5">
          <Medicine mine />
        </section>
      )}
        </>
      )}
      {tab === "menu" && (
        <>
      {me && <NavPreferences me={me} />}
        </>
      )}
      {tab === "notifications" && (
        <>
      <section className="card mt-4 p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("profile.notificationsTitle")}</h2>

        {!pushSupported ? <p className="text-sm text-muted">{t("profile.pushUnavailable")}</p> : null}
        {!(typeof window !== "undefined" && (window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1")) ? (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-semibold">{t("profile.pushNeedHttps")}</p>
            <p>{t("profile.pushNeedHttpsDetail")}</p>
          </div>
        ) : null}

        <p className="mt-2 text-xs text-muted">{t("profile.pushIosNote")}</p>

        <div className="mt-3">
          <button className="btn-primary" onClick={enablePush} disabled={!pushSupported || pushEnabled}>
            {pushEnabled ? t("profile.pushEnabled") : t("profile.pushEnable")}
          </button>
        </div>

        {me && (
          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary-700"
                checked={me.notification_prefs.chat}
                onChange={(e) => updateNotificationPrefs({ ...me.notification_prefs, chat: e.target.checked })}
              />
              {t("profile.notify.chat")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary-700"
                checked={me.notification_prefs.approvals}
                onChange={(e) => updateNotificationPrefs({ ...me.notification_prefs, approvals: e.target.checked })}
              />
              {t("profile.notify.approvals")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary-700"
                checked={me.notification_prefs.calendar_mine}
                onChange={(e) => updateNotificationPrefs({ ...me.notification_prefs, calendar_mine: e.target.checked })}
              />
              {t("profile.notify.calendarMine")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary-700"
                checked={me.notification_prefs.calendar_family}
                onChange={(e) => updateNotificationPrefs({ ...me.notification_prefs, calendar_family: e.target.checked })}
              />
              {t("profile.notify.calendarFamily")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary-700"
                checked={me.notification_prefs.memories !== false}
                onChange={(e) => updateNotificationPrefs({ ...me.notification_prefs, memories: e.target.checked })}
              />
              {t("profile.notify.memories")}
            </label>
            <div className="rounded-lg border border-edge p-3">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary-700"
                  checked={me.morning_summary}
                  onChange={(e) => updateMorning({ morning_summary: e.target.checked })}
                />
                {t("morning.toggle")}
              </label>
              <p className="ml-6 mt-0.5 text-xs text-muted">{t("morning.help")}</p>
              {me.morning_summary && (
                <div className="ml-6 mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <input
                    type="time"
                    className="input w-28"
                    value={me.morning_time}
                    onChange={(e) => e.target.value && updateMorning({ morning_time: e.target.value })}
                    aria-label={t("morning.time")}
                  />
                  <select
                    className="input w-auto"
                    value={me.morning_days}
                    onChange={(e) => updateMorning({ morning_days: e.target.value as Me["morning_days"] })}
                    aria-label={t("morning.days")}
                  >
                    <option value="weekdays">{t("morning.weekdays")}</option>
                    <option value="all">{t("morning.allDays")}</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("profile.devices")}</h3>
          {subscriptions.length === 0 ? (
            <p className="mt-1 text-sm text-muted">{t("profile.noDevices")}</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {subscriptions.map((sub) => (
                <li key={sub.id} className="flex items-center justify-between rounded border border-edge px-3 py-2 text-sm">
                  <span className="truncate">
                    {sub.endpoint === thisEndpoint && (
                      <span className="mr-2 rounded bg-accent-soft px-1.5 py-0.5 text-xs font-semibold">{t("profile.thisDevice")}</span>
                    )}
                    {sub.user_agent || sub.endpoint}
                  </span>
                  <button className="text-xs text-red-700 hover:underline" onClick={() => unsubscribeEndpoint(sub.endpoint)}>
                    {t("profile.removeDevice")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

        </>
      )}
      {tab === "security" && (
        <>
      <section className="card mt-4 p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("profile.passwordTitle")}</h2>
        <form
          className="grid gap-3 md:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            changePassword();
          }}
        >
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            placeholder={t("profile.currentPassword")}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            placeholder={t("profile.newPassword")}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            placeholder={t("profile.confirmPassword")}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <div className="md:col-span-3 flex flex-wrap items-center gap-3">
            <button
              className="btn-primary"
              type="submit"
              disabled={!currentPassword || newPassword.length < 4 || !confirmPassword}
            >
              {t("profile.changePassword")}
            </button>
            <span className="text-xs text-muted">{t("profile.passwordHint")}</span>
          </div>
        </form>
        {passwordMsg && (
          <p className={`mt-3 text-sm ${passwordMsg.ok ? "text-green-700" : "text-red-700"}`}>{passwordMsg.text}</p>
        )}
      </section>

      <SecuritySettings />

      {me && <PresenceSetting me={me} />}
      {me?.smarthome_available && me.apps.includes("health") && (
        <div className="mt-4">
          <HealthImport userId={me.id} />
        </div>
      )}
      <PhoneCalendar />
        </>
      )}
    </>
  );
}
