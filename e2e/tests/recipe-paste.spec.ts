import { test, expect, unique } from "../fixtures";

// #58: when a link can't be imported, the paste form opens with a name guessed from the link.
test("a failed recipe import offers pasting the text", async ({ adminPage: page }) => {
  const name = unique("Kottfarslimpa");
  await page.goto("/recipes");
  await page.getByRole("button", { name: "Add a recipe" }).click();
  // Local addresses are refused before anything is fetched (no internet needed).
  await page.getByLabel("Import from a link").fill("http://127.0.0.1/recept/kottfarslimpa/");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText(/Only public web addresses can be imported/)).toBeVisible();

  await expect(page.getByLabel("Recipe name", { exact: false }).first()).toHaveValue("Kottfarslimpa");
  await page.getByLabel("Recipe name", { exact: false }).first().fill(name);
  await page.getByLabel(/^Ingredients, one per line/).fill("500 g nötfärs\n1 dl ströbröd\n3 dl\ngrädde");
  await page.getByLabel("Steps, one per line").fill("1. Sätt ugnen på 200°.\n2. Blanda och grädda.");
  await page.getByRole("button", { name: "Save recipe" }).first().click();
  await expect(page.getByText(`Imported "${name}" with 3 ingredients.`)).toBeVisible();

  await page.getByRole("button", { name: "Which sites work?" }).click();
  await expect(page.getByText(/Tested and working: Arla/)).toBeVisible();
});
