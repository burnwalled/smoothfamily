"use client";

// Family settings → Connections: the smart home, the local AI for the family and looking up barcodes.
// Guest links are under Family members (3.4.0); kitchen displays have a tab of their own.
import SmartHomeSettingsPage from "../smarthome/page";
import IntegrationsSettingsPage from "../integrations/page";

export default function SharingSettingsPage() {
  return (
    <div className="space-y-4">
      <SmartHomeSettingsPage />
      <IntegrationsSettingsPage />
    </div>
  );
}
