import { test, expect } from "../fixtures";

// 2.9.0: the backup key is made in the browser, saved by the admin, and the backups are sealed with
// it – checked against the newest backup without the key leaving the browser.
test("a backup key: made here, the backups sealed, the key checked", async ({ adminPage: page }) => {
  await page.goto("/server");
  await page.getByRole("button", { name: "Backups and moving" }).click();
  const card = page.getByRole("region", { name: "Backup key" });
  await card.getByRole("button", { name: /Make a backup key|Make a new key/ }).click();
  const key = (await card.locator("code").textContent())!.trim();
  expect(key).toMatch(/^SFKEY(-[A-Z2-7]{5}){11}$/);
  const use = card.getByRole("button", { name: "Seal backups with this key" });
  await expect(use).toBeDisabled();
  await card.getByLabel("Type the key's last five characters").fill(key.slice(-5).toLowerCase());
  await use.click();
  await expect(card.getByText(/Backups are sealed \(key/)).toBeVisible();

  await page.getByRole("button", { name: "Back up now" }).click();
  await expect(page.getByRole("link", { name: /^Database · / }).first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("link", { name: /^Photos and files · / }).first()).toBeVisible({ timeout: 20000 });
  await page.reload();
  await page.getByRole("button", { name: "Backups and moving" }).click();
  await card.getByRole("button", { name: "Check my key" }).click();
  await card.getByLabel("Your backup key").fill("SFKEY-AAAAA-AAAAA");
  await card.getByRole("button", { name: "Check", exact: true }).click();
  await expect(card.getByText(/isn't a whole backup key/)).toBeVisible();
  await card.getByLabel("Your backup key").fill(key);
  await card.getByRole("button", { name: "Check", exact: true }).click();
  await expect(card.getByText("The key opens the newest backup. 👍")).toBeVisible();
});
