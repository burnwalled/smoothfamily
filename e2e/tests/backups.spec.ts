import { test, expect } from "../fixtures";

// #59: the server admin makes a real backup (pg_dump in the test stack) and exports the family.
test("back up now and export the family's data", async ({ adminPage: page }) => {
  // Backups concern the whole server: they live on the server page.
  await page.goto("/server");
  await page.getByRole("button", { name: "Backups and moving" }).click();
  await page.getByRole("button", { name: "Back up now" }).click();
  // The newest backup appears with both files, ready to download.
  await expect(page.getByRole("link", { name: /^Database · / }).first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("link", { name: /^Photos and files · / }).first()).toBeVisible();

  await page.goto("/settings/storage");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download all data" }).click();
  expect((await download).suggestedFilename()).toMatch(/^smooth-family-\d{8}\.zip$/);
});
