import { test, expect, unique, KID } from "../fixtures";

// #55: a parent adds a jar for what the child saves towards; the child puts money aside into it.
test("parents add savings jars and children save into them", async ({ adminApi, kidApi, adminPage, kidPage }) => {
  const members = await (await adminApi.get("/api/family/members")).json();
  const kid = members.find((m: { username: string }) => m.username === KID.username);
  const name = unique("Skateboard");
  try {
    await adminApi.put(`/api/allowance/children/${kid.id}/rate`, { data: { points_per_unit: 1 } });
    const task = await (await adminApi.post("/api/tasks", { data: { title: unique("Rake leaves"), points: 50, assignee_id: kid.id, recurrence: "daily" } })).json();
    await kidApi.post(`/api/tasks/${task.id}/complete`);
    const approval = (await (await adminApi.get("/api/tasks/approvals")).json()).find((a: { task_title: string }) => a.task_title === task.title);
    await adminApi.post(`/api/tasks/approvals/${approval.completion_id}`, { data: { action: "approve" } });

    await adminPage.goto("/allowance");
    const card = adminPage.locator("section").filter({ hasText: KID.name }).first();
    await card.getByRole("button", { name: "Add jar" }).first().click();
    await card.getByLabel("Name, e.g. Skateboard").fill(name);
    await card.getByLabel("Share of new allowance").fill("10");
    await card.getByLabel("Target").fill("1000000");
    await card.getByRole("button", { name: "Add", exact: true }).click();
    await expect(card.getByRole("progressbar", { name })).toBeVisible();

    await kidPage.goto("/allowance");
    await expect(kidPage.getByRole("progressbar", { name })).toBeVisible();
    await kidPage.getByLabel("To").selectOption({ label: `To ${name}` });
    await kidPage.getByLabel("Amount", { exact: true }).fill("1");
    await kidPage.getByRole("button", { name: "Move", exact: true }).click();
    await kidPage.getByRole("button", { name: "Show jar history" }).click();
    await expect(kidPage.getByText(`Moved · ${name}`).first()).toBeVisible();
  } finally {
    const jars = await (await adminApi.get(`/api/allowance/jars?user_id=${kid.id}`)).json();
    for (const jar of jars.jars) await adminApi.delete(`/api/allowance/jars/${jar.id}`);
  }
});
