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

    // The party's look: the jungle.
    await page.getByRole("button", { name: /^\d\s?Design$/ }).click();
    await page.getByRole("radiogroup", { name: "The party's look" }).getByRole("radio", { name: /Jungle/ }).click();
    await expect(page.getByRole("radiogroup", { name: "The party's look" }).getByRole("radio", { name: /Jungle/ })).toHaveAttribute("aria-checked", "true");

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
    // The look lives under Design, not among the party's details.
    await expect(page.getByRole("radiogroup", { name: "The party's look" })).toHaveCount(0);
    await page.getByRole("button", { name: /^\d\s?Design$/ }).click();
    const picker = page.getByRole("radiogroup", { name: "The party's look" });
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
      for (const k of ["bring", "person_ids", "page_custom_id", "invite_image", "date_poll", "date_options", "tally", "children"]) delete old[k];
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
    await page.getByRole("button", { name: /^\d\s?Sending out$/ }).click();
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
    await page.getByRole("button", { name: /^\d\s?Sending out$/ }).click();
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
    await page.getByRole("region", { name: "The posters" }).getByRole("listitem").filter({ hasText: "Save the date" }).getByRole("button", { name: "Edit" }).click();
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

// Saving says how it went, beside the button: done, or what went wrong.
test("saving a party's details says how it went", async ({ adminPage: page, adminApi }) => {
  const at = Date.now() + 30 * 86_400_000;
  const party = await (await adminApi.post("/api/parties", { data: { title: unique("Sparfest"), kind: "party", starts_at: new Date(at).toISOString(), ends_at: new Date(at + 7_200_000).toISOString() } })).json();
  try {
    await page.goto(`/parties?id=${party.id}`);
    const details = page.getByRole("region", { name: "Details" });
    const renamed = unique("Omdöpt");
    await details.getByLabel("Name").fill(renamed);
    await details.getByRole("button", { name: "Save" }).click();
    await expect(details.getByRole("status")).toHaveText("Saved");
    await expect(page.getByRole("heading", { level: 1, name: renamed })).toBeVisible();
    await expect(details.getByRole("status")).toHaveCount(0, { timeout: 6000 });

    await page.route(`**/api/parties/${party.id}`, (route) => (route.request().method() === "PUT" ? route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ detail: "The party can't end before it starts" }) }) : route.fallback()));
    await details.getByRole("button", { name: "Save" }).click();
    await expect(details.getByRole("alert")).toContainText("can't end before it starts");
    await expect(details.getByRole("status")).toHaveCount(0);
  } finally {
    await adminApi.delete(`/api/parties/${party.id}`);
  }
});

// A choice saved at once says so, wherever one has scrolled to; a failed one says what went wrong.
test("a choice saved at once says so", async ({ adminPage: page, adminApi }) => {
  const at = Date.now() + 30 * 86_400_000;
  const party = await (await adminApi.post("/api/parties", { data: { title: unique("Valfest"), kind: "party", starts_at: new Date(at).toISOString(), ends_at: new Date(at + 7_200_000).toISOString() } })).json();
  try {
    await page.goto(`/parties?id=${party.id}`);
    const details = page.getByRole("region", { name: "Details" });
    await expect(details.getByLabel("Party theme/dress code")).toBeVisible();
    await details.getByLabel("The guests see").selectOption("names");
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeInViewport();
    await expect(details.getByLabel("The guests see")).toHaveValue("names");
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toHaveCount(0, { timeout: 6000 });

    // The save button speaks for itself: no second note.
    await details.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toHaveCount(1);
    await expect(details.getByRole("status")).toHaveText("Saved");
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toHaveCount(0, { timeout: 6000 });

    await page.route(`**/api/parties/${party.id}`, (route) => (route.request().method() === "PUT" ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Something broke" }) }) : route.fallback()));
    await details.getByLabel("The guests see").selectOption("none");
    await expect(page.getByRole("alert").filter({ hasText: "Something broke" })).toBeInViewport();
  } finally {
    await adminApi.delete(`/api/parties/${party.id}`);
  }
});

// A guest without e-mail: the hosts copy their personal link, and it opens as them.
test("copying a guest's personal link", async ({ adminPage: page, adminApi, browser }) => {
  const at = Date.now() + 30 * 86_400_000;
  const party = await (await adminApi.post("/api/parties", { data: { title: unique("Länkfest"), kind: "party", starts_at: new Date(at).toISOString(), ends_at: new Date(at + 7_200_000).toISOString() } })).json();
  await adminApi.post(`/api/parties/${party.id}/guests`, { data: { first_name: "Saga", invited: true } });
  try {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(`/parties?id=${party.id}`);
    await page.getByRole("button", { name: /^\d\s?Guests$/ }).click();
    await page.getByRole("button", { name: "Copy Saga's personal link" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Copied" })).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toContain("?key=");
    const guest = await browser.newContext();
    const g = await guest.newPage();
    await g.goto(link.replace(/^https?:\/\/[^/]+/, ""));
    await expect(g.getByRole("region", { name: "Will you come?" }).getByLabel("First name")).toHaveValue("Saga");
    await expect(g).not.toHaveURL(/key=/);
    await guest.close();
  } finally {
    await adminApi.delete(`/api/parties/${party.id}`);
  }
});

// Only the invitation: what's chosen away is gone from Design and Sending out.
test("a party with only the invitation", async ({ adminPage: page, adminApi }) => {
  const at = Date.now() + 30 * 86_400_000;
  const party = await (await adminApi.post("/api/parties", { data: { title: unique("OSA-fest"), kind: "party", starts_at: new Date(at).toISOString(), ends_at: new Date(at + 7_200_000).toISOString() } })).json();
  try {
    await page.goto(`/parties?id=${party.id}`);
    const details = page.getByRole("region", { name: "Details" });
    await expect(details.getByRole("checkbox", { name: "Invitation" })).toBeDisabled();
    for (const name of ["Save the date", "The party day's portal", "Thank-you"]) {
      await details.getByRole("checkbox", { name }).click();
      await expect(details.getByRole("checkbox", { name })).not.toBeChecked();
    }
    await page.getByRole("button", { name: /^\d\s?Design$/ }).click();
    const posters = page.getByRole("region", { name: "The posters" });
    await expect(posters.getByRole("listitem")).toHaveCount(1);
    await expect(posters.getByRole("listitem").filter({ hasText: "Invitation" })).toBeVisible();
    await expect(page.getByRole("region", { name: "The thank-you" })).toHaveCount(0);
    await page.getByRole("button", { name: /^\d\s?Sending out$/ }).click();
    await expect(page.getByRole("region", { name: "The party day's portal" })).toHaveCount(0);
    await page.getByRole("button", { name: /^\d\s?To do$/ }).click();
    await expect(page.getByRole("checkbox", { name: /Print the QR code/ })).toHaveCount(0);
  } finally {
    await adminApi.delete(`/api/parties/${party.id}`);
  }
});

// The QR code's print, as a task, in the party's theme; printing it opens nothing. The portal's link
// ends when it's set to.
test("the portal under Sending out: printing the QR code and when its link ends", async ({ adminPage: page, adminApi, browser }) => {
  const at = Date.now() + 30 * 86_400_000;
  const title = unique("QR-fest");
  const party = await (await adminApi.post("/api/parties", { data: { title, kind: "party", page_theme: "glamour", starts_at: new Date(at).toISOString(), ends_at: new Date(at + 7_200_000).toISOString() } })).json();
  try {
    await page.goto(`/parties?id=${party.id}`);
    await page.getByRole("button", { name: /^\d\s?To do$/ }).click();
    const task = page.getByRole("listitem").filter({ hasText: "Print the QR code" });
    const [print] = await Promise.all([page.context().waitForEvent("page"), task.getByRole("link", { name: "Print" }).click()]);
    await expect(print.getByRole("heading", { name: title })).toBeVisible();
    await expect(print.getByLabel("QR code").locator("svg")).toBeVisible();
    await expect(print.locator("main.pt")).toHaveCSS("background-image", /gradient/);
    await print.close();

    await page.getByRole("button", { name: /^\d\s?Design$/ }).click();
    await expect(page.getByRole("region", { name: "The party day's portal" })).toHaveCount(0);
    await page.getByRole("button", { name: /^\d\s?Sending out$/ }).click();
    const card = page.getByRole("region", { name: "The party day's portal" });
    await expect(card.getByText("Closed", { exact: false }).first()).toBeVisible();
    const link: string = await card.getByLabel("The portal's link").inputValue();
    const guest = await browser.newContext();
    const g = await guest.newPage();
    await g.goto(link.replace(/^https?:\/\/[^/]+/, ""));
    // Too early, the QR code leads to its waiting page, and nothing else.
    await expect(g.getByRole("status")).toContainText("isn't open yet");
    await expect(g.getByText("Your name (optional)")).toHaveCount(0);

    // Open now, ending in the past: the cleaners the morning after get nothing.
    const now = Date.now();
    await adminApi.put(`/api/parties/${party.id}`, { data: { portal_at: new Date(now - 60_000).toISOString(), portal_until: new Date(now + 60_000).toISOString() } });
    await g.reload();
    await expect(g.getByLabel("Your name (optional)")).toBeVisible();
    await adminApi.put(`/api/parties/${party.id}`, { data: { portal_at: new Date(now - 7_200_000).toISOString(), portal_until: new Date(now - 60_000).toISOString() } });
    await g.reload();
    await expect(g.getByRole("heading", { name: title })).toHaveCount(0);
    await guest.close();
  } finally {
    await adminApi.delete(`/api/parties/${party.id}`);
  }
});

// Preview as a guest on each page; a personal link's greeting, only for those it's for.
test("preview as a guest, and the guest's own name", async ({ adminPage: page, adminApi, browser }) => {
  const at = Date.now() + 30 * 86_400_000;
  const party = await (await adminApi.post("/api/parties", { data: { title: unique("Namnfest"), kind: "party", starts_at: new Date(at).toISOString(), ends_at: new Date(at + 7_200_000).toISOString() } })).json();
  const detail = await (await adminApi.post(`/api/parties/${party.id}/guests`, { data: { first_name: "Saga", invited: true } })).json();
  const token: string = detail.link.split("/").pop();
  try {
    await page.goto(`/parties?id=${party.id}`);
    await page.getByRole("button", { name: /^\d\s?Design$/ }).click();
    for (const name of ["Save the date", "Invitation", "The party day's portal", "Thank-you"]) await expect(page.getByRole("button", { name: `Preview ${name} as guest` })).toBeVisible();
    await page.getByRole("button", { name: "Preview Invitation as guest" }).click();
    const preview = page.getByRole("dialog", { name: "Preview as guest" });
    await expect(preview.getByText("Hi Anna!")).toBeVisible();
    await preview.getByRole("radio", { name: "Phone" }).click();
    await preview.getByRole("tab", { name: "Thank-you" }).click();
    await expect(preview.getByRole("tab", { name: "Thank-you" })).toHaveAttribute("aria-selected", "true");
    await preview.getByRole("button", { name: "Close" }).click();

    const { link } = await (await adminApi.post(`/api/parties/${party.id}/guests/${detail.guests[0].id}/link`)).json();
    const personal = await browser.newContext();
    const p = await personal.newPage();
    await p.goto(link.replace(/^https?:\/\/[^/]+/, ""));
    await expect(p.getByText("Hi Saga!")).toBeVisible();
    await personal.close();
    const plain = await browser.newContext();
    const n = await plain.newPage();
    await n.goto(`/party/${token}`);
    await expect(n.getByRole("region", { name: "Will you come?" })).toBeVisible();
    await expect(n.getByText(/^Hi /)).toHaveCount(0);
    await plain.close();
  } finally {
    await adminApi.delete(`/api/parties/${party.id}`);
  }
});

// A guest list brought in, placed at tables; and the last step.
test("bringing in guests, the seating and the last check", async ({ adminPage: page, adminApi }) => {
  const at = Date.now() + 30 * 86_400_000;
  const party = await (await adminApi.post("/api/parties", { data: { title: unique("Listfest"), kind: "party", starts_at: new Date(at).toISOString(), ends_at: new Date(at + 7_200_000).toISOString() } })).json();
  try {
    await page.goto(`/parties?id=${party.id}`);
    await page.getByRole("button", { name: /^\d\s?Guests$/ }).click();
    const box = page.getByRole("region", { name: "Bring in a guest list" });
    await box.getByLabel("Choose a file").setInputFiles({ name: "gäster.csv", mimeType: "text/csv", buffer: Buffer.from("Förnamn;Efternamn;E-post;Allergier\nSaga;Berg;saga@example.com;Nötter\nNils;Ek;;\nNils;Ek;;\n") });
    await expect(box.getByText("2 guests found")).toBeVisible();
    await expect(box.getByText("1 rows were the same person")).toBeVisible();
    await box.getByRole("button", { name: "Add 2 guests" }).click();
    await expect(box.getByRole("status")).toContainText("2 guests added");
    const list = page.getByRole("region", { name: "Guests", exact: true });
    await expect(list.getByText("Saga Berg").locator("visible=true").first()).toBeVisible();
    await expect(list.getByText("Nils Ek").locator("visible=true").first()).toBeVisible();
    // A real Excel file: a header row and one guest.
    const xlsx = "UEsDBBQAAAAIAFVlZF38PpA29gAAAJMCAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbK2SzU7DMBCEXyXytaqdcuCAkvRQuAISvMDibBIr/pN3W8Lb46QFIVTopSfLntn5xpar7eRsccBEJvhabGQptk31+hGRiqx4qsXAHO+UIj2gA5Ihos9KF5IDztvUqwh6hB7VTVneKh08o+c1zxmiqe6xg73l4mHKx0dKQkui2B2NM6sWEKM1Gjjr6uDbX5T1iSDz5OKhwURaZYNQZwmz8jfgNPeUr51Mi8UzJH4El11qsuo9pPEthFH+H3KmZeg6o7ENeu/yiKSYEFoaENlZuazSgfGry/zFTGpZNlcu8p1/oQcNkLB94WR8T1d/jB/ZXz3U8u2aT1BLAwQUAAAACABVZWRdS4OjOpYAAAAFAQAACwAAAF9yZWxzLy5yZWxzjc89DsIwDAXgq0Q+QN0yMKCmXVi6Ii4QUvdHbeLICVBuT0aKGBj9/PRZrtvNrepBEmf2GqqihLapL7SalIM4zSGq3PBRw5RSOCFGO5EzseBAPm8GFmdSHmXEYOxiRsJDWR5RPg3Ym6rrNUjXV6Cur0D/2DwMs6Uz27sjn36c+Gpk2chIScO24pNluTEvRUYBmxp3DzZvUEsDBBQAAAAIAFVlZF07jTKFpAAAAPoAAAAPAAAAeGwvd29ya2Jvb2sueG1sjY9JDoMwDEWvEvkADXTRBQphU6niGCmYJoIMstPhQL1JL9YIyr4rD19+3191L7+IBxK7GFqoDxV0Wj0jzdcYZ1HEwC3YnFMjJQ8WveFDTBiKMkXyJpeRbpIToRnZIma/yGNVnaQ3LsBGaOgfRpwmN+A5DnePIW8QwsXk8hpblxi0Wh34V0UwHlu4fN6ckUCsy34sMUBQ40pD/ViD1Erud3KPpr9QSwMEFAAAAAgAVWVkXfllpXCuAAAAkwEAABoAAAB4bC9fcmVscy93b3JrYm9vay54bWwucmVsc62QOw6DMAyGrxLlABgYOlQEli5d214gApMgIIns9HX7RpX6QGLo0Mnyb+vzJ1fNbZ7EBYkH75Qsslw2dXXASccUsB0Ci7ThWEkbY9gCcGtx1pz5gC5Nek+zjqklA0G3ozYIZZ5vgL4ZcskU+05J2neFFKd7wF/Yvu+HFne+Pc/o4soJuHoa2SLGBNVkMCr5jhiepcgSVcK6TPlPGbaasDtGGpzhj9AifsnA4t31A1BLAwQUAAAACABVZWRd4iX/UIcAAADFAAAAFAAAAHhsL3NoYXJlZFN0cmluZ3MueG1sZY5BCsIwEEWvUrK3U124kDR10514h6EdTSCThMwoPb4RF4Iu33vw+XbaOHZPqhJyGs2+H8zkrIh2zScZjVctJwBZPDFKnwulVm65MmrDegcplXAVT6Qc4TAMR2AMybSZ4Ky6K3KyoM7Cmz9u3pUs+mejYHd5pPU3UAtn2pBLpH7J/O3QrroXUEsDBBQAAAAIAFVlZF1AwpRlmQAAABcBAAAYAAAAeGwvd29ya3NoZWV0cy9zaGVldDEueG1sXY9RCsMgDECvIh6gsQ72MaxlYxeRzq1lVUsi7Y6/rAyR/iV5yUti+k+YxeqRphQ72TZK9tZsCd80ep8F00idHHNeLgA0jD44atLiI5NnwuAyp/gCWtC7xz4UZtBKnSG4KUpr9trdZWcNpk0gb+Hq8AuurRS5k8T5apWB1RoY/uxWs7YwYEcR6SLSVbM+iGp2Ooigug7K2/YLUEsBAhQAFAAAAAgAVWVkXfw+kDb2AAAAkwIAABMAAAAAAAAAAAAAAIABAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAAUAAAACABVZWRdS4OjOpYAAAAFAQAACwAAAAAAAAAAAAAAgAEnAQAAX3JlbHMvLnJlbHNQSwECFAAUAAAACABVZWRdO40yhaQAAAD6AAAADwAAAAAAAAAAAAAAgAHmAQAAeGwvd29ya2Jvb2sueG1sUEsBAhQAFAAAAAgAVWVkXfllpXCuAAAAkwEAABoAAAAAAAAAAAAAAIABtwIAAHhsL19yZWxzL3dvcmtib29rLnhtbC5yZWxzUEsBAhQAFAAAAAgAVWVkXeIl/1CHAAAAxQAAABQAAAAAAAAAAAAAAIABnQMAAHhsL3NoYXJlZFN0cmluZ3MueG1sUEsBAhQAFAAAAAgAVWVkXUDClGWZAAAAFwEAABgAAAAAAAAAAAAAAIABVgQAAHhsL3dvcmtzaGVldHMvc2hlZXQxLnhtbFBLBQYAAAAABgAGAIcBAAAlBQAAAAA=";
    await box.getByLabel("Choose a file").setInputFiles({ name: "gaster.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(xlsx, "base64") });
    await expect(box.getByText("1 guests found")).toBeVisible();
    await box.getByRole("button", { name: "Add 1 guests" }).click();
    await expect(list.getByText("Elsa Lund").locator("visible=true").first()).toBeVisible();
    await expect(list.getByText("elsa@example.com")).toBeVisible();
    await box.getByLabel("Choose a file").setInputFiles({ name: "old.xls", mimeType: "application/vnd.ms-excel", buffer: Buffer.from("x") });
    await expect(box.getByRole("alert")).toContainText("old Excel format");

    const seating = page.getByRole("region", { name: "Seating" });
    await seating.getByLabel("The table's name").fill("Långbordet");
    await seating.getByLabel("Places").fill("1");
    await seating.getByRole("button", { name: "Add a table" }).click();
    await expect(seating.getByRole("heading", { name: "Långbordet" })).toBeVisible();
    await seating.getByLabel("Saga's table").selectOption({ label: "Långbordet" });
    await expect(seating.getByText("1 of 1")).toBeVisible();
    await seating.getByLabel("Nils's table").selectOption({ label: "Långbordet" });
    await expect(seating.getByRole("alert")).toContainText("1 too many");

    await page.getByRole("button", { name: /^\d\s?The party$/ }).click();
    await expect(page.getByRole("heading", { name: "Have fun!" })).toBeVisible();
    const check = page.getByRole("region", { name: "A last check" });
    await expect(check.getByText("3 guests haven't replied")).toBeVisible();
    await expect(check.getByText("1 guests without a table")).toBeVisible();
    await check.getByRole("listitem").filter({ hasText: "3 guests haven't replied" }).getByRole("button").click();
    await expect(page.getByRole("region", { name: "The party day's portal" })).toBeVisible();
  } finally {
    await adminApi.delete(`/api/parties/${party.id}`);
  }
});

// The check-in: a thumb down with a message changes the reply; and the food and the speech on the way.
test("the guest's menu, speech and check-in", async ({ adminPage: page, adminApi, browser }) => {
  const at = Date.now() + 30 * 86_400_000;
  const party = await (await adminApi.post("/api/parties", { data: { title: unique("Checkinfest"), kind: "party", bring: "none", starts_at: new Date(at).toISOString(), ends_at: new Date(at + 7_200_000).toISOString() } })).json();
  const token: string = (await (await adminApi.get(`/api/parties/${party.id}`)).json()).link.split("/").pop();
  try {
    await page.goto(`/parties?id=${party.id}`);
    const options = page.getByRole("region", { name: "For the guests" });
    await options.getByLabel("Add a dish").fill("Vegetariskt");
    await options.getByRole("button", { name: "Add a dish" }).click();
    await expect(options.getByRole("listitem").filter({ hasText: "Vegetariskt" })).toBeVisible();
    await options.getByRole("checkbox", { name: /sign up for a speech/ }).click();
    await expect(options.getByRole("checkbox", { name: /sign up for a speech/ })).toBeChecked();
    await options.getByLabel("Parking").fill("Bakom huset");
    await options.getByRole("button", { name: "Save" }).click();
    await expect(options.getByRole("status")).toHaveText("Saved");
    await page.getByRole("region", { name: "Details" }).getByRole("checkbox", { name: "Check-in" }).click();
    await expect(page.getByRole("region", { name: "Details" }).getByRole("checkbox", { name: "Check-in" })).toBeChecked();

    const guest = await browser.newContext();
    const g = await guest.newPage();
    await g.goto(`/party/${token}`);
    await expect(g.getByText("Bakom huset")).toBeVisible();
    const reply = g.getByRole("region", { name: "Will you come?" });
    await reply.getByLabel("First name").fill("Saga");
    await reply.getByLabel("What would you like to eat?").selectOption({ label: "Vegetariskt" });
    await reply.getByLabel("Wants to give a speech").check();
    await reply.getByRole("button", { name: "Send the reply" }).click();
    await expect(g.getByRole("region", { name: "Your reply" })).toContainText("Saga");

    await adminApi.put(`/api/parties/${party.id}`, { data: { checkin_at: new Date(Date.now() - 60_000).toISOString() } });
    await g.reload();
    const checkin = g.locator("section").filter({ hasText: "Are you ready?" });
    await expect(checkin.getByText("Saga, you're signed up.")).toBeVisible();
    await expect(g.getByRole("region", { name: "Will you come?" })).toHaveCount(0);
    await checkin.getByRole("radio", { name: "I can't come" }).click();
    await checkin.getByLabel(/What's happened/).fill("Sjuk tyvärr");
    await checkin.getByRole("button", { name: "Send" }).click();
    await expect(g.getByRole("status").filter({ hasText: "we've got it" })).toBeVisible();
    await expect(checkin.getByText("you've said you can't come")).toBeVisible();
    await guest.close();

    await page.reload();
    await page.getByRole("button", { name: /^\d\s?Guests$/ }).click();
    const list = page.getByRole("region", { name: "Guests", exact: true });
    await expect(list.getByText("Sjuk tyvärr")).toBeVisible();
    await expect(page.getByRole("region", { name: "The food" })).toContainText("Vegetariskt");
  } finally {
    await adminApi.delete(`/api/parties/${party.id}`);
  }
});

// A toastmaster's own link: the party's planning without an account, the plan kept from the host, and
// the papers to print.
test("a toastmaster plans the party and keeps it from the host", async ({ adminPage: page, adminApi, browser }) => {
  const at = Date.now() + 30 * 86_400_000;
  const title = unique("Fyrtioårsfest");
  const party = await (await adminApi.post("/api/parties", { data: { title, kind: "party", starts_at: new Date(at).toISOString(), ends_at: new Date(at + 7_200_000).toISOString() } })).json();
  try {
    await page.goto(`/parties?id=${party.id}`);
    await expect(page.getByRole("button", { name: /The plan$/ })).toHaveCount(0);
    const helpers = page.getByRole("region", { name: "Helpers from outside" });
    await helpers.getByLabel("Name").fill("Lars");
    await helpers.getByLabel("The link ends").selectOption("7");
    await helpers.getByRole("button", { name: "Invite" }).click();
    await expect(helpers.getByRole("listitem").filter({ hasText: "Lars" })).toBeVisible();
    const detail = await (await adminApi.get(`/api/parties/${party.id}`)).json();
    const { link } = await (await adminApi.post(`/api/parties/${party.id}/helpers/${detail.helpers[0].id}/link`)).json();
    await expect(page.getByRole("button", { name: /^\d\s?The plan$/ })).toBeVisible();

    const outside = await browser.newContext();
    const l = await outside.newPage();
    await l.goto(link.replace(/^https?:\/\/[^/]+/, ""));
    await expect(l.getByText(/Hi Lars!/)).toBeVisible();
    await expect(l.getByRole("heading", { level: 1, name: new RegExp(title) })).toBeVisible();
    await expect(l.getByText("Remove the party")).toHaveCount(0);
    await l.getByRole("button", { name: /^\d\s?The plan$/ }).click();
    const plan = l.getByRole("region", { name: "The plan", exact: true });
    await plan.getByLabel("At", { exact: true }).fill("19:30");
    await plan.getByLabel("Title", { exact: true }).fill("Överraskningstal");
    await plan.getByLabel("Who", { exact: true }).fill("Mamma");
    await plan.getByRole("button", { name: "Add" }).click();
    await expect(plan.getByRole("listitem").filter({ hasText: "Överraskningstal" })).toBeVisible();

    // The run sheet, in its own tab with the plan on it.
    const [sheet] = await Promise.all([outside.waitForEvent("page"), plan.getByRole("link", { name: "Run sheet" }).click()]);
    await expect(sheet.getByText("Överraskningstal")).toBeVisible();
    await sheet.close();

    // Not yet kept: the host sees it. Kept: greyed out, and none of it comes.
    await page.reload();
    await page.getByRole("button", { name: /^\d\s?The plan$/ }).click();
    await expect(page.getByText("Överraskningstal")).toBeVisible();
    const keep = l.getByRole("region", { name: "Keep the plan from" });
    await keep.getByRole("checkbox").first().click();
    await expect(keep.getByRole("checkbox").first()).toBeChecked();
    await page.reload();
    await expect(page.getByRole("button", { name: /^\d\s?The plan$/ })).toBeDisabled();
    await expect(page.getByText("Överraskningstal")).toHaveCount(0);
    const seen = await (await adminApi.get(`/api/parties/${party.id}`)).json();
    expect(JSON.stringify(seen)).not.toContain("Överraskningstal");
    await outside.close();
  } finally {
    await adminApi.delete(`/api/parties/${party.id}`);
  }
});

// The wording of a mail, and suppliers into the budget.
test("the mails' wording and the suppliers", async ({ adminPage: page, adminApi }) => {
  const at = Date.now() + 30 * 86_400_000;
  const party = await (await adminApi.post("/api/parties", { data: { title: unique("Mejlfest"), kind: "party", starts_at: new Date(at).toISOString(), ends_at: new Date(at + 7_200_000).toISOString() } })).json();
  try {
    await page.goto(`/parties?id=${party.id}`);
    await page.getByRole("button", { name: /^\d\s?Sending out$/ }).click();
    const mails = page.getByRole("region", { name: "The mails" });
    await mails.getByRole("button", { name: "Open The invitation" }).click();
    await mails.getByRole("textbox", { name: "Text", exact: true }).fill("Hej {name}, kom på fest!");
    // The real mail, in a frame of its own.
    await expect(mails.frameLocator('iframe[title="How it looks"]').getByText("Hej Anna, kom på fest!")).toBeVisible();
    await mails.getByRole("button", { name: "Save", exact: true }).click();
    await expect(mails.getByRole("status")).toHaveText("Saved");
    await expect(mails.getByRole("listitem").filter({ hasText: "The invitation" }).getByText("Your wording")).toBeVisible();
    const seen = await (await adminApi.get(`/api/parties/${party.id}`)).json();
    expect(seen.mail_templates.find((m: { kind: string }) => m.kind === "invited").text).toBe("Hej {name}, kom på fest!");

    await page.getByRole("button", { name: /^\d\s?Budget$/ }).click();
    const vendors = page.getByRole("region", { name: "Suppliers" });
    await vendors.getByLabel("Search for").fill("catering");
    await vendors.getByRole("button", { name: "Search", exact: true }).click();
    await expect(vendors.getByText("The server's search is off").or(vendors.getByLabel("What was found")).or(vendors.getByText("Nothing found.")).or(vendors.getByRole("alert"))).toBeVisible();
    await vendors.getByLabel("Name").fill("DJ Saga");
    await vendors.getByLabel("Amount").fill("4000");
    await vendors.getByRole("button", { name: "Add", exact: true }).click();
    await vendors.getByRole("button", { name: /into the budget/ }).click();
    await expect(vendors.getByText("In the budget")).toBeVisible();
    await expect(page.getByText("DJ Saga").first()).toBeVisible();
  } finally {
    await adminApi.delete(`/api/parties/${party.id}`);
  }
});

// The papers from the seating.
test("the seating's papers", async ({ adminPage: page, adminApi }) => {
  const at = Date.now() + 30 * 86_400_000;
  const party = await (await adminApi.post("/api/parties", { data: { title: unique("Bordsfest"), kind: "party", page_theme: "glamour", starts_at: new Date(at).toISOString(), ends_at: new Date(at + 7_200_000).toISOString() } })).json();
  await adminApi.put(`/api/parties/${party.id}`, { data: { tables: [{ id: "a", name: "Långbordet", seats: 8 }] } });
  const detail = await (await adminApi.post(`/api/parties/${party.id}/guests`, { data: { first_name: "Saga", last_name: "Berg", coming: true } })).json();
  await adminApi.put(`/api/parties/${party.id}/guests/${detail.guests[0].id}/table`, { data: { table_id: "a" } });
  try {
    await page.goto(`/party-print/${party.id}/tables`);
    await expect(page.getByRole("heading", { name: "Långbordet" })).toBeVisible();
    await expect(page.getByText("Saga Berg")).toBeVisible();
    await page.goto(`/party-print/${party.id}/cards`);
    await expect(page.getByText("Saga Berg")).toBeVisible();
    await expect(page.getByText("Långbordet")).toBeVisible();
  } finally {
    await adminApi.delete(`/api/parties/${party.id}`);
  }
});

// A couple who both registered: put together, nobody's counted twice, and one answers for both.
test("guests who belong together", async ({ adminPage: page, adminApi, browser }) => {
  const at = Date.now() + 30 * 86_400_000;
  const party = await (await adminApi.post("/api/parties", { data: { title: unique("Parfest"), kind: "party", bring: "one", starts_at: new Date(at).toISOString(), ends_at: new Date(at + 7_200_000).toISOString() } })).json();
  const token: string = (await (await adminApi.get(`/api/parties/${party.id}`)).json()).link.split("/").pop();
  await adminApi.post(`/api/party/${token}/reply`, { data: { first_name: "Saga", last_name: "Berg", coming: true, companions: [{ first_name: "Nils" }] } });
  const added = await (await adminApi.post(`/api/parties/${party.id}/guests`, { data: { first_name: "Nils", last_name: "Ek", invited: true } })).json();
  const nils = added.guests.find((g: { first_name: string }) => g.first_name === "Nils");
  try {
    await page.goto(`/parties?id=${party.id}`);
    await page.getByRole("button", { name: /^\d\s?Guests$/ }).click();
    const list = page.getByRole("region", { name: "Guests", exact: true });
    await expect(list.getByTestId("capacity")).toContainText("2 coming, 1 haven't replied – at most 4");
    await list.getByRole("list", { name: "Maybe the same person twice" }).getByRole("button", { name: "Put them together" }).click();
    await expect(list.getByTestId("capacity")).toContainText("1 coming, 1 haven't replied – at most 2");
    await expect(list.getByText(/Together with Nils Ek/)).toBeVisible();
    await expect(list.getByRole("list", { name: "Maybe the same person twice" })).toHaveCount(0);

    const { link } = await (await adminApi.post(`/api/parties/${party.id}/guests/${nils.id}/link`)).json();
    const guest = await browser.newContext();
    const g = await guest.newPage();
    await g.goto(link.replace(/^https?:\/\/[^/]+/, ""));
    const reply = g.getByRole("region", { name: "Will you come?" });
    await expect(reply.getByText(/signed up together with Saga/)).toBeVisible();
    await expect(reply.getByRole("button", { name: /\+1/ })).toHaveCount(0);
    await reply.getByRole("button", { name: /reply/ }).last().click();
    await expect(g.getByRole("status").filter({ hasText: "see you there" })).toBeVisible();
    await guest.close();

    await page.reload();
    await page.getByRole("button", { name: /^\d\s?Guests$/ }).click();
    await expect(page.getByRole("region", { name: "Guests", exact: true }).getByTestId("capacity")).toContainText("2 coming, 0 haven't replied – at most 2");
  } finally {
    await adminApi.delete(`/api/parties/${party.id}`);
  }
});

// A save-the-date isn't mailed: a ready message to share, in the hosts' own words if they like.
test("a save-the-date goes out by sharing a message", async ({ adminPage: page, adminApi }) => {
  const at = Date.now() + 30 * 86_400_000;
  const title = unique("Delafest");
  const party = await (await adminApi.post("/api/parties", { data: { title, kind: "party", place: "Folkets hus", starts_at: new Date(at).toISOString(), ends_at: new Date(at + 7_200_000).toISOString() } })).json();
  await adminApi.put(`/api/parties/${party.id}`, { data: { phase: "save" } });
  try {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(`/parties?id=${party.id}`);
    await page.getByRole("button", { name: /^\d\s?Sending out$/ }).click();
    const share = page.getByRole("region", { name: /^Share/ });
    const looks = share.getByLabel("How it looks");
    await expect(looks).toContainText("Save the date!");
    await expect(looks).toContainText(title);
    await expect(looks).toContainText("Folkets hus");
    await expect(looks).toContainText("/party/");
    await expect(share.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=.*Save%20the%20date/);
    await expect(share.getByRole("link", { name: "SMS" })).toHaveAttribute("href", /^sms:/);
    await share.getByRole("button", { name: "Copy the message" }).click();
    await expect(share.getByRole("status")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(title);

    // In their own words: kept, and a message without the link says so.
    await share.getByLabel("The message").fill("Boka {when}!");
    await expect(share.getByRole("alert")).toBeVisible();
    await share.getByLabel("The message").fill("Boka {when}! {link}");
    await share.getByRole("button", { name: "Save", exact: true }).click();
    await expect(share.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    const seen = await (await adminApi.get(`/api/parties/${party.id}`)).json();
    expect(seen.share_texts.save).toBe("Boka {when}! {link}");

    // Not among the mails.
    await expect(page.getByRole("region", { name: "The mails" }).getByRole("button", { name: "Open Save the date" })).toHaveCount(0);
  } finally {
    await adminApi.delete(`/api/parties/${party.id}`);
  }
});
