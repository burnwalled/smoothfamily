import { test, expect, unique } from "../fixtures";

// The household's subscriptions: added by hand, suggested from a bank file, with a login from the vault.
test("subscriptions: by hand, from the bank and with a vault login", async ({ adminPage: page, adminApi }) => {
  const name = unique("Streamia");
  const merchant = unique("BAHNHOFEN").replace(/\W/g, "").toUpperCase();
  const login = await (await adminApi.post("/api/vault/logins", { data: { title: name, url: "https://example.com", username: "anna", password: "hemligt-lösen" } })).json();
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

    const view = await (await adminApi.get("/api/subscriptions")).json();
    await expect.poll(async () => (await page.getByTestId("per-month").innerText()).replace(/[^0-9]/g, "")).toBe(String(Math.round(view.per_month)));

    // It fits a phone, however long the name.
    await page.setViewportSize({ width: 390, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  } finally {
    for (const item of (await (await adminApi.get("/api/subscriptions")).json()).items) await adminApi.delete(`/api/subscriptions/${item.id}`);
    await adminApi.delete(`/api/vault/logins/${login.id}`);
  }
});
