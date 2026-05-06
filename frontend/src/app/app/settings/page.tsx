import { getTranslations } from "next-intl/server";

export default async function SettingsPage() {
  const t = await getTranslations();

  return (
    <div className="space-y-4">
      <section className="portal-card">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("settings.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("common.underConstruction")}
        </p>
      </section>

      <section className="portal-card">
        <h2 className="text-base font-semibold">
          {t("settings.comingSoonTitle")}
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li>{t("settings.comingSoonItem1")}</li>
          <li>{t("settings.comingSoonItem2")}</li>
          <li>{t("settings.comingSoonItem3")}</li>
        </ul>
      </section>
    </div>
  );
}
