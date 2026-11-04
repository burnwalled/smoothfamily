import { test, expect, unique } from "../fixtures";

// 3.4.0: a party – created by an adult, replied to by a guest without an account (with a +1), and
// the reply with the allergies gathered for the hosts.
test("a party: the invitation, a guest's reply and the planning", async ({ adminPage: page, adminApi, browser }) => {
  const title = unique("Majas kalas");
  await page.goto("/parties");
  await page.getByRole("button", { name: "New party" }).click();
  const form = page.getByRole("region", { name: "New party" });
  await form.getByLabel("Name").fill(title);
  await form.getByLabel("Each guest may bring").selectOption("one");
  await form.getByLabel("The guests see").selectOption("names");
  await form.getByRole("button", { name: "Create the party" }).click();
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(title) })).toBeVisible();
  const party = (await (await adminApi.get("/api/parties")).json()).find((p: { title: string }) => p.title === title);
  const link: string = (await (await adminApi.get(`/api/parties/${party.id}`)).json()).link;
  try {
    // The checklist it started with.
    await page.getByRole("button", { name: /^\d\s?To do$/ }).click();
    await expect(page.getByRole("checkbox", { name: "Share the invitation" })).toBeVisible();

    // The invitation page's look: the jungle.
    await page.getByRole("button", { name: /^\d\s?Details$/ }).click();
    await page.getByRole("radiogroup", { name: "The invitation page's look" }).getByRole("radio", { name: /Jungle/ }).click();
    await expect(page.getByRole("radio", { name: /Jungle/ })).toHaveAttribute("aria-checked", "true");

    // A guest, without an account.
    const guest = await browser.newContext();
    const g = await guest.newPage();
    await g.goto(link.replace(/^https?:\/\/[^/]+/, ""));
    await expect(g.getByRole("heading", { name: title })).toBeVisible();
    // The jungle's own sticker from the picture library, not an emoji.
    await expect(g.locator('img[src="/party-assets/lion.webp"]').first()).toBeVisible();
    // No e-mail on this server: no address is asked for.
    await expect(g.getByLabel("E-mail (optional)")).toHaveCount(0);
    const reply = g.getByRole("region", { name: "Will you come?" });
    await reply.getByLabel("First name").fill("Saga");
    await reply.getByLabel("Last name").fill("Berg");
    await reply.getByLabel("Allergies or special diet").fill("Nuts");
    await reply.getByRole("button", { name: "I'm bringing a +1" }).click();
    const plus = reply.getByRole("group", { name: "Person 1" });
    await plus.getByLabel("First name").fill("Ella");
    await expect(plus.getByLabel("Last name")).toHaveValue("Berg");
    await expect(reply.getByRole("button", { name: "I'm bringing a +1" })).toHaveCount(0);
    await reply.getByRole("button", { name: "Send the reply" }).click();
    await expect(g.getByRole("status")).toContainText("see you there");
    await expect(g.getByText("2 coming").first()).toBeVisible();
    await expect(g.getByText("Saga Berg, Ella Berg")).toBeVisible();
    await guest.close();

    // The hosts see it, with the allergies gathered.
    await page.reload();
    await page.getByRole("button", { name: /^\d\s?Guests$/ }).click();
    await expect(page.getByRole("region", { name: "Guests" }).getByText("Saga Berg")).toBeVisible();
    await expect(page.getByRole("region", { name: "Allergies and diets" }).getByText("Nuts")).toBeVisible();
  } finally {
    await adminApi.delete(`/api/parties/${party.id}`);
  }
});

// A dinner whose date the guests vote on, with one reply per family.
test("a dinner: the guests vote on the date and say how many are coming", async ({ adminPage: page, adminApi, browser }) => {
  const title = unique("Julmiddag");
  await page.goto("/parties");
  await page.getByRole("button", { name: "New party" }).click();
  const form = page.getByRole("region", { name: "New party" });
  await form.getByLabel("Name").fill(title);
  await form.getByLabel("Kind").selectOption({ label: "🍽️ Dinner" });
  await form.getByLabel("Let the guests vote on the date").check();
  await expect(form.getByLabel("Each guest may bring")).toHaveValue("family");
  await form.getByRole("button", { name: "Create the party" }).click();
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(title) })).toBeVisible();
  await expect(page.getByText("The date is being voted on").first()).toBeVisible();
  const party = (await (await adminApi.get("/api/parties")).json()).find((p: { title: string }) => p.title === title);
  const link: string = (await (await adminApi.get(`/api/parties/${party.id}`)).json()).link;
  try {
    const guest = await browser.newContext();
    const g = await guest.newPage();
    await g.goto(link.replace(/^https?:\/\/[^/]+/, ""));
    await expect(g.getByText("The date isn't set yet – vote below.")).toBeVisible();
    const reply = g.getByRole("region", { name: "Will you come?" });
    await reply.getByRole("group", { name: "Which dates suit you?" }).getByRole("checkbox").first().check();
    await reply.getByLabel("First name").fill("Saga");
    await reply.getByRole("button", { name: "Add one more" }).click();
    await reply.getByRole("group", { name: "Person 1" }).getByLabel("First name").fill("Lars");
    await reply.getByRole("button", { name: "Add one more" }).click();
    const kid = reply.getByRole("group", { name: "Person 2" });
    await kid.getByLabel("First name").fill("Ella");
    await kid.getByLabel("A child").check();
    await reply.getByRole("button", { name: "Send my vote" }).click();
    await expect(g.getByRole("status")).toContainText("Thank you for voting");
    await guest.close();

    // The hosts see the votes and choose the date.
    await page.reload();
    const poll = page.getByRole("region", { name: "The vote on the date" });
    await expect(poll.getByText("1 replies · 3 people")).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await poll.getByRole("button", { name: "Choose this date" }).first().click();
    await expect(page.getByRole("button", { name: "Choose this date" })).toHaveCount(0);
    await expect(page.getByText("3 coming · 0 not coming").first()).toBeVisible();
    await page.getByRole("button", { name: /^\d\s?Guests$/ }).click();
    await expect(page.getByRole("region", { name: "Guests" }).getByText("With: Lars, Ella (child)")).toBeVisible();
  } finally {
    await adminApi.delete(`/api/parties/${party.id}`);
  }
});

// An own theme: made in the theme picker, kept for the family, and worn by the guests' page.
test("a party in an own theme", async ({ adminPage: page, adminApi, browser }) => {
  const title = unique("Temafest");
  const name = unique("Lila");
  await page.goto("/parties");
  await page.getByRole("button", { name: "New party" }).click();
  const form = page.getByRole("region", { name: "New party" });
  await form.getByLabel("Name").fill(title);
  await form.getByLabel("Kind").selectOption({ label: "🎉 Party" });
  await form.getByRole("button", { name: "Create the party" }).click();
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(title) })).toBeVisible();
  const party = (await (await adminApi.get("/api/parties")).json()).find((p: { title: string }) => p.title === title);
  const link: string = (await (await adminApi.get(`/api/parties/${party.id}`)).json()).link;
  try {
    // The party's own category first: Disco is there.
    const picker = page.getByRole("radiogroup", { name: "The invitation page's look" });
    await expect(picker.getByRole("radio", { name: /Disco/ })).toBeVisible();
    await picker.getByRole("button", { name: "Create your own theme" }).click();
    const editor = page.getByRole("region", { name: "Your own theme" });
    await editor.getByLabel("The theme's name").fill(name);
    await editor.getByLabel("Decoration (emoji)").fill("🦩🌺🍹");
    await editor.getByRole("button", { name: "Save the theme" }).click();
    await expect(picker.getByRole("radio", { name: new RegExp(name) })).toHaveAttribute("aria-checked", "true");

    const guest = await browser.newContext();
    const g = await guest.newPage();
    await g.goto(link.replace(/^https?:\/\/[^/]+/, ""));
    await expect(g.getByText("🦩").first()).toBeVisible();
    await guest.close();
  } finally {
    await adminApi.delete(`/api/parties/${party.id}`);
    const themes = (await (await adminApi.get("/api/parties/themes")).json()) as { id: string; name: string }[];
    for (const th of themes.filter((x) => x.name === name)) await adminApi.delete(`/api/parties/themes/${th.id}`);
  }
});

// A party as an older version sent it (kept in the browser's cache): the page still opens.
test("a party kept from an older version still opens", async ({ adminPage: page, adminApi }) => {
  const title = unique("Gammal fest");
  const made = await (await adminApi.post("/api/parties", { data: { title, kind: "party", starts_at: new Date(Date.now() + 9 * 86_400_000).toISOString(), ends_at: new Date(Date.now() + 9 * 86_400_000 + 7_200_000).toISOString() } })).json();
  try {
    await page.route(`**/api/parties/${made.id}`, async (route) => {
      const fresh = await (await route.fetch()).json();
      const old = { ...fresh, plus_one: true, guests: [{ id: "x", first_name: "Saga", last_name: "Berg", coming: true, allergies: "", message: "", plus_first_name: "Ella", plus_last_name: "Berg", plus_allergies: "", email: null, updates: false }] };
      for (const k of ["bring", "person_ids", "page_custom_id", "thanks_custom_id", "invite_image", "date_poll", "date_options", "tally", "children"]) delete old[k];
      await route.fulfill({ json: old });
    });
    await page.goto(`/parties?id=${made.id}`);
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(title) })).toBeVisible();
    await page.getByRole("button", { name: /^\d\s?Guests$/ }).click();
    await expect(page.getByRole("region", { name: "Guests" }).getByText("Saga Berg")).toBeVisible();
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await adminApi.delete(`/api/parties/${made.id}`);
  }
});

// The hosts make the poster their own: a text of theirs, their emoji, the calendar buttons they want.
test("the hosts edit the invitation's poster", async ({ adminPage: page, adminApi, browser }) => {
  const title = unique("Affischfest");
  const made = await (await adminApi.post("/api/parties", { data: { title, kind: "party", page_theme: "glamour", place: "Folkets hus", starts_at: new Date(Date.now() + 20 * 86_400_000).toISOString(), ends_at: new Date(Date.now() + 20 * 86_400_000 + 7_200_000).toISOString() } })).json();
  try {
    await page.goto(`/parties?id=${made.id}`);
    await page.getByRole("button", { name: /^\d\s?Design$/ }).click();
    // The invitation's poster, in the full-screen editor.
    await page.getByRole("region", { name: "The posters" }).getByRole("listitem").filter({ hasText: "Invitation" }).getByRole("button", { name: "Edit" }).click();
    const parts = page.getByRole("dialog").getByRole("region", { name: "The poster's parts" });
    // The welcome line: a text of our own, centred, in the gala handwriting.
    await parts.getByRole("button", { name: /^Text Welcome to/ }).click();
    const settings = page.getByRole("dialog").getByRole("region", { name: "The part's settings" });
    await settings.getByRole("textbox", { name: "The text", exact: true }).fill("Skål för {namn}!");
    await settings.getByRole("radio", { name: "Centred" }).click();
    // The decoration row: a champagne bottle instead of the first emoji.
    await parts.getByRole("button", { name: /^Decoration row/ }).click();
    await settings.getByRole("radiogroup", { name: "Emoji or picture" }).first().getByRole("radio", { name: "Emoji" }).click();
    await settings.getByRole("textbox", { name: "Emoji" }).first().fill("🍾");
    // The second: another sticker from the library.
    await settings.getByRole("group").first().waitFor({ state: "attached" }).catch(() => {});
    await settings.locator("summary", { hasText: "Choose" }).first().click();
    await settings.getByRole("option", { name: "Disco ball" }).click();
    // The calendar: Google and Outlook only.
    await parts.getByRole("button", { name: /^Calendar buttons/ }).click();
    await settings.getByLabel("Apple Calendar and others (.ics)").uncheck();
    await parts.getByRole("button", { name: "Save the poster" }).click();
    await expect(parts.getByRole("status")).toContainText("Saved");

    const guest = await browser.newContext();
    const g = await guest.newPage();
    await g.goto(`/party/${made.link.split("/party/")[1]}`);
    await expect(g.getByText(`Skål för ${title}!`)).toBeVisible();
    await expect(g.getByText("🍾")).toBeVisible();
    await expect(g.locator('img[src="/party-assets/disco-ball.webp"]').first()).toBeVisible();
    await expect(g.getByRole("link", { name: "Google Calendar" })).toHaveAttribute("href", /calendar\.google\.com\/calendar\/render/);
    await expect(g.getByRole("link", { name: "Outlook" })).toHaveAttribute("href", /outlook\.live\.com/);
    await expect(g.getByRole("link", { name: "Apple Calendar and others (.ics)" })).toHaveCount(0);
    await guest.close();
  } finally {
    await adminApi.delete(`/api/parties/${made.id}`);
  }
});

// Before the invitation, a save-the-date; on the day, the portal where the guests upload their photos.
test("a save-the-date, then the party day's portal", async ({ adminPage: page, adminApi, browser }) => {
  const title = unique("Portalfest");
  const made = await (await adminApi.post("/api/parties", { data: { title, kind: "party", page_theme: "glamour", starts_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), ends_at: new Date(Date.now() + 30 * 86_400_000 + 7_200_000).toISOString() } })).json();
  try {
    await page.goto(`/parties?id=${made.id}`);
    await page.getByRole("button", { name: /^\d\s?Design$/ }).click();
    await page.getByLabel("The link shows").selectOption("save");
    await page.getByRole("button", { name: "Open the portal" }).click();
    const portal = await page.getByLabel("The portal's link").inputValue();

    const guest = await browser.newContext();
    const g = await guest.newPage();
    await g.goto(`/party/${made.link.split("/party/")[1]}`);
    await expect(g.getByText(/Save the date! ·/)).toBeVisible();
    await expect(g.getByRole("region", { name: "Will you come?" })).toHaveCount(0);
    await expect(g.getByRole("link", { name: "Google Calendar" })).toBeVisible();

    await g.goto(portal.replace(/^https?:\/\/[^/]+/, ""));
    await expect(g.getByText(title).first()).toBeVisible();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    await g.getByLabel("Your name (optional)").fill("Saga");
    await g.locator('input[type="file"]').setInputFiles({ name: "bild.png", mimeType: "image/png", buffer: png });
    await expect(g.getByRole("status")).toContainText("1 shared");
    await guest.close();
    await page.reload();
    await page.getByRole("button", { name: /^\d\s?Design$/ }).click();
    await expect(page.getByText("1 photos from the guests")).toBeVisible();
  } finally {
    await adminApi.delete(`/api/parties/${made.id}`);
  }
});

// One link all the way: a mail's personal link ties the browser to the guest's reply and leaves the
// address, opening it again shows the reply, and at its time the same link opens the party portal.
test("a guest's personal link: their reply, then the portal", async ({ adminApi, browser }) => {
  const title = unique("Sommarfest");
  const party = await (await adminApi.post("/api/parties", { data: { title, kind: "party", starts_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), ends_at: new Date(Date.now() + 30 * 86_400_000 + 7_200_000).toISOString() } })).json();
  const token: string = (await (await adminApi.get(`/api/parties/${party.id}`)).json()).link.split("/").pop();
  try {
    const { key } = await (await adminApi.post(`/api/party/${token}/reply`, { data: { first_name: "Saga", last_name: "Berg", coming: true } })).json();
    const guest = await browser.newContext();
    const g = await guest.newPage();
    await g.goto(`/party/${token}?key=${encodeURIComponent(key)}`);
    await expect(g.getByRole("region", { name: "Your reply" })).toContainText("Saga, you're coming");
    await expect(g).toHaveURL(new RegExp(`/party/${token}$`));
    await expect(g.getByRole("region", { name: "Will you come?" })).toHaveCount(0);
    await g.getByRole("button", { name: "Change my reply" }).click();
    await expect(g.getByRole("region", { name: "Will you come?" }).getByLabel("First name")).toHaveValue("Saga");

    // The portal's time has come: the very same address now opens it, without the key.
    const detail = await (await adminApi.put(`/api/parties/${party.id}`, { data: { portal_at: new Date(Date.now() - 60_000).toISOString() } })).json();
    await g.goto(`/party/${token}`);
    await expect(g).toHaveURL(new RegExp(`/fest/${detail.portal.link.split("/").pop()}$`));
    await guest.close();
  } finally {
    await adminApi.delete(`/api/parties/${party.id}`);
  }
});

// Templates: the built-in gala on a party, and one from an AI's answer – read, seen, then used, on the
// guests' page; what isn't a poster's part stays out.
test("templates: the gala, one's own, and one from an AI", async ({ adminPage: page, adminApi, browser }) => {
  const title = unique("Galan");
  const when = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const party = await (await adminApi.post("/api/parties", { data: { title, kind: "party", starts_at: when, ends_at: new Date(Date.now() + 30 * 86_400_000 + 7_200_000).toISOString() } })).json();
  const token: string = (await (await adminApi.get(`/api/parties/${party.id}`)).json()).link.split("/").pop();
  const kept = unique("Vår mall");
  page.on("dialog", (d) => d.accept());
  try {
    await page.goto(`/parties?id=${party.id}`);
    await page.getByRole("button", { name: /^\d\s?Design$/ }).click();
    const box = page.getByRole("region", { name: "Templates" });

    // The gala, seen before it's used.
    await box.getByRole("listitem").filter({ hasText: "Gala" }).getByRole("button", { name: "Preview" }).click();
    await expect(page.getByRole("dialog", { name: "Preview" }).getByText("Until the cork pops")).toBeVisible();
    await page.getByRole("button", { name: "Use on this party" }).click();
    await expect(box.getByRole("status").filter({ hasText: "Gala is on the party" })).toBeVisible();
    const guest = await browser.newContext();
    const g = await guest.newPage();
    await g.goto(`/party/${token}`);
    await expect(g.getByText("Valid for one evening")).toBeVisible();
    await expect(g.getByText("Row", { exact: true })).toBeVisible();

    // Saved as the family's own.
    await box.getByRole("button", { name: "Save this party as a template" }).click();
    await box.getByLabel("The template's name").fill(kept);
    await box.getByRole("button", { name: "Save the template" }).click();
    await expect(box.getByRole("listitem").filter({ hasText: kept })).toBeVisible();

    // The prompt, and an AI's answer with chat around it and something that doesn't belong.
    await box.getByRole("button", { name: /own AI/ }).click();
    await box.getByLabel("What do you wish for?").fill("Neon");
    await box.getByRole("button", { name: "Copy the prompt" }).click();
    const answer = 'Here you go:\n```json\n' + JSON.stringify({
      name: "Neonnatt", look: { bg: "#120024", bg2: "#2a0845", accent: "#ff3cac", ink: "#ffffff", pattern: "dots", font: "retro", effect: "bokeh", decor: "🪩" },
      layouts: { invite: [{ type: "text", text: "Neon för {title}", size: "xxl", color: "gold" }, { type: "marquee", text: "x" }, { type: "image", source: "url", asset: "https://example.com/x.png" }] },
    }) + "\n```";
    await box.getByLabel("The AI's answer").fill("not a template");
    await box.getByRole("button", { name: "Read the answer" }).click();
    await expect(box.getByText("There's no JSON in it")).toBeVisible();
    await box.getByLabel("The AI's answer").fill(answer);
    await box.getByRole("button", { name: "Read the answer" }).click();
    await expect(box.getByRole("status").filter({ hasText: "Neonnatt can be used" })).toContainText("marquee");
    await box.getByRole("status").filter({ hasText: "Neonnatt" }).getByRole("button", { name: "Preview" }).click();
    await page.getByRole("dialog", { name: "Preview" }).getByRole("button", { name: "Use on this party" }).click();
    await expect(box.getByRole("status").filter({ hasText: "Neonnatt is on the party" })).toBeVisible();
    await g.reload();
    await expect(g.getByRole("heading", { level: 1, name: `Neon för ${title}` })).toBeVisible();
    await expect(g.locator('img[src*="example.com"]')).toHaveCount(0);
    await guest.close();
  } finally {
    await adminApi.delete(`/api/parties/${party.id}`);
    const all = await (await adminApi.get("/api/parties/templates")).json();
    for (const x of all) if (x.name === kept) await adminApi.delete(`/api/parties/templates/${x.id}`);
    const themes = await (await adminApi.get("/api/parties/themes")).json();
    for (const x of themes) if (x.name === "Neonnatt") await adminApi.delete(`/api/parties/themes/${x.id}`);
  }
});

// A poster's own arrangement on phones: the order, what's hidden and the alignment there, the
// computer's untouched, and the guest gets the one that suits their screen. On every page of the party.
test("a poster arranged differently on phones", async ({ adminPage: page, adminApi, browser }) => {
  const title = unique("Mobilfesten");
  const at = Date.now() + 30 * 86_400_000;
  const blocks = [
    { id: "one", type: "text", text: "Rubrik {title}", size: "xxl" },
    { id: "two", type: "text", text: "Bara på datorn" },
    { id: "three", type: "text", text: "Sist på datorn" },
  ];
  const party = await (await adminApi.post("/api/parties", { data: { title, kind: "party", starts_at: new Date(at).toISOString(), ends_at: new Date(at + 7_200_000).toISOString() } })).json();
  await adminApi.put(`/api/parties/${party.id}`, { data: { phase: "save", layouts: { save: blocks } } });
  const token: string = (await (await adminApi.get(`/api/parties/${party.id}`)).json()).link.split("/").pop();
  const top = async (p: import("@playwright/test").Page, text: string) => (await p.getByText(text, { exact: false }).first().boundingBox())!.y;
  try {
    await page.goto(`/parties?id=${party.id}`);
    await page.getByRole("button", { name: /^\d\s?Design$/ }).click();
    await page.getByRole("region", { name: "The posters" }).getByRole("listitem").filter({ hasText: "Save the date" }).getByRole("button").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("radio", { name: "Phone" }).click();
    const parts = dialog.getByRole("region", { name: "The poster's parts" });
    await expect(parts.getByText("the order, what's shown")).toBeVisible();

    // The last text first, the second hidden, the first centred – on phones only.
    const row = (text: RegExp) => parts.getByRole("listitem").filter({ hasText: text });
    await row(/Sist på datorn/).getByRole("button", { name: "Move up" }).click();
    await row(/Sist på datorn/).getByRole("button", { name: "Move up" }).click();
    await row(/Bara på datorn/).getByRole("button", { name: "Hide on phones" }).click();
    await parts.getByRole("button", { name: /Rubrik/ }).click();
    await dialog.getByRole("region", { name: "The part's settings" }).getByRole("radio", { name: "Centred" }).click();
    // The editor shows it as the phone will.
    await expect(dialog.getByText("Bara på datorn", { exact: true })).toHaveCount(1); // only in the list
    await parts.getByRole("button", { name: "Save the poster" }).click();
    await expect(parts.getByRole("status")).toContainText("Saved");

    const wide = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const w = await wide.newPage();
    await w.goto(`/party/${token}`);
    await expect(w.getByText("Bara på datorn")).toBeVisible();
    expect(await top(w, "Rubrik")).toBeLessThan(await top(w, "Sist på datorn"));
    await expect(w.getByRole("heading", { level: 1 })).not.toHaveClass(/text-center/);

    const narrow = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const n = await narrow.newPage();
    await n.goto(`/party/${token}`);
    await expect(n.getByText("Rubrik")).toBeVisible();
    await expect(n.getByText("Bara på datorn")).toHaveCount(0);
    expect(await top(n, "Sist på datorn")).toBeLessThan(await top(n, "Rubrik"));
    await expect(n.getByRole("heading", { level: 1 })).toHaveClass(/text-center/);

    // The same page turned wide: it follows the screen.
    await n.setViewportSize({ width: 1100, height: 800 });
    await expect(n.getByText("Bara på datorn")).toBeVisible();
    await wide.close();
    await narrow.close();
  } finally {
    await adminApi.delete(`/api/parties/${party.id}`);
  }
});
