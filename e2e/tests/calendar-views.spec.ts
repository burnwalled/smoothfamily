import { test, expect, unique } from "../fixtures";

const SHOTS = process.env.E2E_SHOTS;

// 2.7.0: the month with what is on each day written out, the week over the hours, the agenda as a
// card per day – and the month and week number in the heading.
test("the calendar's month, week and agenda", async ({ adminPage: page, adminApi }, info) => {
  const dinner = unique("Dinner at grandma's");
  const camp = unique("Football camp");
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0);
  const campStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const campEnd = new Date(campStart.getTime() + 3 * 86_400_000);
  const made = [
    await (await adminApi.post("/api/calendar/family-events", { data: { title: dinner, start: start.toISOString(), end: new Date(start.getTime() + 90 * 60_000).toISOString() } })).json(),
    await (await adminApi.post("/api/calendar/family-events", { data: { title: camp, start: campStart.toISOString(), end: campEnd.toISOString(), all_day: true } })).json(),
  ];
  try {
    await page.goto("/calendar");
    // The week, over the hours.
    await page.getByRole("button", { name: "Week", exact: true }).click();
    await expect(page.getByText(/ · W \d+$/)).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(dinner) })).toBeVisible();
    await expect(page.getByRole("button", { name: camp })).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/week-${info.project.name}.png`, fullPage: true });

    // The month: titles written out on the days.
    await page.getByRole("button", { name: "Month", exact: true }).click();
    const monthName = now.toLocaleDateString("en", { month: "long", year: "numeric" });
    await expect(page.getByText(monthName, { exact: true })).toBeVisible();
    // The time is shown in the family's time zone, whatever the browser's is.
    const dinnerInMonth = page.getByRole("button", { name: new RegExp(`^[0-9]{2}:00 ${dinner}$`) });
    await expect(dinnerInMonth).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/month-${info.project.name}.png`, fullPage: true });
    // Tapping it shows the day with the event to open.
    await dinnerInMonth.click();
    await expect(page.getByRole("button", { name: `Rides and packing list: ${dinner}` })).toBeVisible();

    // The agenda: a card per day.
    await page.getByRole("button", { name: "Agenda", exact: true }).click();
    await expect(page.getByRole("button", { name: `Rides and packing list: ${dinner}` })).toBeVisible();
  } finally {
    for (const e of made) await adminApi.delete(`/api/calendar/family-events/${e.id}`);
  }
});

// #95: a list can be renamed after it is in use.
test("renaming a list", async ({ adminPage: page, adminApi }) => {
  const name = unique("Groceries");
  const list = await (await adminApi.post("/api/lists", { data: { name } })).json();
  try {
    await page.goto("/lists");
    await page.getByRole("button", { name: new RegExp(name) }).first().click();
    await page.getByRole("button", { name: `Rename ${name}` }).click();
    await page.getByLabel("New name").fill(`${name} – weekend`);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("heading", { name: `${name} – weekend` })).toBeVisible();
  } finally {
    await adminApi.delete(`/api/lists/${list.id}`);
  }
});

// "Coming up" on Today: the vehicles' and the home's next things to do.
test("coming up on Today", async ({ adminPage: page, adminApi }) => {
  const car = await (await adminApi.post("/api/vehicles", { data: { name: unique("Car"), registration: "UP1" } })).json();
  const due = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  await adminApi.post("/api/vehicles/reminders", { data: { vehicle_id: car.id, kind: "inspection", due_date: due } });
  const widget = await (await adminApi.post("/api/dashboard/widgets", { data: { type: "upcoming" } })).json();
  try {
    await page.goto("/");
    await expect(page.getByRole("link", { name: new RegExp(`Inspection · ${car.name}`) })).toContainText("in 5 days");
  } finally {
    await adminApi.delete(`/api/dashboard/widgets/${widget.id}`);
    await adminApi.delete(`/api/vehicles/${car.id}`);
  }
});
