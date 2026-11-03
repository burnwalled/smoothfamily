import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";
import { test, STATE } from "../fixtures";
import en from "../../frontend/src/locales/en";
import sv from "../../frontend/src/locales/sv";
import nb from "../../frontend/src/locales/nb";
import da from "../../frontend/src/locales/da";
import fi from "../../frontend/src/locales/fi";

// The help centre's screenshots (3.0.2), taken from a demo family in each language on a phone.
// Only with HELP_SHOTS=<folder> – scripts/help-shots.sh runs it and turns them into webp.
const OUT = process.env.HELP_SHOTS;
// HELP_ONLY=parties,partyinvite takes just those pictures (the rest stay as they are).
const ONLY = process.env.HELP_ONLY ? new Set(process.env.HELP_ONLY.split(",")) : null;
const LANGS = { en, sv, nb, da, fi } as const;
type Lang = keyof typeof LANGS;
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true };
const HOUSE: Record<Lang, string> = { en: "Our house", sv: "Villan", nb: "Huset", da: "Huset", fi: "Talo" };
const CABIN: Record<Lang, string> = { en: "The cabin", sv: "Stugan", nb: "Hytta", da: "Sommerhuset", fi: "Mökki" };
const PARTY: Record<Lang, [string, string, string]> = {
  en: ["Maja's 9th birthday", "Treasure hunt in the jungle", "Maja turns 9! We'll hunt for treasure and eat cake – come dressed as a jungle animal."],
  sv: ["Majas 9-årskalas", "Skattjakt i djungeln", "Maja fyller 9! Vi letar skatter och äter tårta – kom gärna utklädd till ett djungeldjur."],
  nb: ["Majas 9-årsdag", "Skattejakt i jungelen", "Maja fyller 9! Vi leter etter skatter og spiser kake – kom gjerne utkledd som et jungeldyr."],
  da: ["Majas 9-års fødselsdag", "Skattejagt i junglen", "Maja fylder 9! Vi leder efter skatte og spiser kage – kom gerne udklædt som et jungledyr."],
  fi: ["Majan 9-vuotisjuhlat", "Aarteenetsintä viidakossa", "Maja täyttää 9! Etsimme aarteita ja syömme kakkua – tule pukeutuneena viidakkoeläimeksi."],
};
const GUESTS: [string, string][] = [["Saga", "Berg"], ["Nils", "Ek"], ["Alva", "Lind"]];

test.skip(!OUT, "screenshots for the help centre only with HELP_SHOTS");
test.describe.configure({ mode: "serial" });

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function shot(page: Page, lang: Lang, name: string, path: string, before?: (page: Page) => Promise<unknown>) {
  if (ONLY && !ONLY.has(name)) return;
  await page.goto(path);
  await page.waitForLoadState("networkidle").catch(() => {});
  // The demo's banner (who you're shown as, start over) isn't part of the page being explained.
  await page.addStyleTag({ content: "[data-demo-banner]{display:none!important}" });
  if (before) await before(page);
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT!, lang, `${name}.png`) });
}

/** Scrolls so a section starts near the top (below the header). */
async function toTop(locator: import("@playwright/test").Locator) {
  await locator.evaluate((el) => {
    el.scrollIntoView({ block: "start" });
    window.scrollBy(0, -110);
  });
}

/** What the demo family doesn't have: a home, a car, the pantry, the economy, receipts, two homes … */
async function seed(api: APIRequestContext, lang: Lang, page: Page) {
  const members = await (await api.get("/api/family/members")).json();
  const child = members.find((m: { role: string }) => m.role === "child");
  const home = await (await api.post("/api/property/properties", { data: { name: HOUSE[lang], dwelling: "villa", built_year: 1978, area_m2: 142 } })).json();
  await api.post("/api/vehicles", { data: { name: "Volvo XC60", kind: "car", registration: "ABC 123", make: "Volvo", model: "XC60", year: 2019, mileage: 84200 } });
  for (const [place, name, amount, unit, days] of [["fridge", "Milk", 1, "l", 2], ["fridge", "Yoghurt", 2, "", 1], ["freezer", "Salmon", 4, "", 40], ["pantry", "Pasta", 3, "", 200]] as const) {
    await api.post("/api/pantry", { data: { place, name, amount, unit, best_before: day(days) } });
  }
  for (const [kind, category, amount] of [["in", "salary", 38000], ["out", "food", 6400], ["out", "housing", 9200], ["out", "transport", 2100], ["out", "children", 1800], ["out", "leisure", 1500]] as const) {
    await api.post("/api/economy/entries", { data: { kind, category, amount, day: day(-3) } });
  }
  await api.post("/api/receipts", { data: { store: "Elgiganten", amount: 4990, purchased_on: day(-10), category: "home", property_id: home.id, warranty_until: day(720), return_until: day(20) } });
  await api.post("/api/receipts", { data: { store: "Stadium", amount: 899, purchased_on: day(-4), category: "children", return_until: day(26) } });
  if (child) await api.put(`/api/custody/${child.id}`, { data: { other_home: "Pappa", pattern: "week", anchor_date: day(-2) } });
  await api.post("/api/vault/logins", { data: { title: "Netflix", url: "https://netflix.com", username: "family@example.com", password: "Correct-Horse-Battery-9" } });
  await api.post("/api/vault/logins", { data: { title: "Wi-Fi", username: "Home", password: "blue-meadow-42" } });
  // A few pictures for the vault – drawn here, nothing downloaded.
  const album = await (await api.post("/api/albums", { data: { name: "2026" } })).json();
  for (const [a, b, emoji] of [["#f6d365", "#fda085", "🏖️"], ["#a1c4fd", "#c2e9fb", "⛷️"], ["#d4fc79", "#96e6a1", "🌳"], ["#fbc2eb", "#a6c1ee", "🎂"]]) {
    await page.setContent(`<body style="margin:0;width:600px;height:450px;background:linear-gradient(135deg,${a},${b});display:grid;place-items:center;font-size:160px">${emoji}</body>`);
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: 600, height: 450 } });
    await api.post(`/api/albums/${album.id}/media`, { multipart: { file: { name: `${emoji.codePointAt(0)}.png`, mimeType: "image/png", buffer: png } } });
  }
  // A child's party, with replies, the day's plan, the portal and a photo from a guest.
  const [title, theme, text] = PARTY[lang];
  const start = new Date(Date.now() + 18 * 86_400_000);
  start.setHours(14, 0, 0, 0);
  const party = await (await api.post("/api/parties", { data: { title, kind: "child_birthday", page_theme: "jungle", theme, invitation: text, place: "Lekladan", address: "Storgatan 12", starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 2.5 * 3_600_000).toISOString(), rsvp_by: day(12), bring: "one", show_guests: "count" } })).json();
  const ptoken = String(party.link).split("/party/")[1];
  for (const [first, last] of GUESTS) await api.post(`/api/party/${ptoken}/reply`, { data: { first_name: first, last_name: last, allergies: first === "Nils" ? "Nötter" : "" } });
  const portal = (await (await api.post(`/api/parties/${party.id}/portal`)).json()).portal;
  const ftoken = String(portal.link).split("/fest/")[1];
  await page.setContent(`<body style="margin:0;width:600px;height:450px;background:linear-gradient(135deg,#7aa83f,#f2c14e);display:grid;place-items:center;font-size:160px">🦁</body>`);
  await api.post(`/api/party-portal/${ftoken}/photos?name=Saga`, { multipart: { file: { name: "lion.png", mimeType: "image/png", buffer: await page.screenshot({ clip: { x: 0, y: 0, width: 600, height: 450 } }) } } });
  const kiosk = await (await api.post("/api/kiosks", { data: { name: "Kitchen" } })).json();
  const people = await (await api.get("/api/birthdays/people")).json();
  const wishOf = people.find((p: { user_id: string | null }) => child && p.user_id === child.id);
  if (!kiosk.url) throw new Error(`kiosk: ${JSON.stringify(kiosk)}`);
  // The link is absolute only when the server knows its address.
  return { kiosk: String(kiosk.url).replace(/^https?:\/\/[^/]+/, ""), wishOf: wishOf?.id as string | undefined, party: party.id as string, ptoken, ftoken };
}

for (const lang of Object.keys(LANGS) as Lang[]) {
  test(`help screenshots – ${lang}`, async ({ browser, adminApi }) => {
    test.setTimeout(300_000);
    const t = LANGS[lang] as Record<string, string>;
    mkdirSync(join(OUT!, lang), { recursive: true });

    // A demo family in this language, as its admin (Anna).
    const invite = await (await adminApi.post("/api/server/invitations", { data: { label: `Help ${lang}`, days: 1 } })).json();
    const token = String(invite.url).split("/invite/")[1];
    const ctx: BrowserContext = await browser.newContext({ ...PHONE, locale: lang });
    try {
      const made = await ctx.request.post(`/api/invite/${token}/demo`, { data: { language: lang } });
      if (!made.ok()) throw new Error(`demo: ${made.status()} ${await made.text()}`);
      const page = await ctx.newPage();
      const { kiosk, wishOf, party, ptoken, ftoken } = await seed(ctx.request, lang, page);

      await shot(page, lang, "today", "/");
      await shot(page, lang, "signin", "/profile?tab=security");
      await shot(page, lang, "notifications", "/notifications");
      await shot(page, lang, "calendar", "/calendar", (p) => p.getByRole("button", { name: t["calendar.viewWeek"], exact: true }).click());
      await shot(page, lang, "calendar-month", "/calendar", (p) => p.getByRole("button", { name: t["calendar.viewMonth"], exact: true }).click());
      await shot(page, lang, "trips", "/trips", async (p) => {
        await p.locator("main button.card").first().click();
        await toTop(p.getByRole("heading", { name: t["trips.packing"] }));
      });
      await shot(page, lang, "twohomes", "/calendar/custody");
      await shot(page, lang, "week", "/week");
      await shot(page, lang, "parties", `/parties?id=${party}`, (p) => p.getByRole("button", { name: new RegExp(`${t["parties.tab.design"]}$`) }).first().click());
      await shot(page, lang, "partyinvite", `/party/${ptoken}`);
      // The portal's own part: the photos, then the day's plan.
      await shot(page, lang, "partyportal", `/fest/${ftoken}`, (p) => toTop(p.getByRole("heading", { name: t["party.uploadHeading"] })));
      await shot(page, lang, "chat", "/chat", (p) => p.locator("main a[href^='/chat/'], main li button").first().click().catch(() => {}));
      await shot(page, lang, "lists", "/lists");
      await shot(page, lang, "wishes", wishOf ? `/lists?wish=${wishOf}` : "/lists");
      await shot(page, lang, "food", "/food");
      await shot(page, lang, "recipebook", "/recipes");
      await shot(page, lang, "pantry", "/pantry");
      await shot(page, lang, "tasks", "/tasks");
      await shot(page, lang, "allowance", "/allowance");
      await shot(page, lang, "shop", "/shop");
      await shot(page, lang, "littleones", "/tasks/little");
      await shot(page, lang, "vault", "/vault");
      await shot(page, lang, "documents", "/documents");
      await shot(page, lang, "passwords", "/vault", (p) => p.getByRole("button", { name: t["vault.filter.logins"], exact: true }).click());
      await shot(page, lang, "receipts", "/vault", (p) => p.getByRole("button", { name: t["vault.filter.receipt"], exact: true }).click());
      await shot(page, lang, "safety", "/emergency");
      await shot(page, lang, "property", "/property");
      await shot(page, lang, "economy", "/economy");
      await shot(page, lang, "vehicles", "/vehicles");
      await shot(page, lang, "pets", "/pets");
      await shot(page, lang, "smarthome", "/smarthome");
      await shot(page, lang, "homeassistant", "/settings/smarthome");
      await shot(page, lang, "localai", "/ai");
      await shot(page, lang, "family", "/settings/members");
      await shot(page, lang, "devices", "/settings/devices");
      await shot(page, lang, "familydata", "/settings/security-data");
      await shot(page, lang, "profile", "/profile");

      // The kitchen display is a tablet on the wall.
      const wall = await browser.newContext({ viewport: { width: 1180, height: 820 }, locale: lang });
      const screen = await wall.newPage();
      await shot(screen, lang, "kiosk", kiosk);
      await wall.close();
    } finally {
      await ctx.close();
    }

    // The server's pages, and a home through the gateway, as the server's admin in this language.
    await adminApi.patch("/api/auth/me", { data: { language: lang } });
    const gw = await (await adminApi.post("/api/smarthome/gateways", { data: { name: CABIN[lang] } })).json();
    const admin = await browser.newContext({ ...PHONE, locale: lang, storageState: STATE.admin });
    try {
      const page = await admin.newPage();
      await shot(page, lang, "gateway", "/settings/smarthome", async (p) => {
        await p.getByText(CABIN[lang], { exact: true }).first().evaluate((el) => el.scrollIntoView({ block: "center" }));
      });
      await shot(page, lang, "server", "/server");
      for (const [name, tab] of [["serverbackups", "server.tab.data"], ["serverupdates", "server.tab.updates"], ["serverservices", "server.tab.services"]] as const) {
        await shot(page, lang, name, "/server", async (p) => {
          await p.getByRole("button", { name: t[tab], exact: true }).click();
          // The updates tab ends with the gateways – that's what its picture is about.
          if (name === "serverupdates") await toTop(p.getByRole("heading", { name: t["updates.gateways"] }));
        });
      }
    } finally {
      await admin.close();
      await adminApi.delete(`/api/smarthome/connections/${gw.connection.id}`);
      await adminApi.patch("/api/auth/me", { data: { language: "en" } });
    }
  });
}
