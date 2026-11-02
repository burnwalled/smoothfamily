"use client";

// Family admin → Home: dwelling, rooms and AI-suggested chores for them.
import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { api, HomeProfile, ImportResult, postRaw, Room } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import AiAssist from "@/components/AiAssist";
import { AiJobButton } from "@/components/LocalAi";

const ROOM_CATEGORIES = [
  "kitchen", "bathroom", "toilet", "bedroom", "living_room",
  "hallway", "laundry_room", "garage", "garden", "other",
] as const;

const DWELLINGS: { value: HomeProfile["dwelling_type"]; key: string }[] = [
  { value: "apartment", key: "home.apartment" },
  { value: "rowhouse", key: "home.rowhouse" },
  { value: "villa", key: "home.villa" },
  { value: "farm", key: "home.farm" },
];

export default function HomeSettingsPage() {
  const { t } = useI18n();
  const [profile, setProfile] = useState<HomeProfile>({ dwelling_type: "apartment", has_garden: false, notes: null });
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomName, setRoomName] = useState("");
  const [roomCategory, setRoomCategory] = useState("kitchen");
  const [chorePrompt, setChorePrompt] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.live<HomeProfile | null>("/api/home/profile", (p) => p && setProfile(p)).catch(() => {});
    api.live<Room[]>("/api/home/rooms", setRooms).catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function saveProfile() {
    setError("");
    try {
      await api.put("/api/home/profile", profile);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
      setChorePrompt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("home.profileError"));
    }
  }

  async function addRoom() {
    setError("");
    try {
      await api.post("/api/home/rooms", { name: roomName, category: roomCategory });
      setRoomName("");
      setChorePrompt("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("home.roomError"));
    }
  }

  return (
    <section className="card p-5">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("home.title")}</h2>
      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="label">{t("home.dwellingType")}</label>
          <select className="input" value={profile.dwelling_type}
            onChange={(e) => setProfile({ ...profile, dwelling_type: e.target.value as HomeProfile["dwelling_type"] })}>
            {DWELLINGS.map((d) => (
              <option key={d.value} value={d.value}>{t(d.key as Parameters<typeof t>[0])}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end pb-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={profile.has_garden}
              onChange={(e) => setProfile({ ...profile, has_garden: e.target.checked })} />
            {t("home.hasGarden")}
          </label>
        </div>
        <div className="flex items-end gap-2">
          <button className="btn-primary" onClick={saveProfile}>
            {profileSaved ? t("home.saved") : t("home.saveProfile")}
          </button>
        </div>
        <div className="md:col-span-3">
          <label className="label">{t("home.notes")}</label>
          <input className="input" value={profile.notes ?? ""} placeholder={t("home.notesPh")}
            onChange={(e) => setProfile({ ...profile, notes: e.target.value || null })} />
        </div>
      </div>

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">{t("home.rooms")}</h3>
      <ul className="mt-2 flex flex-wrap gap-2">
        {rooms.map((room) => (
          <li key={room.id} className="flex items-center gap-2 rounded-full bg-base px-3 py-1 text-xs border border-edge">
            <span className="font-semibold">{room.name}</span>
            <span className="text-muted">{t(`home.roomCategory.${room.category}` as Parameters<typeof t>[0])}</span>
            <button className="text-red-700" onClick={async () => { await api.del(`/api/home/rooms/${room.id}`); setChorePrompt(""); load(); }}>×</button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <input className="input max-w-48" placeholder={t("home.roomNamePh")} value={roomName}
          onChange={(e) => setRoomName(e.target.value)} />
        <select className="input max-w-40" value={roomCategory} onChange={(e) => setRoomCategory(e.target.value)}>
          {ROOM_CATEGORIES.map((c) => (
            <option key={c} value={c}>{t(`home.roomCategory.${c}` as Parameters<typeof t>[0])}</option>
          ))}
        </select>
        <button className="btn-primary" onClick={addRoom} disabled={!roomName.trim()}>{t("home.addRoom")}</button>
      </div>

      <div className="mt-5 rounded-lg border border-edge p-4">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {t("home.aiChores")}
        </h3>
        <p className="mt-1 text-xs text-muted">{t("home.aiChoresHelp")}</p>
        <div className="mt-3">
          <AiJobButton body={{ kind: "chores" }} label={t("home.choresLocal")} or={t("ai.orCopy")} />
        </div>
        {!chorePrompt ? (
          <button className="btn-ghost mt-3 border border-edge"
            onClick={async () => setChorePrompt((await api.get<{ prompt: string }>("/api/home/chores/prompt")).prompt)}>
            {t("home.createPrompt")}
          </button>
        ) : (
          <div className="mt-3">
            <AiAssist
              prompt={chorePrompt}
              importLabel={t("home.importChores")}
              onImport={async (raw) => {
                const result = await postRaw<ImportResult>("/api/home/chores/import", raw);
                const warnings = result.skipped.length
                  ? t("home.importWarnings", { n: result.skipped.length, warnings: result.skipped.join("; ") })
                  : "";
                return t("home.importResult", { n: result.imported }) + warnings;
              }}
            />
          </div>
        )}
      </div>
    </section>
  );
}
