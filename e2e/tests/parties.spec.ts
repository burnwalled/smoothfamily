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

    // A guest, without an account.
    const guest = await browser.newContext();
    const g = await guest.newPage();
    await g.goto(link.replace(/^https?:\/\/[^/]+/, ""));
    await expect(g.getByRole("heading", { name: title })).toBeVisible();
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
