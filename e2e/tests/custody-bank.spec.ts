import { test, expect, unique } from "../fixtures";

// 2.7.5: a child with two homes – the schedule, a holiday, and the other parent's link that shows
// only this child.
test("two homes and the other parent's link", async ({ adminPage: page, adminApi, browser }, info) => {
  const name = unique("Klara");
  const child = await (await adminApi.post("/api/family/members", { data: { display_name: name, username: `k${Date.now().toString(36)}`, password: "1234", role: "child" } })).json();
  const context = await browser.newContext({ ...info.project.use, storageState: undefined });
  try {
    // Set up on the child's own page in the family's settings (3.0.4).
    await page.goto(`/settings/members/${child.id}`);
    const homes = page.locator("#two-homes");
    await homes.getByRole("button", { name }).click();
    const card = homes.getByRole("region", { name });
    await card.getByLabel("The other home", { exact: true }).fill("Dad's");
    await card.getByRole("button", { name: "Save" }).click();
    await expect(card).toContainText(/Here now|At Dad's now/);

    await card.getByLabel("Note", { exact: true }).fill("Christmas");
    await card.getByRole("button", { name: "Add" }).click();
    await expect(card).toContainText("Christmas");

    await card.getByLabel("Who it is for").fill("Erik");
    await card.getByRole("button", { name: "Make the link" }).click();
    const url = await card.getByLabel("Link for the other parent").inputValue();

    const other = await context.newPage();
    await other.goto(new URL(url, "http://x").pathname);
    await expect(other.getByRole("region", { name: "Two homes" })).toContainText(name);
    // Only this child's emergency card.
    await expect(other.getByRole("region", { name })).toBeVisible();
    await expect(other.getByRole("region", { name: "Kim Kid" })).toHaveCount(0);
  } finally {
    await context.close();
    await adminApi.delete(`/api/custody/${child.id}`);
    await adminApi.delete(`/api/family/members/${child.id}`);
  }
});

// #47: the bank's CSV – a suggestion for a known merchant, chosen and imported, never twice.
test("importing the bank's CSV", async ({ adminPage: page, adminApi }) => {
  const car = await (await adminApi.post("/api/vehicles", { data: { name: unique("Car"), registration: "BANK1" } })).json();
  const text = `CIRCLE K ${Date.now().toString(36).toUpperCase()}`;
  const csv = `Datum;Text;Belopp;Saldo\n2026-10-20;${text};-812,50;5000,00\n2026-10-19;LÖN;30000,00;5812,50\n`;
  try {
    await page.goto("/bank-import");
    await page.locator('input[type="file"]').setInputFiles({ name: "export.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf-8") });
    const row = page.getByRole("listitem").filter({ hasText: text });
    await expect(row).toContainText("812.50");
    await row.getByLabel(`Where ${text} goes`).selectOption({ label: `🚗 ${car.name}` });
    await expect(row.getByLabel("Category")).toHaveValue("fuel");
    await page.getByRole("button", { name: "Import 1" }).click();
    await expect(page.getByText("1 costs imported")).toBeVisible();
    const costs = await (await adminApi.get(`/api/vehicles/expenses?vehicle_id=${car.id}`)).json();
    expect(costs.map((c: { amount: number; category: string }) => [c.amount, c.category])).toEqual([[812.5, "fuel"]]);

    // The same file again: nothing new.
    await page.locator('input[type="file"]').setInputFiles({ name: "export.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf-8") });
    await expect(page.getByText("Nothing new in this file.")).toBeVisible();
  } finally {
    await adminApi.delete(`/api/vehicles/${car.id}`);
  }
});

// 2.8.3: the other parent gets an account of their own kind, sees only the child, and writes.
test("the other parent's own account", async ({ adminPage: page, adminApi, browser }, info) => {
  const name = unique("Klara");
  const child = await (await adminApi.post("/api/family/members", { data: { display_name: name, username: `k${Date.now().toString(36)}`, password: "1234", role: "child" } })).json();
  await adminApi.put(`/api/custody/${child.id}`, { data: { other_home: "Dad's", pattern: "week", anchor_date: new Date().toISOString().slice(0, 10), handover_list: true } });
  const context = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } });
  try {
    await page.goto(`/settings/members/${child.id}`);
    const box = page.getByRole("region", { name: "The other parent" });
    await box.getByLabel("Their name").fill("Erik");
    await box.getByRole("button", { name: "Invite" }).click();
    const url = await box.getByLabel("Invitation link").inputValue();

    const erik = await context.newPage();
    await erik.goto(new URL(url).pathname);
    await erik.getByLabel("Username").fill(`erik${Date.now().toString(36)}`);
    await erik.getByLabel("Password").fill("longpass1");
    await erik.getByRole("button", { name: "Create my account" }).click();
    await expect(erik).toHaveURL(/\/coparent$/);
    await expect(erik.getByRole("heading", { name: "Hi Erik!" })).toBeVisible();
    await expect(erik.getByRole("heading", { name, exact: true }).first()).toBeVisible();
    await erik.getByPlaceholder("Write about the child …").fill("Can I take her Friday?");
    await erik.getByRole("button", { name: "Send" }).click();
    await expect(erik.getByText("Can I take her Friday?")).toBeVisible();

    // The family's adults see it and answer.
    await page.reload();
    const row = box.getByRole("listitem").filter({ hasText: "Erik" }).filter({ hasText: name });
    await row.getByRole("button", { name: "Messages" }).click();
    await expect(row.getByText("Can I take her Friday?")).toBeVisible();
    await row.getByPlaceholder("Write to Erik").fill("Sure!");
    await row.getByRole("button", { name: "Send" }).click();
    await erik.reload();
    await expect(erik.getByText("Sure!")).toBeVisible();

    // Closed: they're out at once.
    page.once("dialog", (d) => d.accept());
    await row.getByRole("button", { name: "Close access" }).click();
    await erik.reload();
    await expect(erik.getByRole("heading", { name: "Sign in as the other parent" })).toBeVisible();
  } finally {
    await context.close();
    await adminApi.delete(`/api/custody/${child.id}`);
  }
});
