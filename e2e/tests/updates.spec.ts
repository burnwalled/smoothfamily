import { test, expect } from "../fixtures";

// 2.9.0: Server settings → Updates – before the server's update.sh has run it says how to set it up;
// the choice of when updates go in is kept.
test("the server's updates page", async ({ adminPage: page }) => {
  await page.goto("/server");
  await page.getByRole("button", { name: "Updates", exact: true }).click();
  await expect(page.getByText(/update.sh hasn't run yet/)).toBeVisible();
  const when = page.getByRole("region", { name: "When updates are put in" });
  await when.getByRole("radio", { name: /By themselves in the window/ }).click();
  await expect(when.getByRole("radio", { name: /By themselves in the window/ })).toBeChecked();
  await when.getByLabel("Day", { exact: true }).selectOption("6");
  await when.getByLabel("Time", { exact: true }).selectOption("4");
  await page.reload();
  await page.getByRole("button", { name: "Updates", exact: true }).click();
  await expect(when.getByRole("radio", { name: /By themselves in the window/ })).toBeChecked();
  await when.getByRole("radio", { name: /Ask me first/ }).click();
  await expect(when.getByRole("radio", { name: /Ask me first/ })).toBeChecked();
});
