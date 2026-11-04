import { test, expect, unique } from "../fixtures";

// 3.0.4: each member has a page of their own in the family's settings – a parent sets a child's
// language, picture and birthday there, beside the apps, sign-in, medicines and emergency card.
test("a child's own page in the family's settings", async ({ adminPage: page, adminApi }) => {
  const name = unique("Nora");
  const child = await (await adminApi.post("/api/family/members", { data: { display_name: name, username: `nora${Date.now().toString(36)}`, password: "1234", role: "child" } })).json();
  try {
    await page.goto("/settings/members");
    await page.getByRole("link", { name: new RegExp(name) }).click();
    await expect(page).toHaveURL(new RegExp(`/settings/members/${child.id}$`));
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();

    await page.getByRole("combobox", { name: /Language in the app/ }).selectOption("sv");
    await page.getByRole("button", { name: "fox", exact: true }).click();
    await expect.poll(async () => {
      const me = (await (await adminApi.get("/api/family/members")).json()).find((m: { id: string }) => m.id === child.id);
      return `${me.language} ${me.avatar_key}`;
    }).toBe("sv preset:fox");

    const childBox = page.getByRole("region", { name: "Child", exact: true });
    await childBox.getByLabel("Birthday", { exact: true }).fill("2019-05-17");
    await childBox.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(async () => (await (await adminApi.get("/api/birthdays/people")).json()).find((p: { user_id: string }) => p.user_id === child.id)?.birth_day).toBe(17);

    // The rest of what is theirs, on the same page.
    await expect(page.getByRole("region", { name: "Signing in" })).toBeVisible();
    await expect(page.getByRole("region", { name: /^Apps \d+\/21$/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Emergency card", exact: true })).toBeVisible();
  } finally {
    await adminApi.delete(`/api/family/members/${child.id}`);
  }
});
