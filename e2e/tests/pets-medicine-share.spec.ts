import { test, expect, unique, KID } from "../fixtures";

// #64 / #66: a pet with a chore the children take turns on.
test("a pet with a chore the children take turns on", async ({ adminPage: page, adminApi }) => {
  const pet = unique("Sixten");
  await page.goto("/pets");
  await page.getByLabel("Name", { exact: true }).fill(pet);
  await page.getByLabel("Species").selectOption("dog");
  await page.getByRole("button", { name: "Add", exact: true }).last().click();
  const card = page.locator("section").filter({ hasText: pet }).first();
  await expect(card.getByRole("heading", { name: new RegExp(pet) })).toBeVisible();

  // The same form as Tasks (3.4.0): every other day, taking turns, its points.
  await card.getByRole("button", { name: "Add chore" }).click();
  await card.getByLabel("What needs doing?").fill(`Walk ${pet}`);
  await card.getByLabel("How often").selectOption({ label: "Every other day" });
  await card.getByRole("spinbutton", { name: "Points" }).fill("7");
  await card.getByLabel("Take turns").check();
  await card.getByRole("button", { name: KID.name }).click();
  await card.getByRole("button", { name: "Alex Admin" }).click();
  await card.getByRole("button", { name: "Save task" }).click();
  const chore = card.getByRole("listitem").filter({ hasText: `Walk ${pet}` });
  await expect(chore).toContainText("Every other day");
  await expect(chore).toContainText(KID.name);
  await expect(chore).toContainText("7");

  const pets = await (await adminApi.get("/api/pets")).json();
  const id = pets.find((p: { name: string }) => p.name === pet).id;
  await adminApi.delete(`/api/pets/${id}`);
});

// #67: a child's medicine, ticked off by an adult.
test("a child's medicine dose is ticked off", async ({ adminPage: page, adminApi }) => {
  const name = unique("Penicillin");
  // A child's medicine is set up on the child's page in the family's settings (3.0.4).
  const kid = (await (await adminApi.get("/api/family/members")).json()).find((m: { username: string }) => m.username === KID.username);
  await page.goto(`/settings/members/${kid.id}`);
  await page.getByRole("button", { name: "Add medicine" }).click();
  await page.getByLabel("For", { exact: true }).selectOption({ label: KID.name });
  await page.getByRole("textbox", { name: "Medicine", exact: true }).fill(name);
  await page.getByLabel("Times").fill("08:00, 20:00");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const card = page.getByRole("listitem").filter({ hasText: name });
  await expect(card.getByText("a task, 5 points")).toBeVisible();

  // Each dose is a task for the child (2.9.0); an adult may give it, and the dose is taken.
  await page.goto("/tasks");
  const dose = page.getByRole("listitem").filter({ hasText: `${name} · 08:00` });
  await dose.getByRole("button", { name: "Done +5" }).click();
  await expect(dose.getByText(`Done – ${KID.name}`)).toBeVisible();
  await page.goto(`/settings/members/${kid.id}`);
  await expect(card.getByRole("button", { name: /08:00/ })).toHaveAttribute("aria-pressed", "true");

  const meds = await (await adminApi.get("/api/medicine")).json();
  await adminApi.delete(`/api/medicine/${meds.find((m: { name: string }) => m.name === name).id}`);
});

// Share a wish list with a relative outside the app, who reserves a wish.
test("a relative reserves a wish through a share link", async ({ adminApi, browser }, info) => {
  const members = await (await adminApi.get("/api/family/members")).json();
  const kid = members.find((m: { username: string }) => m.username === KID.username);
  const wish = unique("Kite");
  const person = await (await adminApi.post("/api/birthdays/people", { data: { name: unique("Kim"), user_id: kid.id, birth_month: 6, birth_day: 1 } })).json();
  await adminApi.post(`/api/birthdays/people/${person.id}/wishes`, { data: { title: wish } });
  const share = await (await adminApi.post(`/api/birthdays/people/${person.id}/shares`, { data: { days: 30 } })).json();

  const context = await browser.newContext({ ...info.project.use, storageState: undefined });
  const gran = await context.newPage();
  await gran.goto(share.url.startsWith("http") ? share.url : share.url);
  await gran.getByLabel("Your name").fill("Grandma");
  await gran.getByRole("listitem").filter({ hasText: wish }).getByRole("button", { name: "I'm buying this" }).click();
  await expect(gran.getByRole("listitem").filter({ hasText: wish }).getByText("You're buying this")).toBeVisible();
  await context.close();

  const wishes = await (await adminApi.get(`/api/birthdays/people/${person.id}/wishes`)).json();
  expect(wishes.find((w: { title: string }) => w.title === wish).reserved_by_name).toBe("Grandma");
  await adminApi.delete(`/api/birthdays/people/${person.id}`);
});
