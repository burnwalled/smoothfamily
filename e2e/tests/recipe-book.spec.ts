import { test, expect, unique } from "../fixtures";

// 2.8.4: the recipe book – stars, favourites, the original's link, a greyed-out import for sites that
// can't be read, and the pantry counted down after cooking.
test("the recipe book and cooking from it", async ({ adminPage: page }) => {
  const name = unique("Pannkakor");
  const recipe = await (await page.request.post("/api/meals/recipes", { data: { name, source_url: "https://www.arla.se/recept/pannkakor/", category: "everyday", ingredients: [{ name: "mjölk", amount: 6, unit: "dl" }] } })).json();
  const milk = await (await page.request.post("/api/pantry", { data: { name: unique("Mjölk"), amount: 1, unit: "l", place: "fridge" } })).json();

  await page.goto("/recipes");
  const card = page.getByRole("listitem").filter({ hasText: name });
  await expect(card.getByRole("link", { name: "Original on arla.se" })).toHaveAttribute("href", "https://www.arla.se/recept/pannkakor/");
  await card.getByRole("radiogroup", { name: `My stars for ${name}` }).getByRole("radio", { name: "4" }).click();
  await expect(card.getByText("Family 4 ★ (1)")).toBeVisible();
  await card.getByRole("button", { name: "Favourite" }).click();
  await page.getByRole("button", { name: "Favourites" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();

  // ICA's recipes can't be read by a server: the button says so before trying.
  await page.getByRole("button", { name: "Add a recipe" }).click();
  await page.getByLabel("Import from a link").fill("https://www.ica.se/recept/klassisk-lasagne-679675/");
  await expect(page.getByRole("button", { name: "Import", exact: true })).toBeDisabled();
  await expect(page.getByText(/Recipes from ica.se can't be imported right now/)).toBeVisible();

  // Cooked: the milk is used up.
  await page.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "Cook" }).click();
  await page.getByRole("button", { name: "Done – count down the pantry" }).click();
  await page.getByRole("group", { name: milk.name }).getByRole("button", { name: "All used" }).click();
  await page.getByRole("button", { name: "Update the pantry" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const left = await (await page.request.get("/api/pantry")).json();
  expect(left.some((i: { id: string }) => i.id === milk.id)).toBe(false);
  expect(recipe.id).toBeTruthy();
});
