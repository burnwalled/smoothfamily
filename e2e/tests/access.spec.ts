import { test, expect, KID } from "../fixtures";

// #45: the family admin turns an app off for a member; it leaves their menu and can't be opened.
test("the admin turns off an app for a child", async ({ adminPage, kidPage, adminApi }) => {
  const members = await (await adminApi.get("/api/family/members")).json();
  const kid = members.find((m: { username: string }) => m.username === KID.username);
  try {
    // On the child's own page (3.0.4).
    await adminPage.goto("/settings/members");
    await adminPage.getByRole("link", { name: new RegExp(`@${KID.username}`) }).click();
    // From the cache (#76): the box follows the change a moment after the click, so wait for it.
    const chat = adminPage.getByRole("region", { name: /^Apps \d+\/21$/ }).getByRole("checkbox", { name: "Chat" });
    await chat.click();
    await expect(chat).not.toBeChecked();
    // Children get 18 of 21 apps by default (no Property, Vehicles or Documents); Chat is now off too.
    await expect(adminPage.getByRole("region", { name: "Apps 17/21" })).toBeVisible();

    await kidPage.goto("/");
    await expect(kidPage.locator('nav a[href="/chat"]')).toHaveCount(0);
    await kidPage.goto("/chat");
    await expect(kidPage.getByText("Not available for you")).toBeVisible();
    // Children don't get Vehicles by default.
    await kidPage.goto("/vehicles");
    await expect(kidPage.getByText("Not available for you")).toBeVisible();
  } finally {
    await adminApi.put(`/api/family/members/${kid.id}/apps`, { data: { apps: null } });
  }
});

// #79: family admin is split into pages with their own addresses.
test("family admin pages have their own addresses", async ({ adminPage: page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/settings\/members$/);
  await page.locator('main a[href="/settings/everyday"]').click();
  await expect(page.getByRole("heading", { name: /Calendar subscriptions/ })).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/everyday$/);
  await page.goto("/smarthome");
  await page.getByRole("link", { name: "Manage devices" }).click();
  await expect(page).toHaveURL(/\/settings\/smarthome$/);
});
