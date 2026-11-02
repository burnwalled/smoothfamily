import { test, expect, unique, KID } from "../fixtures";

// #77: with the live stream up the chat only polls every 30 s, so a message showing within a few
// seconds proves it came over the stream.
test("a chat message shows up live in an open chat", async ({ adminPage, kidPage }) => {
  const text = unique("Live hello");
  await kidPage.goto("/chat");
  await expect(kidPage.locator('[data-live="on"]')).toBeVisible();
  await adminPage.goto("/chat");

  await adminPage.getByPlaceholder("Write a message...").fill(text);
  await adminPage.getByRole("button", { name: "Send", exact: true }).click();
  await expect(kidPage.getByText(text, { exact: true }).last()).toBeVisible({ timeout: 4000 });
});

// #62: a child completing a task lands in the adult's notification centre, live.
test("notifications arrive in the centre and link to where it happened", async ({ adminApi, adminPage, kidPage }) => {
  const title = unique("Water the plants");
  const members = await (await adminApi.get("/api/family/members")).json();
  const kid = members.find((m: { username: string }) => m.username === KID.username);
  await adminApi.post("/api/tasks", { data: { title, points: 3, assignee_id: kid.id, recurrence: "daily" } });

  await adminPage.goto("/");
  await expect(adminPage.locator('[data-live="on"]')).toBeVisible();
  const bell = adminPage.getByRole("link", { name: /^Notifications/ });
  const before = Number((await bell.getAttribute("aria-label"))?.match(/(\d+) unread/)?.[1] ?? 0);

  await kidPage.goto("/tasks");
  await kidPage.getByRole("listitem").filter({ hasText: title }).first().getByRole("button", { name: /Done \+3/ }).click();
  await expect(bell).toHaveAttribute("aria-label", `Notifications, ${before + 1} unread`, { timeout: 4000 });

  await bell.click();
  const item = adminPage.getByRole("button").filter({ hasText: title });
  await expect(item).toBeVisible();
  await item.click();
  await expect(adminPage).toHaveURL(/\/tasks\?tab=approvals$/);
  await expect(bell).toHaveAttribute("aria-label", before === 0 ? "Notifications" : `Notifications, ${before} unread`);
});
