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
  const link = await page.getByLabel("The invitation link").inputValue();
  const party = (await (await adminApi.get("/api/parties")).json()).find((p: { title: string }) => p.title === title);
  try {
    // The checklist it started with.
    await page.getByRole("button", { name: "To do" }).click();
    await expect(page.getByRole("checkbox", { name: "Share the invitation" })).toBeVisible();

    // The invitation page's look: the jungle.
    await page.getByRole("button", { name: "Invitation" }).click();
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
    await page.getByRole("button", { name: "Guests" }).click();
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
  const link = await page.getByLabel("The invitation link").inputValue();
  const party = (await (await adminApi.get("/api/parties")).json()).find((p: { title: string }) => p.title === title);
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
    await page.getByRole("button", { name: "Guests" }).click();
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
  const link = await page.getByLabel("The invitation link").inputValue();
  const party = (await (await adminApi.get("/api/parties")).json()).find((p: { title: string }) => p.title === title);
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
    await page.getByRole("button", { name: "Guests" }).click();
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
    await page.getByRole("button", { name: "Poster" }).click();
    const parts = page.getByRole("region", { name: "The poster's parts" });
    // The welcome line: a text of our own, centred, in the gala handwriting.
    await parts.getByRole("button", { name: /^Text Welcome to/ }).click();
    const settings = page.getByRole("region", { name: "The part's settings" });
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
    await settings.getByLabel("Calendar file (.ics)").uncheck();
    await settings.getByLabel("Apple Calendar").uncheck();
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
    await expect(g.getByRole("link", { name: "Calendar file (.ics)" })).toHaveCount(0);
    await guest.close();
  } finally {
    await adminApi.delete(`/api/parties/${made.id}`);
  }
});
