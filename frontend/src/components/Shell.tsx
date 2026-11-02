"use client";

// App shell: sidebar on desktop; on phones a bottom bar. Each member chooses whether the menu is
// grouped (Family, Points, Home): grouped on phones, each group opens a sheet of its apps;
// otherwise the first sections are in the bar and "More" opens a sheet with the rest.
import OfflineIndicator from "@/components/OfflineIndicator";
import TabNav from "@/components/TabNav";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Lock, MoreHorizontal, ShieldCheck } from "lucide-react";
import { api, ApiError, clearApiCache, ChatConversation, LevelInfo, Me, TasksAttention } from "@/lib/api";
import { useApi } from "@/lib/query";
import DemoBanner from "@/components/DemoBanner";
import { apiKey } from "@/lib/queryClient";
import { startLiveUpdates, useLiveConnected } from "@/lib/live";
import { isLocale, useI18n } from "@/lib/i18n";
import { isTheme, useTheme } from "@/lib/theme";
import { appForPath, groupNav, hubForPath, hubTabs, MOBILE_PRIMARY, NAV_CHANGED_EVENT, NavGroupKey, NavItem, NavPrefs, visibleNav } from "@/lib/nav";
import { LATEST_VERSION, seenVersion } from "@/lib/releaseNotes";
import EasyHome from "@/components/easy/EasyHome";
import { EasyBackend, EasyDay } from "@/lib/easy";

const EASY_OPEN = "sf.easy.open";

// Badges follow live updates; polling is only the fallback (faster while the stream is down).
const BADGE_REFRESH_MS = 15_000;
const BADGE_REFRESH_LIVE_MS = 120_000;

const MeContext = createContext<{ me: Me; setMe: (me: Me) => void } | null>(null);

function useMeContext() {
  const ctx = useContext(MeContext);
  if (!ctx) throw new Error("useMe() outside the Shell");
  return ctx;
}

// The signed-in user, loaded once by the Shell. Pages only render once it is known.
export function useMe(): Me {
  return useMeContext().me;
}

/** The signed-in user where there is one – null on a page without an account (the kitchen display). */
export function useMaybeMe(): Me | null {
  return useContext(MeContext)?.me ?? null;
}

// Pages that change the profile hand the saved user back so the frame updates at once.
export function useSetMe(): (me: Me) => void {
  return useMeContext().setMe;
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  // Cached answers render the frame at once; fresh ones follow in the background.
  const meQuery = useApi<Me>("/api/auth/me", { retry: false });
  const me = meQuery.data ?? null;
  // Which device this is and the app version it runs (3.1.0), for the family's overview of devices.
  const meId = me?.id;
  useEffect(() => {
    if (!meId) return;
    const hello = () => {
      const installed = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
      api.post("/api/devices/hello", { version: LATEST_VERSION, installed }).catch(() => {});
    };
    hello();
    const id = window.setInterval(hello, 30 * 60_000);
    return () => window.clearInterval(id);
  }, [meId]);
  const live = useLiveConnected();
  const badgeRefresh = live ? BADGE_REFRESH_LIVE_MS : BADGE_REFRESH_MS;
  const unreadNotifications =
    useApi<{ unread: number }>(me ? "/api/notifications/unread" : null, { refetchInterval: badgeRefresh }).data?.unread ?? 0;
  // Apps the family admin lets this member use; the others never load or show.
  const apps = me?.apps ?? [];
  const level = useApi<{ level: LevelInfo }>(apps.includes("achievements") ? "/api/achievements" : null).data?.level ?? null;
  const conversations = useApi<ChatConversation[]>(apps.includes("chat") ? "/api/chat/conversations" : null, {
    refetchInterval: badgeRefresh,
  }).data;
  const chatUnread = (conversations ?? []).reduce((sum, row) => sum + row.unread_count, 0);
  // Adults: completed tasks to approve plus task suggestions (badge on Tasks).
  const attention = useApi<TasksAttention>(
    me && me.role !== "child" && apps.includes("tasks") ? "/api/tasks/attention" : null,
    { refetchInterval: badgeRefresh }
  ).data;
  const pendingApprovals = attention ? attention.approvals + attention.suggestions : 0;
  // Adults: shop purchases waiting for approval (badge on the shop).
  const shopPending =
    useApi<{ pending: number }>(me && me.role !== "child" && apps.includes("shop") ? "/api/shop/attention" : null, {
      refetchInterval: badgeRefresh,
    }).data?.pending ?? 0;
  const [menuOpen, setMenuOpen] = useState(false);
  // Phones: the sheet above the bottom bar – a group's apps, or "more" (ungrouped menu).
  const [openGroup, setOpenGroup] = useState<NavGroupKey | "more" | null>(null);
  // A dot on the avatar and the menu item until this device has opened "What's new".
  const [hasNews, setHasNews] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // The little ones' mode: a grown-up who answered the sum sees the app until the tab is closed.
  const [easyOpen, setEasyOpen] = useState(false);
  useEffect(() => {
    try {
      setEasyOpen(sessionStorage.getItem(EASY_OPEN) === "1");
    } catch {}
  }, []);
  const easyBackend = useMemo<EasyBackend>(
    () => ({
      load: () => api.get<EasyDay>("/api/easy/today"),
      step: (id, undo) => (undo ? (api.del(`/api/easy/steps/${id}/done`) as unknown as Promise<EasyDay>) : api.post<EasyDay>(`/api/easy/steps/${id}/done`)),
      task: (id) => api.post<EasyDay>(`/api/easy/tasks/${id}/done`),
      stickers: () => api.get<string[]>("/api/easy/stickers"),
    }),
    [],
  );
  const signedOut = useRef(false);
  const setMe = useCallback((user: Me) => queryClient.setQueryData(apiKey("/api/auth/me"), user), [queryClient]);
  const meContext = useMemo(() => (me ? { me, setMe } : null), [me, setMe]);
  const { t, setLocale } = useI18n();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (me && isLocale(me.language)) setLocale(me.language);
    if (me && isTheme(me.theme)) setTheme(me.theme);
  }, [me?.language, me?.theme, setLocale, setTheme]); // eslint-disable-line react-hooks/exhaustive-deps

  // One live stream while signed in.
  const signedIn = me !== null;
  useEffect(() => (signedIn ? startLiveUpdates() : undefined), [signedIn]);

  // Signed out (or the session expired): drop everything cached and go to the login page. Other
  // errors (offline, server restarting) keep showing the cached frame.
  useEffect(() => {
    if ((meQuery.error as ApiError | null)?.status !== 401 || signedOut.current) return;
    signedOut.current = true;
    clearApiCache();
    router.replace("/login");
  }, [meQuery.error, router]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // The profile page saves the menu; pick up the new order right away.
  useEffect(() => {
    const onNav = (e: Event) => {
      const prefs = (e as CustomEvent<Partial<NavPrefs>>).detail;
      queryClient.setQueryData<Me>(apiKey("/api/auth/me"), (prev) => (prev ? { ...prev, ...prefs } : prev));
    };
    window.addEventListener(NAV_CHANGED_EVENT, onNav);
    return () => window.removeEventListener(NAV_CHANGED_EVENT, onNav);
  }, [queryClient]);

  useEffect(() => {
    const check = () => setHasNews(seenVersion() !== LATEST_VERSION);
    check();
    window.addEventListener("sf:whats-new-seen", check);
    return () => window.removeEventListener("sf:whats-new-seen", check);
  }, []);

  const custody = useApi<unknown[]>(me && apps.includes("calendar") ? "/api/custody" : null).data;

  // The setup guides (2.9.0): a new server's admin and a new family's admin start there once.
  const pendingGuides = useApi<{ pending: string[] }>(me && (me.is_server_admin || me.role === "admin") ? "/api/guide" : null).data?.pending ?? [];
  const guideDue = pendingGuides.length > 0 && !pathname.startsWith("/welcome");
  useEffect(() => {
    if (guideDue) router.replace("/welcome");
  }, [guideDue, router]);

  // Close the group sheet on navigation and with Escape.
  useEffect(() => setOpenGroup(null), [pathname]);
  useEffect(() => {
    if (!openGroup) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenGroup(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openGroup]);

  if (!me) {
    return <div className="min-h-screen grid place-items-center text-muted">{t("common.loading")}</div>;
  }

  if (me.easy_mode && !easyOpen) {
    return (
      <MeContext.Provider value={meContext}>
        <EasyHome
          backend={easyBackend}
          onGrownUp={() => {
            try {
              sessionStorage.setItem(EASY_OPEN, "1");
            } catch {}
            setEasyOpen(true);
          }}
        />
      </MeContext.Provider>
    );
  }

  async function logout() {
    await api.post("/api/auth/logout");
    router.replace("/login");
  }

  const nav = visibleNav(me.nav_order, me.nav_hidden, apps);
  const today = nav.find((item) => item.key === "today")!;
  const groups = groupNav(nav);
  // Members choose whether the menu is grouped: by default on computers, not on phones.
  const groupDesktop = me.nav_group_desktop !== false && groups.length > 0;
  const groupMobile = me.nav_group_mobile === true && groups.length > 0;
  // The app (hub) this page is part of: marked in the menu, and its other pages as tabs.
  const hub = hubForPath(pathname);
  const isActive = (item: NavItem) => pathname === item.href || (hub !== null && hub.key === item.key);
  // Two homes only shows in the calendar once a schedule is set up (family settings → Children).
  const tabs = hub ? hubTabs(hub, apps).filter((tab) => !tab.hidden && (tab.href !== "/calendar/custody" || (custody?.length ?? 0) > 0)) : [];
  const more = nav.slice(MOBILE_PRIMARY);
  const sheet =
    openGroup === "more"
      ? { labelKey: "nav.more" as const, items: more }
      : groups.find((g) => g.key === openGroup) ?? null;
  const badge = (href: string) =>
    href === "/chat" ? chatUnread : href === "/tasks" ? pendingApprovals : href === "/shop" ? shopPending : 0;
  const groupBadge = (items: NavItem[]) => items.reduce((sum, item) => sum + badge(item.href), 0);
  const app = appForPath(pathname);
  const blocked = app !== null && !apps.includes(app);

  const sideLink = (item: NavItem) => (
    <Link
      key={item.href}
      href={item.href}
      aria-current={isActive(item) ? "page" : undefined}
      className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium ${
        isActive(item) ? "bg-primary-700 text-white" : "hover:bg-primary-800"
      }`}
    >
      <item.icon className="mr-2.5 h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
      {t(item.labelKey)}
      {badge(item.href) > 0 ? (
        <span className="ml-2 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">{badge(item.href)}</span>
      ) : null}
    </Link>
  );

  const barClass = (active: boolean) =>
    `relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-xs ${
      active ? "font-bold text-accent" : "text-primary-100/75"
    }`;
  const barBadge = (n: number) =>
    n > 0 ? (
      <span className="absolute left-1/2 top-1.5 ml-2 rounded-full bg-accent px-1.5 text-[10px] font-bold leading-4 text-white">{n}</span>
    ) : null;

  const initials = me.display_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]" data-live={live ? "on" : "off"}>
      <aside className="hidden md:flex flex-col bg-primary-900 text-primary-100 p-5">
        <div className="mb-8">
          <div className="flex items-center gap-2">
            <img src="/logo-mark-on-dark.svg" alt="" className="h-8 w-8" />
            <span className="text-lg font-extrabold tracking-tight text-white">Smooth Family</span>
          </div>
          <div className="mt-1 text-xs text-primary-100/70">{me.family_name}</div>
        </div>
        <nav className="flex flex-col gap-1">
          {groupDesktop ? (
            <>
              {sideLink(today)}
              {groups.map((group) => (
                <div key={group.key} className="mt-4 flex flex-col gap-1">
                  <p className="px-3 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary-100/60">{t(group.labelKey)}</p>
                  {group.items.map(sideLink)}
                </div>
              ))}
            </>
          ) : (
            nav.map(sideLink)
          )}
        </nav>
        <div className="mt-auto space-y-3">
          {level !== null && (
            <div className="rounded-lg bg-primary-800 px-3 py-2">
              <div className="flex justify-between text-[11px] text-primary-100/80 mb-1">
                <span>{t("achievements.level", { n: level.level })}</span>
                <span>{level.points_in_level} / {level.points_to_next}</span>
              </div>
              <div className="h-1.5 rounded-full bg-primary-700 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, Math.round((level.points_in_level / level.points_to_next) * 100))}%`,
                    backgroundColor: "#E0B33D",
                  }}
                />
              </div>
            </div>
          )}
          <div className="rounded-lg bg-primary-800 px-3 py-2 text-[11px] leading-snug text-primary-100/80">
            <ShieldCheck className="mr-1 inline h-3.5 w-3.5 align-[-2px]" strokeWidth={2} aria-hidden />
            {me.family_kind !== "owner" && me.host_family_name ? t("shell.hosted1", { family: me.host_family_name }) : t("shell.local1")}
            <br />
            {me.family_kind !== "owner" && me.host_family_name ? t("shell.hosted2") : t("shell.local2")}
          </div>
        </div>
      </aside>

      <div className="pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
        {me.family_kind === "demo" && <DemoBanner me={me} />}
        {/* Phones: a header band in the theme colour (desktop shows it in the sidebar). */}
        <header className="flex items-center justify-between bg-primary-800 px-4 py-3 text-primary-100 md:mx-auto md:max-w-4xl md:bg-transparent md:px-8 md:pb-0 md:pt-6 md:text-ink">
          <p className="flex items-center gap-2 text-sm font-semibold md:text-xs md:font-normal md:text-muted">
            <img src="/logo-mark-on-dark.svg" alt="" className="h-6 w-6 md:hidden" />
            {/* Desktop shows the family's name in the sidebar already. */}
            <span className="md:hidden">{me.family_name}</span>
          </p>
          <div className="flex items-center gap-2">
          <OfflineIndicator />
          <Link
            href="/notifications"
            className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-primary-700 md:hover:bg-base"
            aria-label={unreadNotifications > 0 ? t("notifications.bellUnread", { n: unreadNotifications }) : t("notifications.title")}
          >
            <Bell className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            {unreadNotifications > 0 && (
              <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-accent px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
              </span>
            )}
          </Link>
          <div className="relative" ref={menuRef}>
            <button
              className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-edge text-sm font-bold"
              style={{ background: me.avatar_key ? undefined : me.color, color: me.avatar_key ? undefined : "#fff" }}
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              {me.avatar_key ? (
                <img
                  src={me.avatar_key.startsWith("preset:")
                    ? `/avatars/avatar-${me.avatar_key.slice(7)}.svg`
                    : `/api/auth/me/avatar?v=${encodeURIComponent(me.avatar_key)}`}
                  alt={me.display_name}
                  className="h-full w-full object-cover"
                />
              ) : (
                initials
              )}
            </button>
            {hasNews && (
              <span className="pointer-events-none absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-surface bg-accent" aria-hidden />
            )}
            {menuOpen && (
              <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-edge bg-surface p-2 text-ink shadow-soft" role="menu">
                <Link className="block rounded px-3 py-3 text-sm hover:bg-base md:py-2" href="/profile" onClick={() => setMenuOpen(false)}>
                  {t("shell.profile")}
                </Link>
                {(me.role === "admin" || me.can_manage_family) && (
                  <Link className="block rounded px-3 py-3 text-sm hover:bg-base md:py-2" href="/settings" onClick={() => setMenuOpen(false)}>
                    {t("shell.familyAdmin")}
                  </Link>
                )}
                {me.is_server_admin && (
                  <Link className="block rounded px-3 py-3 text-sm hover:bg-base md:py-2" href="/server" onClick={() => setMenuOpen(false)}>
                    {t("server.title")}
                  </Link>
                )}
                <Link className="block rounded px-3 py-3 text-sm hover:bg-base md:py-2" href="/help" onClick={() => setMenuOpen(false)}>
                  {t("shell.help")}
                </Link>
                <Link className="flex items-center justify-between rounded px-3 py-3 text-sm hover:bg-base md:py-2" href="/news" onClick={() => setMenuOpen(false)}>
                  {t("shell.whatsNew")}
                  {hasNews && <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-label={t("news.new")} />}
                </Link>
                <Link className="block rounded px-3 py-3 text-sm hover:bg-base md:py-2" href="/feedback" onClick={() => setMenuOpen(false)}>
                  {t("shell.feedback")}
                </Link>
                <button
                  onClick={logout}
                  className="block w-full rounded px-3 py-3 text-left text-sm text-red-700 hover:bg-base md:py-2"
                  role="menuitem"
                >
                  {t("shell.logOut")}
                </button>
              </div>
            )}
          </div>
          </div>
        </header>
        <main className="mx-auto max-w-4xl p-4 md:p-8">
          {blocked ? (
            <div className="card mx-auto mt-8 max-w-md p-6 text-center">
              <Lock className="mx-auto h-8 w-8 text-muted" strokeWidth={1.75} aria-hidden />
              <h1 className="mt-3 text-lg font-bold">{t("shell.appBlockedTitle")}</h1>
              <p className="mt-1 text-sm text-muted">{t("shell.appBlockedText")}</p>
              <Link href="/" className="btn-primary mt-4 inline-flex">{t("nav.today")}</Link>
            </div>
          ) : (
            <MeContext.Provider value={meContext}>
              {tabs.length > 1 && (
                <TabNav
                  label={t(hub!.labelKey)}
                  tabs={tabs.map((tab) => ({
                    key: tab.href,
                    href: tab.href,
                    label: t(tab.labelKey),
                    current: pathname === tab.href || (pathname.startsWith(`${tab.href}/`) && !tabs.some((o) => o.href.length > tab.href.length && pathname.startsWith(o.href))),
                  }))}
                />
              )}
              {children}
            </MeContext.Provider>
          )}
        </main>
      </div>

      {sheet && (
        <div className="fixed inset-0 z-30 md:hidden" role="dialog" aria-modal="true" aria-label={t(sheet.labelKey)}>
          <button className="absolute inset-0 bg-black/50" onClick={() => setOpenGroup(null)} aria-label={t("common.close")} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-edge bg-surface px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-soft">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-edge" aria-hidden />
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-muted">{t(sheet.labelKey)}</p>
            <div className="grid grid-cols-3 gap-3">
              {sheet.items.map((item) => {
                const active = isActive(item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-sm ${
                      active ? "border-accent bg-accent-soft font-bold text-ink" : "border-edge bg-base text-ink"
                    }`}
                  >
                    <item.icon className="h-6 w-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                    {t(item.labelKey)}
                    {badge(item.href) > 0 && (
                      <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold leading-4 text-white">{badge(item.href)}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Phones, grouped: Today plus one button per group (a group with a single app links straight
          to it). Not grouped: the first sections in the member's order, the rest under "More". */}
      <nav data-mobile-nav className="fixed inset-x-0 bottom-0 z-20 flex bg-primary-900 pb-[env(safe-area-inset-bottom)] text-primary-100 md:hidden">
        {!groupMobile && (
          <>
            {nav.slice(0, MOBILE_PRIMARY).map((item) => {
              const active = isActive(item);
              return (
                <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={barClass(active)}>
                  <item.icon className="h-6 w-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                  {t(item.labelKey)}
                  {barBadge(badge(item.href))}
                </Link>
              );
            })}
            {more.length > 0 && (
              <button
                className={barClass(openGroup === "more" || more.some(isActive))}
                onClick={() => setOpenGroup((g) => (g === "more" ? null : "more"))}
                aria-expanded={openGroup === "more"}
                aria-haspopup="dialog"
              >
                <MoreHorizontal className="h-6 w-6" strokeWidth={1.75} aria-hidden />
                {t("nav.more")}
                {groupBadge(more) > 0 && <span className="absolute left-1/2 top-2 ml-2 h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />}
              </button>
            )}
          </>
        )}
        {groupMobile && (
        <>
        <Link href="/" className={barClass(pathname === "/")}>
          <today.icon className="h-6 w-6" strokeWidth={pathname === "/" ? 2.25 : 1.75} aria-hidden />
          {t(today.labelKey)}
        </Link>
        {groups.map((group) => {
          const active = openGroup === group.key || group.items.some((item) => item.href === pathname);
          if (group.items.length === 1) {
            const only = group.items[0];
            return (
              <Link key={group.key} href={only.href} className={barClass(active)}>
                <only.icon className="h-6 w-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                {t(only.labelKey)}
                {barBadge(badge(only.href))}
              </Link>
            );
          }
          return (
            <button
              key={group.key}
              className={barClass(active)}
              onClick={() => setOpenGroup((g) => (g === group.key ? null : group.key))}
              aria-expanded={openGroup === group.key}
              aria-haspopup="dialog"
            >
              <group.icon className="h-6 w-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
              {t(group.labelKey)}
              {barBadge(groupBadge(group.items))}
            </button>
          );
        })}
        </>
        )}
      </nav>
    </div>
  );
}
