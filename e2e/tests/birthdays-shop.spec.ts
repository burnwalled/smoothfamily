import { test, expect, unique, KID } from "../fixtures";

// #57: a wish reserved by someone else is visible to the others but never to the person.
test("wish list reservations stay a surprise", async ({ adminApi, adminPage, kidPage }) => {
  const members = await (await adminApi.get("/api/family/members")).json();
  const kid = members.find((m: { username: string }) => m.username === KID.username);
  const name = unique("Kim");
  const wish = unique("LEGO castle");
  const person = await (
    await adminApi.post("/api/birthdays/people", { data: { name, user_id: kid.id, birth_month: 5, birth_day: 4 } })
  ).json();

  // Wish lists are in Lists since 2.8.2 (a reminder opens one with ?wish=…).
  await kidPage.goto("/lists");
  await kidPage.getByRole("button", { name: new RegExp(`Wish list: ${name}|${name}'s wish list`) }).click();
  await kidPage.getByPlaceholder("Wish", { exact: true }).fill(wish);
  await kidPage.getByPlaceholder("Wish", { exact: true }).press("Enter");
  await expect(kidPage.getByText(wish)).toBeVisible();
  // The child has no gift planning of their own birthday.
  await expect(kidPage.getByRole("button", { name: `Gifts for ${name}` })).toHaveCount(0);

  await adminPage.goto(`/lists?wish=${person.id}`);
  await adminPage.getByRole("listitem").filter({ hasText: wish }).getByRole("button", { name: "I'm buying this" }).click();
  await expect(adminPage.getByRole("listitem").filter({ hasText: wish }).getByText("You're buying this")).toBeVisible();
  // The adults' secret planning shows who buys what.
  await adminPage.getByRole("button", { name: `Gifts for ${name}` }).click();
  await expect(adminPage.getByRole("listitem").filter({ hasText: wish })).toContainText("You're buying this");

  await kidPage.goto(`/lists?wish=${person.id}`);
  const row = kidPage.getByRole("listitem").filter({ hasText: wish });
  await expect(row).toBeVisible();
  await expect(row.getByText(/buying/i)).toHaveCount(0);
  await adminApi.delete(`/api/birthdays/people/${person.id}`);
});

// #63: a child buys a reward with points; it waits for an adult, who approves it.
test("a child buys a reward and an adult approves it", async ({ adminApi, kidApi, adminPage, kidPage }) => {
  const members = await (await adminApi.get("/api/family/members")).json();
  const kid = members.find((m: { username: string }) => m.username === KID.username);
  const reward = unique("Choose the film");
  // Earn 40 points: a task the child completes and the admin approves.
  const task = await (await adminApi.post("/api/tasks", { data: { title: unique("Tidy"), points: 40, assignee_id: kid.id, recurrence: "daily" } })).json();
  await kidApi.post(`/api/tasks/${task.id}/complete`);
  const approvals = await (await adminApi.get("/api/tasks/approvals")).json();
  const approval = approvals.find((a: { task_title: string }) => a.task_title === task.title);
  await adminApi.post(`/api/tasks/approvals/${approval.completion_id}`, { data: { action: "approve" } });
  const item = await (await adminApi.post("/api/shop/items", { data: { title: reward, price: 30 } })).json();

  try {
    await kidPage.goto("/shop");
    const card = kidPage.getByRole("listitem").filter({ hasText: reward });
    await card.getByRole("button", { name: "Buy" }).click();
    await expect(kidPage.getByText("Sent to the adults")).toBeVisible();
    await expect(kidPage.getByRole("listitem").filter({ hasText: reward }).getByText("Waiting")).toBeVisible();

    await adminPage.goto("/shop");
    const pending = adminPage.getByRole("listitem").filter({ hasText: reward }).filter({ has: adminPage.getByRole("button", { name: "Approve" }) });
    await pending.getByRole("button", { name: "Approve" }).click();
    await expect(pending).toHaveCount(0);

    await expect(kidPage.getByRole("listitem").filter({ hasText: reward }).getByText("Approved")).toBeVisible({ timeout: 5000 });
  } finally {
    await adminApi.delete(`/api/shop/items/${item.id}`);
  }
});

// 2.8.3: a child proposes a savings goal; an adult approves it with a share.
test("a child's own savings goal", async ({ kidPage, adminPage, adminApi }) => {
  const goal = unique("LEGO");
  await kidPage.goto("/allowance");
  await kidPage.getByRole("button", { name: "New savings goal" }).click();
  await kidPage.getByLabel("What are you saving for?").fill(goal);
  await kidPage.getByLabel("It costs").fill("600");
  await kidPage.getByRole("button", { name: "Ask a grown-up" }).click();
  await expect(kidPage.getByText(goal).first()).toBeVisible();
  await expect(kidPage.getByText("Waiting for a grown-up", { exact: true })).toBeVisible();

  await adminPage.goto("/allowance");
  const request = adminPage.getByRole("listitem").filter({ hasText: goal });
  await request.getByLabel(`Share for ${goal}`).fill("10");
  await request.getByRole("button", { name: "Approve" }).click();
  await expect(adminPage.getByText("Waiting for a grown-up", { exact: true })).toHaveCount(0);

  await kidPage.reload();
  await expect(kidPage.getByText(goal).first()).toBeVisible();
  await expect(kidPage.getByText("Waiting for a grown-up", { exact: true })).toHaveCount(0);
  const members = await (await adminApi.get("/api/family/members")).json();
  const kid = members.find((m: { role: string }) => m.role === "child");
  const jars = await (await adminApi.get(`/api/allowance/jars?user_id=${kid.id}`)).json();
  for (const j of jars.jars) if (j.name === goal) await adminApi.delete(`/api/allowance/jars/${j.id}`);
});
