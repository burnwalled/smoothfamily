import { getTranslations } from "next-intl/server";

import OpenListsWidget from "@/components/widgets/OpenListsWidget";
import PendingMembersWidget from "@/components/widgets/PendingMembersWidget";
import UnreadChatWidget from "@/components/widgets/UnreadChatWidget";
import UpcomingEventsWidget from "@/components/widgets/UpcomingEventsWidget";

export default async function DashboardPage() {
  const t = await getTranslations();

  return (
    <div className="space-y-4 lg:space-y-5">
      <section className="portal-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("dashboard.greetingTitle")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("dashboard.greetingSubtitle")}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:opacity-90"
            style={{
              borderColor: "rgb(var(--color-border))",
              backgroundColor: "rgb(var(--color-surface))",
            }}
          >
            {t("dashboard.addWidget")}
          </button>
        </div>
      </section>

      <section className="portal-card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t("dashboard.todayLabel")}
          </div>
          <div className="text-xs text-muted-foreground">11:42</div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <div
            className="rounded-md border p-3"
            style={{
              borderColor: "rgb(var(--color-border))",
              backgroundColor: "rgb(var(--color-background))",
            }}
          >
            <p className="text-sm font-medium">Mote</p>
            <p className="text-xs text-muted-foreground">09:00</p>
          </div>
          <div
            className="rounded-md border p-3"
            style={{
              borderColor: "rgb(var(--color-border))",
              backgroundColor: "rgb(var(--color-background))",
            }}
          >
            <p className="text-sm font-medium">Tandlakare</p>
            <p className="text-xs text-muted-foreground">10:00</p>
          </div>
          <div
            className="rounded-md border p-3"
            style={{
              borderColor: "rgb(var(--color-border))",
              backgroundColor: "rgb(var(--color-background))",
            }}
          >
            <p className="text-sm font-medium">Fotboll</p>
            <p className="text-xs text-muted-foreground">15:30 · Oskar</p>
          </div>
          <div
            className="rounded-md border p-3"
            style={{
              borderColor: "rgb(var(--color-border))",
              backgroundColor: "rgb(var(--color-background))",
            }}
          >
            <p className="text-sm font-medium">Piano</p>
            <p className="text-xs text-muted-foreground">17:00 · Lova</p>
          </div>
          <div
            className="rounded-md border p-3"
            style={{
              borderColor: "rgb(var(--color-border))",
              backgroundColor: "rgb(var(--color-background))",
            }}
          >
            <p className="text-sm font-medium">Padel</p>
            <p className="text-xs text-muted-foreground">19:00 · Erik</p>
          </div>
        </div>
      </section>

      <UpcomingEventsWidget />

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="portal-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">
              {t("dashboard.choresTitle")}
            </h2>
            <span
              className="rounded-full px-2 py-1 text-xs"
              style={{
                backgroundColor: "rgb(var(--color-accent) / 0.15)",
                color: "rgb(var(--color-accent))",
              }}
            >
              {t("dashboard.choresProgress")}
            </span>
          </div>
          <ul className="space-y-2 text-sm">
            <li
              className="rounded-md border px-3 py-2"
              style={{ borderColor: "rgb(var(--color-border))" }}
            >
              Sopor ut
            </li>
            <li
              className="rounded-md border px-3 py-2"
              style={{ borderColor: "rgb(var(--color-border))" }}
            >
              Vattna blommorna
            </li>
            <li
              className="rounded-md border px-3 py-2"
              style={{ borderColor: "rgb(var(--color-border))" }}
            >
              Stada toaletten
            </li>
            <li
              className="rounded-md border px-3 py-2"
              style={{ borderColor: "rgb(var(--color-border))" }}
            >
              Ga ut med hunden
            </li>
          </ul>
        </article>

        <UnreadChatWidget />

        <OpenListsWidget />

        <PendingMembersWidget />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article className="portal-card">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
            {t("dashboard.shoppingTitle")}
          </p>
          <p className="mt-2 text-3xl font-semibold">8</p>
          <p className="text-sm text-muted-foreground">
            {t("dashboard.shoppingRemaining")}
          </p>
        </article>
        <article className="portal-card">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
            {t("dashboard.dinnerTitle")}
          </p>
          <p className="mt-2 text-lg font-semibold">Lax i ugn med potatis</p>
          <p className="text-sm text-muted-foreground">
            {t("dashboard.dinnerSuggestion")}
          </p>
        </article>
        <article className="portal-card">
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
            {t("dashboard.pointsTitle")}
          </p>
          <div className="mt-2 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span>Oskar</span>
              <span className="font-semibold">42p</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Lova</span>
              <span className="font-semibold">38p</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Saga</span>
              <span>15p</span>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
