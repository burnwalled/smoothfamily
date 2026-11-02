"use client";

// Family settings → the local AI for the family and looking up barcodes (the server's own services
// are under Server → Services).
import { useI18n } from "@/lib/i18n";
import { FamilyAiSetting } from "@/components/LocalAi";
import { BarcodeLookupSetting } from "@/components/BarcodeScan";

export default function IntegrationsSettingsPage() {
  const { t } = useI18n();
  return (
    <section className="card p-5">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("settings.integrations")}</h2>
      <FamilyAiSetting />
      <BarcodeLookupSetting />
    </section>
  );
}
