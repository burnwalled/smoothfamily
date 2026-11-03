// The looks a party's page can wear (3.4.0) – the invitation and, separately, the thank-you. Drawn
// with colours and emoji only, so the page stays light and works everywhere.
export type PartyTheme = { key: string; background: string; band: string; accent: string; ink: string; decor: string[] };

export const PARTY_THEMES: PartyTheme[] = [
  { key: "balloons", background: "linear-gradient(180deg,#fff1f4 0%,#fef9f0 60%,#f4f7ff 100%)", band: "linear-gradient(90deg,#e85d75,#f2b632,#3f6fb5,#7ee08a)", accent: "#e85d75", ink: "#3b2430", decor: ["🎈", "🎉", "🎈", "🎂", "🎈"] },
  { key: "jungle", background: "linear-gradient(180deg,#e9f6e3 0%,#f6fbef 70%,#eef6e5 100%)", band: "linear-gradient(90deg,#2f6b33,#7aa83f,#e8b33c)", accent: "#3f7f3a", ink: "#1f3320", decor: ["🦁", "🌴", "🐒", "🦜", "🐘"] },
  { key: "space", background: "linear-gradient(180deg,#141a3a 0%,#28306b 55%,#3d3f8f 100%)", band: "linear-gradient(90deg,#7b6cf6,#4fc3f7,#f6d55c)", accent: "#7b6cf6", ink: "#f4f5ff", decor: ["🚀", "🪐", "⭐", "👩‍🚀", "🌙"] },
  { key: "ocean", background: "linear-gradient(180deg,#e3f4fb 0%,#f2fbff 60%,#dff1f7 100%)", band: "linear-gradient(90deg,#1f7aa8,#4fc3f7,#7fd6c2)", accent: "#1f7aa8", ink: "#13324a", decor: ["🐳", "🐠", "🐚", "🌊", "🐙"] },
  { key: "fairytale", background: "linear-gradient(180deg,#f7ecfb 0%,#fdf6ff 60%,#fdeef6 100%)", band: "linear-gradient(90deg,#b39ddb,#f28fb1,#f6d55c)", accent: "#9c6ad8", ink: "#3a2647", decor: ["🦄", "🏰", "👑", "✨", "🧚"] },
  { key: "sports", background: "linear-gradient(180deg,#eaf7ec 0%,#f7fbf6 60%,#eef3fb 100%)", band: "linear-gradient(90deg,#2e8b57,#ffffff,#2e8b57)", accent: "#2e8b57", ink: "#1d2b22", decor: ["⚽", "🏆", "🏀", "🥇", "⚽"] },
  { key: "elegant", background: "linear-gradient(180deg,#f7f3ec 0%,#fbf9f5 60%,#f2ede4 100%)", band: "linear-gradient(90deg,#b08d57,#e6d3a8,#b08d57)", accent: "#8a6a3a", ink: "#2b2620", decor: ["🥂", "✨", "🕯️", "✨", "🥂"] },
  { key: "garden", background: "linear-gradient(180deg,#fdf7e8 0%,#f5faef 60%,#fdf0f3 100%)", band: "linear-gradient(90deg,#f28fb1,#f6d55c,#9cc96b)", accent: "#d9658a", ink: "#33281f", decor: ["🌸", "🌼", "🦋", "🌷", "🌻"] },
];

export function partyTheme(key: string | null | undefined): PartyTheme {
  return PARTY_THEMES.find((t) => t.key === key) ?? PARTY_THEMES[0];
}
