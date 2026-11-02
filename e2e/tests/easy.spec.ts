import { test, expect, unique } from "../fixtures";

// 2.5.5: an adult turns the little ones' mode on and makes a morning routine from the ready-made
// one; the child sees big picture cards instead of the app, ticks them off and gets a sticker. A
// grown-up gets out with the sum.
test("the little ones' mode", async ({ adminPage: page, adminApi, browser }, info) => {
  const name = unique("Tiny");
  const username = `tiny${Date.now().toString(36)}`;
  const child = await (await adminApi.post("/api/family/members", { data: { display_name: name, username, password: "1234", role: "child" } })).json();
  const context = await browser.newContext({ ...info.project.use, storageState: undefined });
  try {
    await page.goto("/tasks");
    await page.getByRole("link", { name: /Little ones' mode/ }).click();
    await page.getByRole("tab", { name: new RegExp(name) }).click();
    await page.getByLabel(`${name} sees the little ones' mode`).check();
    await page.getByRole("button", { name: "Morning", exact: false }).first().click();
    // The ready-made morning, shortened to two steps.
    const steps = page.getByRole("textbox", { name: /^Step \d+$/ });
    await expect(steps.first()).toHaveValue("Toilet");
    while ((await steps.count()) > 2) await page.getByRole("button", { name: "Remove" }).last().click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Morning" })).toBeVisible();

    const tablet = await context.newPage();
    await tablet.request.post("/api/auth/login", { data: { username, password: "1234" } });
    await tablet.goto("/");
    await expect(tablet.getByRole("heading", { name: `Hi ${name}!` })).toBeVisible();
    // No menu – only the pictures.
    await expect(tablet.getByRole("link", { name: "Calendar" })).toHaveCount(0);
    await tablet.getByRole("button", { name: "Toilet", exact: true }).click();
    await expect(tablet.getByRole("button", { name: "Toilet, done" })).toBeVisible();
    await tablet.getByRole("button", { name: "Brush teeth", exact: true }).click();
    const party = tablet.getByRole("button", { name: "Well done!" });
    await expect(party).toBeVisible();
    await party.click();
    await expect(tablet.getByText("Done!", { exact: true })).toBeVisible();
    await expect(tablet.getByRole("button", { name: /Sticker album, 1 stickers/ })).toBeVisible();

    // The finished routine waits for an adult, as children's tasks do.
    const approvals = await (await adminApi.get("/api/tasks/approvals")).json();
    expect(approvals.some((a: { task_title: string; user_name?: string }) => a.task_title === "Morning")).toBe(true);
  } finally {
    await context.close();
    await adminApi.delete(`/api/family/members/${child.id}`);
  }
});

// Several little ones on the same family tablet, when the screen link allows it.
test("the little ones on a shared family tablet", async ({ adminPage: page, adminApi, browser }, info) => {
  const kids = [unique("Ada"), unique("Bo")];
  const made: { id: string }[] = [];
  const context = await browser.newContext({ ...info.project.use, storageState: undefined });
  try {
    for (const [i, name] of kids.entries()) {
      const child = await (await adminApi.post("/api/family/members", { data: { display_name: name, username: `fam${i}${Date.now().toString(36)}`, password: "1234", role: "child" } })).json();
      made.push(child);
      await adminApi.put(`/api/easy/children/${child.id}`, { data: { easy_mode: true } });
      await adminApi.post("/api/easy/routines", { data: { user_id: child.id, name: "Evening", picture: "🌙", steps: [{ picture: "🪥", label: "Brush teeth" }] } });
    }
    await page.goto("/settings/kiosk");
    await page.getByLabel("Screen name").fill(unique("Family tablet"));
    // In the box for a new screen (each connected screen has the same choice further down).
    await page.getByRole("region", { name: "Kitchen display" }).getByRole("checkbox", { name: /^Children in the little ones' mode can open their routines For a shared/ }).check();
    await page.getByRole("button", { name: "Connect a screen" }).click();
    const url = await page.getByLabel("Screen link").inputValue();

    const tablet = await context.newPage();
    await tablet.goto(new URL(url, "http://screen").pathname);
    for (const name of kids) {
      await tablet.getByRole("button", { name: `${name}'s routines` }).click();
      await expect(tablet.getByRole("heading", { name: `Hi ${name}!` })).toBeVisible();
      await tablet.getByRole("button", { name: "Brush teeth", exact: true }).click();
      await tablet.getByRole("button", { name: "Well done!" }).click();
      await expect(tablet.getByText("Done!", { exact: true })).toBeVisible();
      await tablet.getByRole("button", { name: "Close" }).click();
    }

    // Without the choice the screen doesn't show them.
    const plain = await (await adminApi.post("/api/kiosks", { data: { name: unique("Hall") } })).json();
    await tablet.goto(new URL(plain.url, "http://screen").pathname);
    await expect(tablet.getByText("E2E Family", { exact: false })).toBeVisible();
    await expect(tablet.getByRole("button", { name: `${kids[0]}'s routines` })).toHaveCount(0);
    await adminApi.delete(`/api/kiosks/${plain.id}`);
  } finally {
    await context.close();
    for (const child of made) await adminApi.delete(`/api/family/members/${child.id}`);
  }
});
