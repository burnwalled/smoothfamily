import { test, expect, unique } from "../fixtures";

// 2.8.5: the household's economy – an income of one's own, a cost, and the year by category.
test("the household's economy", async ({ adminPage: page }) => {
  const note = unique("Spotify");
  await page.request.post("/api/receipts", { data: { store: unique("ICA"), amount: 1000, category: "food", purchased_on: new Date().toISOString().slice(0, 10) } });
  await page.goto("/economy");
  await page.getByRole("button", { name: "Add income or cost" }).click();
  const form = page.getByRole("form", { name: "Add income or cost" });
  await form.getByRole("radio", { name: "Income" }).click();
  await form.getByLabel("Amount").fill("30000");
  await form.getByLabel("Repeats").selectOption("monthly");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("region", { name: "Incomes" })).toContainText("Salary");

  await page.getByRole("button", { name: "Add income or cost" }).click();
  await form.getByRole("radio", { name: "Cost" }).click();
  await form.getByLabel("Category").selectOption("subscriptions");
  await form.getByLabel("Amount").fill("129");
  await form.getByLabel("Note").fill(note);
  await form.getByRole("button", { name: "Save" }).click();
  const categories = page.getByRole("region", { name: "Where the money goes" });
  await expect(categories).toContainText("Food");
  await expect(categories).toContainText("Subscriptions");
  await expect(page.getByRole("region", { name: "Added here and from the bank" })).toContainText(note);
});
