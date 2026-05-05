import { getTranslations } from "next-intl/server";

export default async function DashboardPage() {
  const t = await getTranslations();

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">{t("dashboard.title")}</h1>
      <p className="text-muted-foreground">{t("dashboard.subtitle")}</p>
    </div>
  );
}
