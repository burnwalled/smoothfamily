import { test, expect, unique } from "../fixtures";

// #69: bought items move from the shopping list into the fridge; one keeping until tomorrow is
// marked, and used up it goes back onto the list.
test("the pantry with the shopping list", async ({ adminPage: page, adminApi }) => {
  const milk = unique("Milk");
  const cheese = unique("Cheese");
  const list = await (await adminApi.post("/api/lists", { data: { name: unique("Shop") } })).json();
  const item = await (await adminApi.post(`/api/lists/${list.id}/items`, { data: { name: cheese } })).json();
  await adminApi.patch(`/api/lists/${list.id}/items/${item.id}`, { data: { done: true } });
  try {
    await page.goto("/lists");
    // The list itself (its Rename button has the name too, once it is open).
    await page.getByRole("button", { name: new RegExp(`^${list.name}`) }).click();
    await page.getByRole("button", { name: "Put bought items in the pantry" }).click();
    await expect(page.getByText(cheese)).toHaveCount(0);

    await page.goto("/pantry");
    await expect(page.getByText(cheese)).toBeVisible();
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await page.getByLabel("What", { exact: true }).fill(milk);
    await page.getByLabel("Where", { exact: true }).selectOption("fridge");
    await page.getByLabel("Best before").fill(tomorrow);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const row = page.getByRole("listitem").filter({ hasText: milk });
    await expect(row.getByText(/best before/)).toHaveClass(/amber/);

    await page.getByRole("tab", { name: /Fridge/ }).click();
    await expect(page.getByRole("listitem").filter({ hasText: cheese })).toBeVisible();
    // With several lists, choose which one used-up things go back onto.
    const target = page.getByRole("combobox", { name: /^Used up goes to/ });
    if (await target.count()) await target.selectOption({ label: list.name });
    await row.getByRole("button", { name: "Used up → shopping list" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: milk })).toHaveCount(0);
    const items = await (await adminApi.get(`/api/lists/${list.id}/items`)).json();
    expect(items.map((i: { name: string }) => i.name)).toContain(milk);
  } finally {
    for (const i of await (await adminApi.get("/api/pantry")).json()) {
      if ([milk, cheese].includes(i.name)) await adminApi.delete(`/api/pantry/${i.id}`);
    }
    await adminApi.delete(`/api/lists/${list.id}`);
  }
});
