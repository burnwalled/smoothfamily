"use client";

// Family settings → Security and data (the admin): how members sign in, the family's log, the
// family's data export and moving the configuration.
import SecuritySettingsPage from "../security/page";
import StorageSettingsPage from "../storage/page";
import FamilyStorage from "@/components/settings/FamilyStorage";
import BackupKey from "@/components/settings/BackupKey";

export default function SecurityDataSettingsPage() {
  return (
    <div className="space-y-4">
      <SecuritySettingsPage />
      <FamilyStorage />
      <BackupKey scope="family" />
      <StorageSettingsPage />
    </div>
  );
}
