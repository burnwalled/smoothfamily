"use client";

// Family settings → Sharing and connections: guest links (a babysitter, grandparents), the smart
// home, the local AI for the family and looking up barcodes. Kitchen displays have a tab of their own.
import { GuestLinks } from "@/components/safety/Emergency";
import SmartHomeSettingsPage from "../smarthome/page";
import IntegrationsSettingsPage from "../integrations/page";

export default function SharingSettingsPage() {
  return (
    <div className="space-y-4">
      <GuestLinks />
      <SmartHomeSettingsPage />
      <IntegrationsSettingsPage />
    </div>
  );
}
