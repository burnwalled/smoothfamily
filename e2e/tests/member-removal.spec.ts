import { test, expect, unique } from "../fixtures";

// Removing a family member who's been using the app: what's the family's stays, what was theirs goes.
// On the real database, where every link to them counts.
test("removing a member who has been active", async ({ adminApi, playwright, baseURL }, info) => {
  test.skip(info.project.name !== "desktop");
  const username = unique("leaver").replace(/\W/g, "").toLowerCase();
  const password = "correct-horse-battery";
  const member = await (await adminApi.post("/api/family/members", { data: { display_name: "Leaver", username, password, role: "adult" } })).json();
  const leaver = await playwright.request.newContext({ baseURL });
  expect((await leaver.post("/api/auth/login", { data: { username, password } })).ok()).toBeTruthy();

  const today = new Date().toISOString().slice(0, 10);
  // One they've done, which is their history; one still open, which is the family's.
  const done = await (await leaver.post("/api/tasks", { data: { title: unique("Their done task"), points: 1, assignee_id: member.id, due_date: today } })).json();
  expect((await leaver.post(`/api/tasks/${done.id}/complete`)).ok()).toBeTruthy();
  const taskTitle = unique("Their task");
  expect((await leaver.post("/api/tasks", { data: { title: taskTitle, points: 1, assignee_id: member.id, due_date: today } })).ok()).toBeTruthy();
  const listName = unique("Their list");
  expect((await leaver.post("/api/lists", { data: { name: listName } })).ok()).toBeTruthy();
  const albumName = unique("Their album");
  expect((await leaver.post("/api/albums", { data: { name: albumName } })).ok()).toBeTruthy();
  const said = unique("Hej från mig");
  expect((await leaver.post("/api/chat/messages", { data: { peer: "family", body: said } })).ok()).toBeTruthy();
  expect((await leaver.post("/api/devices/hello", { data: {} })).status()).toBeLessThan(500);
  const shared = unique("Their subscription");
  expect((await leaver.post("/api/subscriptions", { data: { name: shared, amount: 10 } })).ok()).toBeTruthy();
  expect((await leaver.post("/api/subscriptions", { data: { name: unique("Their own subscription"), amount: 10, private: true } })).ok()).toBeTruthy();
  const file = "Datum;Text;Belopp\n2026-07-25;NETFLIX.COM;-129,00\n";
  expect((await leaver.post("/api/bank/parse", { multipart: { file: { name: "bank.csv", mimeType: "text/csv", buffer: Buffer.from(file) } } })).ok()).toBeTruthy();
  await leaver.dispose();

  expect((await adminApi.delete(`/api/family/members/${member.id}`)).status()).toBe(204);

  // The family's things are still here, the task without them.
  const tasks = await (await adminApi.get("/api/tasks")).json();
  const kept = (Array.isArray(tasks) ? tasks : tasks.items ?? []).find((t: { title: string }) => t.title === taskTitle);
  expect(kept).toBeTruthy();
  expect(kept.assignee_id ?? null).toBeNull();
  expect(JSON.stringify(await (await adminApi.get("/api/lists")).json())).toContain(listName);
  expect(JSON.stringify(await (await adminApi.get("/api/albums")).json())).toContain(albumName);
  const chat = await (await adminApi.get("/api/chat/messages?peer=family")).json();
  const message = chat.items.find((m: { body: string }) => m.body === said);
  expect(message.sender_name).toBe("Leaver");
  expect(message.sender_id).toBeNull();
  const subscriptions = await (await adminApi.get("/api/subscriptions")).json();
  const theirs = subscriptions.items.filter((x: { name: string }) => x.name.includes("subscription"));
  expect(theirs.map((x: { name: string }) => x.name)).toEqual([shared]);
  for (const item of theirs) await adminApi.delete(`/api/subscriptions/${item.id}`);
  const members = await (await adminApi.get("/api/family/members")).json();
  expect(members.find((m: { id: string }) => m.id === member.id)).toBeUndefined();

  for (const item of (await (await adminApi.get("/api/lists")).json()) as { id: string; name: string }[]) if (item.name === listName) await adminApi.delete(`/api/lists/${item.id}`);
  if (kept) await adminApi.delete(`/api/tasks/${kept.id}`);
});
