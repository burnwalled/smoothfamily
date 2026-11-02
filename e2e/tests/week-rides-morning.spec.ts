import { test, expect, unique, KID } from "../fixtures";

// #53: an adult takes the drive and the family packs from a list that every practice shares.
test("who drives and the packing list on an event", async ({ adminPage: page, adminApi }) => {
  const title = unique("Football practice");
  const start = new Date();
  start.setHours(23, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const event = await (await adminApi.post("/api/calendar/family-events", { data: { title, start: start.toISOString(), end: end.toISOString() } })).json();
  try {
    await page.goto("/calendar");
    // The agenda has a card per day with the rides button on each event.
    await page.getByRole("button", { name: "Agenda", exact: true }).click();
    await page.getByRole("button", { name: `Rides and packing list: ${title}` }).click();
    const panel = page.getByLabel(`Rides and packing for ${title}`);
    await panel.getByRole("button", { name: "Needs a ride" }).click();
    await panel.getByRole("button", { name: "I'm driving" }).click();
    await expect(panel.getByText("You", { exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "I'll pick up" })).toBeVisible();

    await panel.getByRole("button", { name: "Add list" }).click();
    await panel.getByLabel("Things to bring, one per line").fill("Shin guards\nWater bottle");
    await panel.getByRole("button", { name: "Save" }).click();
    // Ticks are saved first, then shown.
    await panel.getByRole("checkbox", { name: "Water bottle" }).click();
    await expect(panel.getByRole("checkbox", { name: "Water bottle" })).toBeChecked();
    // The line shows the driver and how much is packed.
    await expect(page.locator("li").filter({ hasText: title }).getByText("1/2")).toBeVisible();
  } finally {
    await adminApi.put("/api/calendar/packing", { data: { title, items: [] } });
    await adminApi.delete(`/api/calendar/family-events/${event.id}`);
  }
});

// #68: a thank-you star, the family activity and "done".
test("Söndagskollen with a star and the family activity", async ({ adminPage: page, adminApi }) => {
  const thanks = unique("For the dishes");
  await page.goto("/week");
  await expect(page.getByRole("heading", { name: "Söndagskollen" })).toBeVisible();
  const week = await (await adminApi.get("/api/week")).json();
  await adminApi.delete(`/api/week/${week.week_start}/done`);
  await page.reload();

  await page.getByLabel("To whom?").selectOption({ label: KID.name });
  await page.getByLabel("Why the star").fill(thanks);
  await page.getByRole("button", { name: "Give a star" }).click();
  await expect(page.getByText(thanks)).toBeVisible();

  await page.getByLabel("The family's activity this week").fill("Bowling");
  await page.getByRole("button", { name: "We're done!" }).click();
  await expect(page.getByText(/Söndagskollen is done/)).toBeVisible();

  const after = await (await adminApi.get("/api/week")).json();
  expect(after.activity).toBe("Bowling");
  for (const star of after.stars) await adminApi.delete(`/api/week/stars/${star.id}`);
  await adminApi.delete(`/api/week/${after.week_start}/done`);
});

// #52: the morning summary is chosen per member under Profile.
test("the morning summary is turned on in the profile", async ({ adminPage: page, adminApi }) => {
  await page.goto("/profile?tab=notifications");
  await page.getByRole("checkbox", { name: "Morning summary" }).click();
  await expect(page.getByRole("checkbox", { name: "Morning summary" })).toBeChecked();
  await page.getByLabel("Time", { exact: true }).fill("06:45");
  await page.getByLabel("Days", { exact: true }).selectOption("all");
  await expect.poll(async () => (await (await adminApi.get("/api/auth/me")).json()).morning_days).toBe("all");
  const me = await (await adminApi.get("/api/auth/me")).json();
  expect(me.morning_summary).toBe(true);
  expect(me.morning_time).toBe("06:45");
  await adminApi.patch("/api/auth/me", { data: { morning_summary: false, morning_time: "07:00", morning_days: "weekdays" } });
});
