import { test, expect, unique } from "../fixtures";

// 3.4.0: a party – created by an adult, replied to by a guest without an account (with a +1), and
// the reply with the allergies gathered for the hosts.
test("a party: the invitation, a guest's reply and the planning", async ({ adminPage: page, adminApi, browser }) => {
  const title = unique("Majas kalas");
  await page.goto("/parties");
  await page.getByRole("button", { name: "New party" }).click();
  const form = page.getByRole("region", { name: "New party" });
  await form.getByLabel("Name").fill(title);
  await form.getByLabel("Guests may bring a +1").check();
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
    await expect(g.getByText("🦁")).toBeVisible();
    // No e-mail on this server: no address is asked for.
    await expect(g.getByLabel("E-mail (optional)")).toHaveCount(0);
    const reply = g.getByRole("region", { name: "Will you come?" });
    await reply.getByLabel("First name").fill("Saga");
    await reply.getByLabel("Last name").fill("Berg");
    await reply.getByLabel("Allergies or special diet").fill("Nuts");
    await reply.getByLabel("I'm bringing a +1").check();
    await reply.getByLabel("+1's first name").fill("Ella");
    await reply.getByLabel("+1's last name").fill("Berg");
    await reply.getByRole("button", { name: "Send the reply" }).click();
    await expect(g.getByRole("status")).toContainText("see you there");
    await expect(g.getByText(/2 coming: Saga Berg, Ella Berg/)).toBeVisible();
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
  await expect(form.getByLabel("One reply per family – how many adults and children are coming")).toBeChecked();
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
    await reply.getByLabel("Adults").fill("2");
    await reply.getByLabel("Children").fill("1");
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
    await expect(page.getByRole("region", { name: "Guests" }).getByText("2 adults, 1 children")).toBeVisible();
  } finally {
    await adminApi.delete(`/api/parties/${party.id}`);
  }
});
