"use client";

// One emergency card, read-only: shown in the app and on a babysitter's guest link.
import { HeartPulse, House, Phone, Pill, ShieldAlert } from "lucide-react";
import { EmergencyCard } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

function Row({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="whitespace-pre-line text-sm">{value}</dd>
    </div>
  );
}

export function ContactList({ card }: { card: EmergencyCard }) {
  if (!card.contacts.length) return null;
  return (
    <ul className="space-y-1">
      {card.contacts.map((c, i) => (
        <li key={`${c.phone}-${i}`} className="flex flex-wrap items-center gap-x-2 text-sm">
          <Phone className="h-3.5 w-3.5 text-accent" strokeWidth={2} aria-hidden />
          <span className="font-semibold">{c.name}</span>
          {c.relation && <span className="text-muted">({c.relation})</span>}
          <a className="font-mono text-accent hover:underline" href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>{c.phone}</a>
        </li>
      ))}
    </ul>
  );
}

export function isEmpty(card: EmergencyCard): boolean {
  return ![card.allergies, card.medicines, card.health_centre, card.insurance, card.routines, card.notes, card.address].some((v) => v.trim()) && !card.contacts.length && !card.app_medicines.length;
}

export default function EmergencyCardView({ card }: { card: EmergencyCard }) {
  const { t } = useI18n();
  const household = card.user_id === null;
  const medicines = [card.medicines, ...card.app_medicines].filter((v) => v.trim()).join("\n");
  return (
    <div className="space-y-3">
      {household && card.address.trim() && (
        <p className="flex items-start gap-2 text-sm font-semibold">
          <House className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={2} aria-hidden />
          <span className="whitespace-pre-line">{card.address}</span>
        </p>
      )}
      {card.allergies.trim() && (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 p-2 text-sm text-red-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          <span>
            <span className="font-bold">{t("emergency.allergies")}:</span> <span className="whitespace-pre-line">{card.allergies}</span>
          </span>
        </p>
      )}
      {medicines && (
        <p className="flex items-start gap-2 text-sm">
          <Pill className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={2} aria-hidden />
          <span className="whitespace-pre-line">{medicines}</span>
        </p>
      )}
      <dl className="grid gap-2 sm:grid-cols-2">
        <Row label={t("emergency.healthCentre")} value={card.health_centre} />
        <Row label={t("emergency.insurance")} value={card.insurance} />
      </dl>
      <ContactList card={card} />
      <dl className="space-y-2">
        <Row label={t("emergency.routines")} value={card.routines} />
        <Row label={t("emergency.notes")} value={card.notes} />
      </dl>
      {isEmpty(card) && (
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <HeartPulse className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t("emergency.emptyCard")}
        </p>
      )}
    </div>
  );
}
