import { test, expect, unique, ADMIN, KID } from "../fixtures";

// #50: a tablet on the wall gets its own link; it shows the family's day and the emergency card,
// and stops working when the admin disconnects it.
test("a kitchen display", async ({ adminPage: page, adminApi, browser }, info) => {
  const name = unique("Kitchen tablet");
  const title = unique("Dinner at grandma's");
  // Going on right now, so it is on today's screen whatever the time of day.
  const start = new Date(Math.max(Date.now() - 5 * 60_000, new Date().setHours(0, 0, 0, 0)));
  const event = await (await adminApi.post("/api/calendar/family-events", { data: { title, start: start.toISOString(), end: new Date(start.getTime() + 30 * 60_000).toISOString() } })).json();
  try {
    await page.goto("/settings/kiosk");
    await page.getByLabel("Screen name").fill(name);
    await page.getByRole("button", { name: "Connect a screen" }).click();
    const url = await page.getByLabel("Screen link").inputValue();

    const context = await browser.newContext({ ...info.project.use, storageState: undefined });
    const screen = await context.newPage();
    await screen.goto(new URL(url).pathname);
    await expect(screen.getByText("E2E Family", { exact: false })).toBeVisible();
    await expect(screen.getByText(title)).toBeVisible();
    await screen.getByRole("button", { name: "Emergency card" }).click();
    await expect(screen.getByRole("dialog", { name: "Emergency card" })).toBeVisible();
    await screen.getByRole("button", { name: "Close" }).click();

    // Disconnected: the screen says so on its next refresh.
    await page.reload();
    await page.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "Disconnect" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: name }).getByText("disconnected")).toBeVisible();
    await screen.reload();
    await expect(screen.getByText("This screen isn't connected any more")).toBeVisible();
    await context.close();
  } finally {
    await adminApi.delete(`/api/calendar/family-events/${event.id}`);
  }
});

// 3.0.3: tasks ticked off by whoever did them (several for a task done together), tonight's dinner,
// full screen, and the screensaver after the screen's minutes.
test("the kitchen display's tasks, dinner and screensaver", async ({ adminApi, browser }, info) => {
  const members = await (await adminApi.get("/api/family/members")).json();
  const kid = members.find((m: { username: string }) => m.username === KID.username);
  const admin = members.find((m: { username: string }) => m.username === ADMIN.username);
  const solo = await (await adminApi.post("/api/tasks", { data: { title: unique("Feed the fish"), recurrence: "daily", points: 3, assignee_id: kid.id } })).json();
  const shared = await (await adminApi.post("/api/tasks", { data: { title: unique("Rake the garden"), recurrence: "daily", points: 8, shared: true } })).json();
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = monday.toISOString().slice(0, 10);
  const dinner = unique("Tacos");
  await adminApi.post(`/api/meals/import?week_start=${week}`, {
    data: JSON.stringify({ meals: Array.from({ length: 7 }, (_, d) => ({ weekday: d, name: dinner })) }),
    headers: { "Content-Type": "text/plain" },
  });
  const screenRow = await (await adminApi.post("/api/kiosks", { data: { name: unique("Wall"), screensaver: "flipclock", idle_minutes: 1 } })).json();
  const context = await browser.newContext({ ...info.project.use, storageState: undefined });
  try {
    const screen = await context.newPage();
    await screen.clock.install();
    await screen.goto(String(screenRow.url).replace(/^https?:\/\/[^/]+/, ""));
    await expect(screen.getByText(dinner).first()).toBeVisible();
    await expect(screen.getByRole("button", { name: "Full screen" })).toBeVisible();

    // The fish: tap the task, then the face.
    await screen.getByRole("button", { name: new RegExp(solo.title) }).click();
    const who = screen.getByRole("dialog", { name: `Who did it? ${solo.title}` });
    await who.getByRole("button", { name: kid.display_name }).click();
    await expect(who).toHaveCount(0);
    await expect(screen.getByRole("button", { name: new RegExp(solo.title) })).toBeDisabled();

    // The garden, together: two faces, the points shared.
    await screen.getByRole("button", { name: new RegExp(shared.title) }).click();
    const both = screen.getByRole("dialog", { name: `Who did it? ${shared.title}` });
    await both.getByRole("button", { name: kid.display_name }).click();
    await both.getByRole("button", { name: admin.display_name }).click();
    await both.getByRole("button", { name: "Done together – 4 + 4 each" }).click();
    await expect(both).toHaveCount(0);

    // Untouched for a minute: the flip clock; a tap wakes the screen.
    await screen.clock.fastForward("01:10");
    const saver = screen.getByRole("button", { name: /Tap to wake the screen/ });
    await expect(saver).toBeVisible();
    await saver.click();
    await expect(saver).toHaveCount(0);

    // The fox (3.0.4) after the same minute, once the screen has been switched over.
    await adminApi.put(`/api/kiosks/${screenRow.id}`, { data: { screensaver: "fox" } });
    await screen.reload();
    await screen.clock.fastForward("01:10");
    await expect(screen.locator("svg.foxscene")).toBeVisible();
    await screen.getByRole("button", { name: /Tap to wake the screen/ }).click();
    await expect(screen.locator("svg.foxscene")).toHaveCount(0);
  } finally {
    await context.close();
    await adminApi.delete(`/api/kiosks/${screenRow.id}`);
    for (const t of [solo, shared]) await adminApi.patch(`/api/tasks/${t.id}`, { data: { active: false } });
  }
});

// 3.0.4: the screen's own colours, the week's meals and the recipe book in the cooking mode, and the
// fox listing the day's open tasks.
test("the kitchen display's week, recipes, colours and the fox's tasks", async ({ adminApi, browser }, info) => {
  const task = await (await adminApi.post("/api/tasks", { data: { title: unique("Water the plants"), recurrence: "daily", points: 2 } })).json();
  const recipe = await (await adminApi.post("/api/meals/recipes", { data: { name: unique("Pancakes"), steps: ["Whisk", "Fry"], ingredients: [{ name: "Milk", amount: 6, unit: "dl" }] } })).json();
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const dinner = unique("Soup");
  await adminApi.post(`/api/meals/import?week_start=${monday.toISOString().slice(0, 10)}`, {
    data: JSON.stringify({ meals: Array.from({ length: 7 }, (_, d) => ({ weekday: d, name: `${dinner} ${d}`, steps: ["Chop", "Boil"] })) }),
    headers: { "Content-Type": "text/plain" },
  });
  const screenRow = await (await adminApi.post("/api/kiosks", { data: { name: unique("Kitchen"), screensaver: "fox", idle_minutes: 1, theme: "ocean" } })).json();
  await adminApi.put(`/api/kiosks/${screenRow.id}`, { data: { widgets: ["tasks", "week", "recipes"] } });
  const context = await browser.newContext({ ...info.project.use, storageState: undefined });
  try {
    const screen = await context.newPage();
    await screen.clock.install();
    await screen.goto(String(screenRow.url).replace(/^https?:\/\/[^/]+/, ""));
    await expect(screen.locator("html")).toHaveAttribute("data-theme", "ocean");

    // The week: every dinner, the cooking mode from one.
    const week = screen.getByRole("region", { name: "The week's meals" }).or(screen.locator("section").filter({ hasText: "The week's meals" }));
    await expect(week.getByText(`${dinner} 3`)).toBeVisible();
    await week.getByRole("button", { name: new RegExp(`${dinner} 3`) }).click();
    await expect(screen.getByRole("dialog", { name: `Cooking: ${dinner} 3` })).toBeVisible();
    await screen.getByRole("dialog").getByRole("button", { name: "Close" }).first().click();

    // The recipe book: a tap, and the recipe in big type.
    await screen.getByRole("button", { name: new RegExp(recipe.name) }).click();
    const cooking = screen.getByRole("dialog", { name: `Cooking: ${recipe.name}` });
    await expect(cooking.getByText("Milk")).toBeVisible();
    await cooking.getByRole("button", { name: "Close" }).first().click();

    // Untouched: the fox, with the day's open tasks over the lake.
    await screen.clock.fastForward("01:10");
    await expect(screen.locator("svg.foxscene")).toBeVisible();
    // Three are listed, the rest counted – other tests' tasks may come first.
    await expect(screen.getByText("Today's tasks")).toBeVisible();
    await context.close();
  } finally {
    await adminApi.delete(`/api/kiosks/${screenRow.id}`);
    await adminApi.delete(`/api/tasks/${task.id}`);
    await adminApi.delete(`/api/meals/recipes/${recipe.id}`);
  }
});
