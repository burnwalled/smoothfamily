import { test, expect, openFromMenu, unique } from "../fixtures";

// 2.8.0: the menu has hubs; an app's siblings are tabs at the top of the page.
test("a hub opens its first app and shows the others as tabs", async ({ adminPage: page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await openFromMenu(page, "/tasks");
  await expect(page).toHaveURL(/\/tasks$/);
  const tabs = page.locator('main nav a[href="/allowance"]');
  await expect(tabs).toBeVisible();
  await tabs.click();
  await expect(page).toHaveURL(/\/allowance$/);
  // The hub stays marked in the sidebar while on a sibling app (on phones Points is under More).
  if (info.project.name !== "phone") await expect(page.locator('nav a[href="/tasks"][aria-current="page"]:visible')).toHaveCount(1);
});

// 2.9.0: the emergency cards aren't in the menu – the family's settings keep them, and each
// member their own in the profile.
test("my emergency card is in the profile, not the menu", async ({ adminPage: page }) => {
  await page.goto("/profile");
  await expect(page.locator('nav a[href="/emergency"]')).toHaveCount(0);
  const card = page.getByRole("region", { name: "Emergency card" });
  await card.getByRole("button", { name: /Edit the card for/ }).click();
  const allergies = card.getByLabel("Allergies");
  const before = await allergies.inputValue();
  await allergies.fill("Nuts (e2e)");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Nuts (e2e)")).toBeVisible();
  await card.getByRole("button", { name: /Edit the card for/ }).click();
  await card.getByLabel("Allergies").fill(before);
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Nuts (e2e)")).toHaveCount(0);
});

// Three levels of settings: my profile in tabs, the family's settings, the server.
test("the profile is split into tabs", async ({ adminPage: page }) => {
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Password" })).toHaveCount(0);
  await page.getByRole("button", { name: "Security and connections" }).click();
  await expect(page.getByRole("heading", { name: "Password" })).toBeVisible();
  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Morning summary" })).toBeVisible();
});

// 2.8.2: the family's settings have their pages as tabs on top; a kitchen display picks its widgets.
test("family settings tabs and a kitchen display's widgets", async ({ adminPage: page, adminApi }) => {
  await page.goto("/settings/everyday");
  const tabs = page.getByRole("navigation", { name: "Family settings" });
  for (const name of ["Family members", "Everyday", "Kitchen display", "Sharing and connections", "Security and data"]) {
    await expect(tabs.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await tabs.getByRole("link", { name: "Kitchen display", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/kiosk$/);
  const name = unique("Widget test");
  const screen = await (await adminApi.post("/api/kiosks", { data: { name } })).json();
  try {
    await page.reload();
    const row = page.getByRole("listitem").filter({ hasText: name });
    await row.getByRole("checkbox", { name: "Weather", exact: true }).uncheck();
    await expect.poll(async () => (await (await adminApi.get("/api/kiosks")).json()).find((s: { id: string }) => s.id === screen.id).widgets).not.toContain("weather");
  } finally {
    await adminApi.delete(`/api/kiosks/${screen.id}`);
  }
});

// 2.8.4: whose own calendar a feed is; my calendar in my phone.
test("a member's own calendar and the phone subscription", async ({ adminPage: page }) => {
  await page.goto("/settings/everyday");
  await expect(page.getByLabel("Whose calendar is it?")).toBeVisible();
  await page.goto("/profile?tab=security");
  const box = page.getByRole("region", { name: "My calendar in my phone" });
  await expect(box.getByLabel("Your personal calendar link")).toHaveValue(/\/api\/calendar\/ical\/[\w-]+\.ics$/);
  await expect(box.getByRole("link", { name: "Add to Calendar" })).toHaveAttribute("href", /^webcal:/);
});
