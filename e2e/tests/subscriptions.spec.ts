import { test, expect, unique } from "../fixtures";

// The household's subscriptions: added by hand, suggested from a bank file, with a login from the vault.
test("subscriptions: reminders come, and each adult chooses them", async ({ adminPage: page, adminApi }, info) => {
  test.skip(info.project.name !== "desktop" || new Date().getUTCHours() < 7);
  test.setTimeout(150_000);
  const name = unique("Bindning");
  const soon = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  await adminApi.post("/api/subscriptions", { data: { name, amount: 300, cancel_by: soon } });
  const passed = unique("Gammalt");
  await adminApi.post("/api/subscriptions", { data: { name: passed, amount: 10, cancel_by: "2020-01-01" } });
  try {
    // The server's own round, on the real database.
    await expect.poll(async () => JSON.stringify(await (await adminApi.get("/api/notifications")).json()), { timeout: 130_000, intervals: [5_000] }).toContain(name);

    await page.goto("/subscriptions");
    await expect(page.getByRole("listitem").filter({ has: page.locator("span.font-semibold", { hasText: passed }) })).toContainText("has passed");
    await page.getByText("Reminders", { exact: true }).click();
    const yearly = page.getByRole("checkbox", { name: "Yearly payments, 7 days before" });
    await expect(yearly).toBeChecked();
    await yearly.click();
    await expect(yearly).not.toBeChecked();
    await page.reload();
    await page.getByText("Reminders", { exact: true }).click();
    await expect(yearly).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Quarterly payments, 7 days before" })).toBeChecked();
    await yearly.click();
    await expect(yearly).toBeChecked();
  } finally {
    for (const item of (await (await adminApi.get("/api/subscriptions")).json()).items) await adminApi.delete(`/api/subscriptions/${item.id}`);
  }
});

test("subscriptions: by hand, from the bank and with a vault login", async ({ adminPage: page, adminApi }) => {
  const name = unique("Streamia");
  const merchant = unique("BAHNHOFEN").replace(/\W/g, "").toUpperCase();
  const login = await (await adminApi.post("/api/vault/logins", { data: { title: name, url: "https://example.com", username: "anna", password: "hemligt-lösen" } })).json();
  const created: string[] = [login.id];
  try {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/subscriptions");
    await page.getByRole("button", { name: "Add a subscription" }).click();
    const form = page.getByRole("form", { name: "Add a subscription" });
    await form.getByLabel("Name").fill(name);
    await form.getByLabel("What it costs").fill("120");
    await form.getByLabel("Login in the vault").selectOption({ label: name });
    await form.getByRole("button", { name: "Save" }).click();
    const list = page.getByRole("region", { name: "Subscriptions", exact: true });
    // By its title: every row's choice of login names the login too.
    const row = list.getByRole("listitem").filter({ has: page.locator("span.font-semibold", { hasText: name }) });
    await expect(row).toContainText("120");
    await expect(row).toContainText("anna");
    await row.getByRole("button", { name: `Copy the password for ${name}` }).click();
    await expect(row.getByText("Copied")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("hemligt-lösen");

    // A bank file: the recurring payment is suggested; the shop isn't.
    await page.goto("/bank-import");
    const csv = `Datum;Text;Belopp\n2026-07-25;${merchant};-399,00\n2026-08-25;${merchant};-399,00\n2026-09-25;${merchant};-399,00\n2026-09-02;ICA MAXI;-812,50\n`;
    await page.locator('input[type="file"]').setInputFiles({ name: "bank.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(page.getByRole("status").filter({ hasText: "possible subscriptions" })).toBeVisible();
    await page.getByRole("link", { name: "See them" }).click();
    const found = page.getByRole("region", { name: "Found in the bank's file" });
    const pretty = merchant.charAt(0) + merchant.slice(1).toLowerCase();
    await expect(found.getByText(pretty)).toBeVisible();
    await expect(found.getByText(/ICA/i)).toHaveCount(0);
    await found.getByRole("button", { name: `Add ${pretty}` }).click();
    await expect(list.getByRole("listitem").filter({ hasText: pretty })).toContainText("399");

    // What the file gave can be put right.
    await page.getByRole("button", { name: `Change ${pretty}` }).click();
    const change = page.getByRole("form", { name: "Change the subscription" });
    await change.getByLabel("Name").fill(`${pretty} fiber`);
    await change.getByRole("button", { name: "Save" }).click();
    await expect(list.getByRole("listitem").filter({ hasText: `${pretty} fiber` })).toContainText("399");
    await expect(row).toContainText("anna");

    // A new login, made right from the subscription: it lands in the vault and on the row.
    const madeRow = list.getByRole("listitem").filter({ has: page.locator("span.font-semibold", { hasText: `${pretty} fiber` }) });
    await madeRow.getByRole("combobox", { name: `Login for ${pretty} fiber` }).selectOption({ label: "+ New login" });
    const fresh = madeRow.getByRole("region", { name: "Add a login" });
    await expect(fresh.getByRole("textbox").first()).toHaveValue(`${pretty} fiber`);
    const madePassword = await fresh.locator("#new-login-password").inputValue();
    expect(madePassword.length).toBeGreaterThanOrEqual(20);
    await fresh.getByRole("textbox").nth(2).fill("fiber-kund");
    await fresh.getByRole("button", { name: "Save in the vault" }).click();
    await expect(fresh).toHaveCount(0);
    await expect(madeRow).toContainText("fiber-kund");
    await madeRow.getByRole("button", { name: `Copy the password for ${pretty} fiber` }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(madePassword);
    const vaulted = await (await adminApi.get("/api/vault/logins")).json();
    const made = vaulted.find((l: { username: string }) => l.username === "fiber-kund");
    expect(made.title).toBe(`${pretty} fiber`);
    made && created.push(made.id);

    // And while adding one: the new subscription comes with it.
    const third = unique("Musiken");
    await page.getByRole("button", { name: "Add a subscription" }).click();
    const again = page.getByRole("form", { name: "Add a subscription" });
    await again.getByLabel("Name").fill(third);
    await again.getByLabel("What it costs").fill("99");
    await again.getByLabel("Login in the vault").selectOption({ label: "+ New login" });
    const inForm = page.getByRole("region", { name: "Add a login" });
    await inForm.getByRole("textbox").nth(2).fill("musik-kund");
    await inForm.getByRole("button", { name: "Save in the vault" }).click();
    await expect(inForm).toHaveCount(0);
    await again.getByRole("button", { name: "Save" }).click();
    await expect(list.getByRole("listitem").filter({ has: page.locator("span.font-semibold", { hasText: third }) })).toContainText("musik-kund");
    const vaultedAgain = await (await adminApi.get("/api/vault/logins")).json();
    created.push(vaultedAgain.find((l: { username: string }) => l.username === "musik-kund").id);

    const view = await (await adminApi.get("/api/subscriptions")).json();
    await expect.poll(async () => (await page.getByTestId("per-month").innerText()).replace(/[^0-9]/g, "")).toBe(String(Math.round(view.per_month)));

    // It fits a phone, however long the name.
    await page.setViewportSize({ width: 390, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  } finally {
    for (const item of (await (await adminApi.get("/api/subscriptions")).json()).items) await adminApi.delete(`/api/subscriptions/${item.id}`);
    for (const id of created) await adminApi.delete(`/api/vault/logins/${id}`);
  }
});
