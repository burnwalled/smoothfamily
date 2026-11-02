import { test, expect, unique, KID } from "../fixtures";

// #70: a trip with the ski template for the child, ticked off, and the checklist before leaving.
test("a trip with packing and the checklist", async ({ adminPage: page, adminApi }) => {
  const name = unique("Ski week");
  const start = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  await page.goto("/trips");
  await page.getByRole("button", { name: "New trip" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Where").fill("Sälen");
  await page.getByLabel("From").fill(start);
  await page.getByRole("button", { name: "Create the trip" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  const kid = page.getByRole("group", { name: `Packing for ${KID.name}` });
  await kid.getByRole("button", { name: "+ Ski" }).click();
  await kid.getByRole("checkbox", { name: "Helmet" }).click();
  await expect(kid.getByRole("checkbox", { name: "Helmet" })).toBeChecked();
  await expect(kid.getByText("1/8")).toBeVisible();
  await page.getByRole("checkbox", { name: "Turn off the water" }).click();
  await expect(page.getByRole("checkbox", { name: "Turn off the water" })).toBeChecked();

  // The day to pack (2.9.0): the child gets a task that day, with a link back to the list.
  await page.getByRole("button", { name: "Choose the day to pack" }).click();
  const packDay = page.getByRole("group", { name: "Time to pack" });
  await expect(packDay.getByRole("checkbox", { name: KID.name })).toBeChecked();
  await packDay.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/^Packing /)).toBeVisible();
  const tasks = await (await adminApi.get("/api/tasks")).json();
  expect(tasks.filter((t: { title: string }) => t.title === `Pack for ${name}`).length).toBeGreaterThan(0);

  const trips = await (await adminApi.get("/api/trips")).json();
  const trip = trips.find((t: { name: string }) => t.name === name);
  expect(trip.packed).toBe(1);
  expect(trip.checks_left).toBe(5);
  await adminApi.delete(`/api/trips/${trip.id}`);
});
