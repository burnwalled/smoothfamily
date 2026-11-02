import { test, expect, unique } from "../fixtures";

// 2.6.5: a house with the smoke alarm from the suggestions (as a task for someone), a project with a
// budget and a cost, a thing with a warranty, and the electricity meter giving use per month.
test("homes: maintenance, projects, things and energy", async ({ adminPage: page, adminApi }) => {
  const name = unique("House");
  try {
    await page.goto("/property");
    await page.getByRole("button", { name: "Add property" }).first().click();
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Add property" }).last().click();
    const card = page.getByRole("button", { name: new RegExp(name) });
    const detail = page.getByRole("region", { name });
    await expect(card).toContainText("House");

    await page.getByRole("button", { name: "+ Test the smoke alarm" }).click();
    await page.getByLabel("Becomes a task for").selectOption({ label: "Alex Admin" });
    await page.getByRole("button", { name: "Save" }).click();
    await expect(card).toContainText("Test the smoke alarm");
    await expect(detail).toContainText("task for Alex Admin");

    await page.getByRole("tab", { name: "Projects" }).click();
    await page.getByRole("button", { name: "Add project" }).click();
    await page.getByLabel("Project name").fill("New kitchen");
    await page.getByLabel("Budget").fill("100000");
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("tab", { name: "Costs" }).click();
    await page.getByLabel("Expense", { exact: true }).fill("Cupboards");
    await page.getByLabel("Amount", { exact: true }).fill("40000");
    await page.getByLabel("Project", { exact: true }).selectOption({ label: "New kitchen" });
    await page.getByRole("button", { name: "Add expense" }).click();
    await expect(detail.getByRole("listitem").filter({ hasText: "Cupboards" })).toContainText("New kitchen");
    await page.getByRole("tab", { name: "Projects" }).click();
    await expect(detail.getByRole("listitem").filter({ hasText: "New kitchen" })).toContainText("of 100,000");

    await page.getByRole("tab", { name: "Things" }).click();
    await page.getByRole("button", { name: "Add a thing" }).click();
    await page.getByLabel("Name", { exact: true }).last().fill("Heat pump");
    await page.getByLabel("Room", { exact: true }).fill("Utility room");
    await page.getByLabel("Warranty until").fill(new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10));
    await page.getByRole("button", { name: "Save" }).click();
    await expect(detail.getByRole("listitem").filter({ hasText: "Heat pump" })).toContainText("warranty until");
    await expect(card).toContainText("1 warranties ending");

    await page.getByRole("tab", { name: "Energy" }).click();
    const year = new Date().getFullYear();
    for (const [day, value] of [[`${year}-01-01`, "1000"], [`${year}-02-01`, "1310"]]) {
      await page.getByLabel("Date", { exact: true }).fill(day);
      await page.getByLabel(/^The meter shows/).fill(value);
      await page.getByRole("button", { name: "Add reading" }).click();
      await expect(page.getByLabel(/^The meter shows/)).toHaveValue("");
    }
    await expect(detail).toContainText("310 kWh this year");
    await expect(card).toContainText("310 kWh");
  } finally {
    for (const p of await (await adminApi.get("/api/property/properties")).json()) if (p.name === name) await adminApi.delete(`/api/property/properties/${p.id}`);
    for (const t of await (await adminApi.get("/api/tasks")).json()) if (t.title === "Maintenance: Test the smoke alarm") await adminApi.delete(`/api/tasks/${t.id}`);
  }
});
