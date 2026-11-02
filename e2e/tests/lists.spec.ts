import { test, expect, unique } from "../fixtures";

test("creates a list and adds an item", async ({ adminPage: page }) => {
  const listName = unique("Groceries");
  const item = unique("Milk");

  await page.goto("/lists");
  await page.getByPlaceholder("New list name").fill(listName);
  await page.getByRole("button", { name: "Add", exact: true }).first().click();
  await page.getByRole("button", { name: new RegExp(`^${listName}`) }).click();
  await expect(page.getByRole("heading", { name: listName })).toBeVisible();

  await page.getByPlaceholder("Add item …").fill(item);
  await page.getByPlaceholder("Add item …").press("Enter");
  await expect(page.getByText(item)).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: new RegExp(`^${listName}`) }).click();
  await expect(page.getByText(item)).toBeVisible();
});
