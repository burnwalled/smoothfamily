import { test, expect, unique } from "../fixtures";

// #51: in a shop without coverage – tick and add items offline; they are sent when back online.
test("the shopping list works offline", async ({ adminPage: page, adminApi }) => {
  const context = page.context();
  const listName = unique("Shop");
  const milk = unique("Milk");
  const bread = unique("Bread");
  const list = await (await adminApi.post("/api/lists", { data: { name: listName } })).json();
  await adminApi.post(`/api/lists/${list.id}/items`, { data: { name: milk } });
  try {
    await page.goto("/lists");
    await page.getByRole("button", { name: new RegExp(listName) }).click();
    await expect(page.getByText(milk)).toBeVisible();

    await context.setOffline(true);
    await page.getByRole("checkbox", { name: milk }).click();
    await expect(page.getByRole("checkbox", { name: milk })).toBeChecked();
    await page.getByPlaceholder("Add item …").fill(bread);
    await page.getByPlaceholder("Add item …").press("Enter");
    await expect(page.getByText(bread)).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Offline · 2 waiting" })).toBeVisible();
    await expect(page.getByLabel("Not sent yet")).toHaveCount(2);

    await context.setOffline(false);
    await expect(page.getByRole("status")).toHaveCount(0, { timeout: 15_000 });
    await expect
      .poll(async () => {
        const items = await (await adminApi.get(`/api/lists/${list.id}/items`)).json();
        return items.map((i: { name: string; done: boolean }) => `${i.name}:${i.done}`).sort();
      })
      .toEqual([`${bread}:false`, `${milk}:true`].sort());
  } finally {
    await context.setOffline(false);
    await adminApi.delete(`/api/lists/${list.id}`);
  }
});

// A task ticked off offline counts when the connection is back (once a day, as always).
test("a task is completed offline", async ({ adminPage: page, adminApi }) => {
  const context = page.context();
  const title = unique("Water the plants");
  const me = await (await adminApi.get("/api/auth/me")).json();
  const task = await (await adminApi.post("/api/tasks", { data: { title, points: 5, assignee_id: me.id, recurrence: "daily" } })).json();
  try {
    await page.goto("/tasks");
    const row = page.getByRole("listitem").filter({ hasText: title }).first();
    await expect(row).toBeVisible();
    await context.setOffline(true);
    await row.getByRole("button", { name: /Done \+5/ }).click();
    await expect(row.getByLabel("Not sent yet")).toBeVisible();
    await context.setOffline(false);
    await expect
      .poll(async () => (await (await adminApi.get("/api/tasks/today")).json()).find((t: { task: { id: string } }) => t.task.id === task.id)?.done)
      .toBe(true);
  } finally {
    await context.setOffline(false);
    await adminApi.delete(`/api/tasks/${task.id}`);
  }
});
