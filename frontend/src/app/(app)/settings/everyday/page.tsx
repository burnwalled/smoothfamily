"use client";

// Family settings → Everyday: the calendars the family subscribes to, the home and its rooms, where
// Today's cards get their news (weather, electricity, waste, school lunch), the points' rules, and
// the household's own emergency card and the pets' medicines (3.0.4; a member's are on their page).
import { useMe } from "@/components/Shell";
import Emergency from "@/components/safety/Emergency";
import Medicine from "@/components/safety/Medicine";
import CalendarsSettingsPage from "../calendars/page";
import HomeSettingsPage from "../home/page";
import PointsSettingsPage from "../points/page";
import TodaySettingsPage from "../today/page";

export default function EverydaySettingsPage() {
  const me = useMe();
  return (
    <div className="space-y-4">
      <CalendarsSettingsPage />
      <HomeSettingsPage />
      <TodaySettingsPage />
      <section id="points" className="scroll-mt-20">
        <PointsSettingsPage />
      </section>
      <section id="household" className="card scroll-mt-20 p-5">
        <Emergency manage only="household" />
      </section>
      {me.apps.includes("pets") && (
        <section className="card p-5">
          <Medicine manage pets />
        </section>
      )}
    </div>
  );
}
