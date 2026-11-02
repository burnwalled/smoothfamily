import { test, expect, unique } from "../fixtures";

// 2.6.0: a vehicle with an inspection soon and a service by mileage, two fills that give the
// consumption, a cost changed, and the reminder marked done – the next one comes by itself.
test("vehicles: reminders, costs and the odometer", async ({ adminPage: page, adminApi }) => {
  const name = unique("Volvo");
  try {
    await page.goto("/vehicles");
    await page.getByRole("button", { name: "Add vehicle" }).first().click();
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Registration", { exact: true }).fill("abc123");
    await page.getByLabel("Odometer (km)").fill("50000");
    await page.getByRole("button", { name: "Add vehicle" }).last().click();
    const card = page.getByRole("button", { name: new RegExp(name) });
    await expect(card).toContainText("ABC123");

    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    // From the suggestions for a car.
    await page.getByRole("button", { name: "+ Inspection" }).click();
    await page.getByLabel("Last day").fill(soon);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(card).toContainText("Inspection");
    await expect(card).toContainText("in 10 days");

    const detail = page.getByRole("region", { name });
    await page.getByRole("tab", { name: "Costs" }).click();
    for (const [km, litres, amount] of [["50000", "45", "800"], ["50800", "40", "760"]]) {
      await page.getByLabel("Expense", { exact: true }).fill("Circle K");
      await page.getByLabel("Amount", { exact: true }).fill(amount);
      await page.getByLabel("Odometer (km)").fill(km);
      await page.getByLabel("Litres").fill(litres);
      await page.getByRole("button", { name: "Add expense" }).click();
      await expect(detail.getByRole("listitem").filter({ hasText: `${Number(km).toLocaleString("en")} km` })).toBeVisible();
    }
    // 40 l over 800 km.
    await expect(card).toContainText("5 l/100 km");
    await expect(card).toContainText("50,800 km");

    await detail.getByRole("listitem").filter({ hasText: "50,800 km" }).getByRole("button", { name: "Change" }).click();
    await page.getByLabel("Amount", { exact: true }).fill("700");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(detail.getByRole("listitem").filter({ hasText: "50,800 km" })).toContainText("700");

    await page.getByRole("tab", { name: "Reminders" }).click();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.getByRole("button", { name: "Save" }).click();
    // Repeats every 14 months: no longer soon.
    await expect(card).not.toContainText("in 10 days");
    await expect(card).toContainText("Inspection");

    await page.getByRole("tab", { name: "Odometer" }).click();
    await expect(page.getByText("from a cost").first()).toBeVisible();

    // Tyres: two sets, the winter ones go on and the summer ones to the tyre hotel.
    await page.getByRole("tab", { name: "Tyres" }).click();
    await page.getByRole("button", { name: "Add a tyre set" }).click();
    await page.getByLabel("Kind", { exact: true }).selectOption("summer");
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "Add a tyre set" }).click();
    await page.getByLabel("Kind", { exact: true }).selectOption("winter");
    await page.getByRole("button", { name: "Save" }).click();
    const summer = detail.getByRole("listitem").filter({ hasText: "Summer tyres" }).first();
    const winter = detail.getByRole("listitem").filter({ hasText: "Winter tyres" }).first();
    await summer.getByRole("button", { name: "Put these on" }).click();
    await summer.getByRole("button", { name: "Save" }).click();
    await expect(summer).toContainText("on now");
    await winter.getByRole("button", { name: "Put these on" }).click();
    await winter.getByLabel(/goes to$/).fill("Tyre hotel");
    await winter.getByRole("button", { name: "Save" }).click();
    await expect(winter).toContainText("on now");
    await expect(summer).toContainText("kept at Tyre hotel");
    await expect(card).toContainText("Winter tyres");
  } finally {
    for (const v of await (await adminApi.get("/api/vehicles")).json()) if (v.name === name) await adminApi.delete(`/api/vehicles/${v.id}`);
  }
});

// Not only cars: a mower counts engine hours and gets its own suggestions.
test("vehicles of every kind", async ({ adminPage: page, adminApi }) => {
  const name = unique("Mower");
  try {
    await page.goto("/vehicles");
    await page.getByRole("button", { name: "Add vehicle" }).first().click();
    await page.getByLabel("Type", { exact: true }).selectOption("mower");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await expect(page.getByLabel("Registration", { exact: true })).toHaveCount(0);
    await page.getByLabel("Engine hours (h)").fill("120");
    await page.getByRole("button", { name: "Add vehicle" }).last().click();
    const card = page.getByRole("button", { name: new RegExp(name) });
    await expect(card).toContainText("120 h");
    await card.click();
    await page.getByRole("button", { name: "+ Service" }).click();
    await expect(page.getByLabel("Or at engine hours (h)")).toHaveValue("170");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(card).toContainText("50 h to go");
    await expect(page.getByRole("tab", { name: "Tyres" })).toHaveCount(0);
  } finally {
    for (const v of await (await adminApi.get("/api/vehicles")).json()) if (v.name === name) await adminApi.delete(`/api/vehicles/${v.id}`);
  }
});
