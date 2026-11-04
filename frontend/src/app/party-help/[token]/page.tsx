"use client";

// A helper's personal link (3.4.0): the toastmaster, without an account. It lets this browser plan this
// one party until the link ends, and shows nothing else of the family's.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TranslationKey, isLocale, useI18n } from "@/lib/i18n";
import { request } from "@/lib/api";
import { setPartyHelper } from "@/lib/partyHelper";
import { PartyView } from "@/components/parties/PartiesApp";

type Entered = { party_id: string; title: string; name: string; role: string; language: string; ends_at: string };

export default function PartyHelpPage() {
  const { token } = useParams<{ token: string }>();
  const { t, dateLocale, setLocale } = useI18n();
  const [entered, setEntered] = useState<Entered | null>(null);
  const [problem, setProblem] = useState<number | null>(null);

  useEffect(() => {
    request<Entered>(`/api/party-help/${token}/enter`, { method: "POST" })
      .then((e) => {
        setPartyHelper(true);
        try {
          if (!localStorage.getItem("sf.locale") && isLocale(e.language)) setLocale(e.language);
        } catch {}
        setEntered(e);
      })
      .catch((e) => setProblem(e?.status ?? 500));
  }, [token, setLocale]);

  if (problem) return <main className="mx-auto max-w-lg p-6 text-center text-muted">{problem === 410 ? t("helper.ended") : t("party.invalid")}</main>;
  if (!entered) return <main className="mx-auto max-w-lg p-6 text-center text-muted">{t("common.loading")}</main>;
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <p className="rounded-xl bg-accent-soft p-3 text-sm">
        {t("helper.welcome", { name: entered.name, role: t(`helper.role.${entered.role}` as TranslationKey), until: new Date(entered.ends_at).toLocaleDateString(dateLocale, { day: "numeric", month: "long" }) })}
      </p>
      <PartyView id={entered.party_id} />
    </main>
  );
}
