import { test, expect, unique, KID } from "../fixtures";

test("a child completes a task and an adult approves it", async ({ adminApi, adminPage, kidPage }) => {
  const title = unique("Feed the cat");
  const members = await (await adminApi.get("/api/family/members")).json();
  const kid = members.find((m: { username: string }) => m.username === KID.username);
  const created = await adminApi.post("/api/tasks", {
    data: { title, points: 5, assignee_id: kid.id, recurrence: "daily" },
  });
  expect(created.ok()).toBeTruthy();

  await kidPage.goto("/tasks");
  const kidRow = kidPage.getByRole("listitem").filter({ hasText: title }).first();
  await kidRow.getByRole("button", { name: /Done \+5/ }).click();
  await expect(kidRow.getByText("Waiting for approval").first()).toBeVisible();

  await adminPage.goto("/tasks");
  await adminPage.getByRole("button", { name: /^Approvals/ }).click();
  const approval = adminPage.locator("li").filter({ hasText: title }).filter({ has: adminPage.getByRole("button", { name: "Approve" }) });
  await approval.getByRole("button", { name: "Approve" }).click();
  await expect(approval).toHaveCount(0);

  await kidPage.reload();
  await expect(kidPage.getByRole("listitem").filter({ hasText: title }).first().getByText(`Done – ${KID.name}`)).toBeVisible();
});

// 2.9.0: done yesterday but not ticked off – reported afterwards, up to three days back.
// 3.1.1: ticked off by mistake – undone, and to do again.
test("a task ticked off by mistake is undone", async ({ adminApi, adminPage: page }) => {
  const title = unique("Walk the dog");
  const task = await (await adminApi.post("/api/tasks", { data: { title, recurrence: "daily", points: 4 } })).json();
  try {
    await page.goto("/tasks");
    const row = page.getByRole("listitem").filter({ hasText: title });
    await row.getByRole("button", { name: "Done +4" }).click();
    await expect(row.getByText(/^Done – /)).toBeVisible();
    await row.getByRole("button", { name: `Undo: ${title}` }).click();
    await expect(row.getByRole("button", { name: "Done +4" })).toBeVisible();
    expect((await (await adminApi.get("/api/tasks/history?days=1")).json()).some((h: { task_id: string }) => h.task_id === task.id)).toBe(false);
  } finally {
    await adminApi.delete(`/api/tasks/${task.id}`);
  }
});

test("a task is reported afterwards", async ({ adminApi, adminPage: page }) => {
  const title = unique("Water the plants");
  const task = await (await adminApi.post("/api/tasks", { data: { title, recurrence: "daily", points: 3 } })).json();
  try {
    await page.goto("/tasks");
    await page.getByRole("button", { name: "The day before" }).click();
    await expect(page.getByRole("heading", { name: "Yesterday" })).toBeVisible();
    await expect(page.getByText(/Report it here/)).toBeVisible();
    const row = page.getByRole("listitem").filter({ hasText: title });
    await row.getByRole("button", { name: "Done +3" }).click();
    await expect(row.getByText(/^Done – /)).toBeVisible();
    // Back on today, today's is still to do.
    await page.getByRole("button", { name: "The day after" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: title }).getByRole("button", { name: "Done +3" })).toBeVisible();
    // No further back than three days.
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "The day before" }).click();
    await expect(page.getByRole("button", { name: "The day before" })).toBeDisabled();
  } finally {
    await adminApi.delete(`/api/tasks/${task.id}`);
  }
});
