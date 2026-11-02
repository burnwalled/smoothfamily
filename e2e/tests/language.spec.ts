import { test, expect } from "../fixtures";

// #80: other languages are loaded on demand and the choice sticks after a reload.
test("switches the language and keeps it", async ({ adminPage: page, adminApi }) => {
  try {
    await page.goto("/profile");
    await page.locator("select").filter({ has: page.locator("option", { hasText: "Svenska" }) }).selectOption("sv");
    await expect(page.getByRole("heading", { name: "Profil", exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Profil", exact: true })).toBeVisible();
    await expect(page.locator('nav a[href="/"]:visible')).toContainText("Idag");
  } finally {
    await adminApi.patch("/api/auth/me", { data: { language: "en" } });
  }
});
