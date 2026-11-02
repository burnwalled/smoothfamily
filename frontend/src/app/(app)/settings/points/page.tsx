"use client";

// Family admin → Points & allowance: child approval, currency and shopping points.
import { useEffect, useState } from "react";
import { CircleCheck } from "lucide-react";
import { AllowanceSettings, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function PointsSettingsPage() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<AllowanceSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.live<AllowanceSettings>("/api/allowance/settings", setSettings).catch(() => {});
  }, []);

  async function save() {
    if (!settings) return;
    setError("");
    setSaved(false);
    try {
      setSettings(await api.patch<AllowanceSettings>("/api/allowance/settings", settings));
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  return (
    <section className="card p-5">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("settings.allowancePoints")}</h2>
      {!settings ? (
        <p className="text-xs text-muted">{t("common.loading")}</p>
      ) : (
        <>
          <label className="mb-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-primary-700"
              checked={settings.child_approval}
              onChange={(e) => setSettings({ ...settings, child_approval: e.target.checked })}
            />
            <span>
              {t("settings.childApproval")}
              <span className="block text-xs text-muted">{t("settings.childApprovalHint")}</span>
            </span>
          </label>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="label">{t("settings.currency")}</label>
              <input className="input" value={settings.currency} onChange={(e) => setSettings({ ...settings, currency: e.target.value })} />
            </div>
            <div>
              <label className="label">{t("settings.shoppingTaskPoints")}</label>
              <input
                className="input"
                type="number"
                min={0}
                max={1000}
                value={settings.shopping_task_points}
                onChange={(e) => setSettings({ ...settings, shopping_task_points: Number(e.target.value) })}
              />
            </div>
            <div className="flex items-end">
              <button className="btn-primary" onClick={save}>{t("profile.save")}</button>
            </div>
          </div>
          {saved && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-green-700">
              <CircleCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
              {t("home.saved")}
            </p>
          )}
          {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        </>
      )}
    </section>
  );
}
