import { test, expect, unique } from "../fixtures";

// 2.9.0: the setup guides – opened again from the settings here; a new family's admin lands in the
// family's by itself (hosting.spec.ts).
test("the server's setup guide, step by step", async ({ adminPage: page }) => {
  await page.goto("/server");
  await page.getByRole("link", { name: "Setup guide" }).click();
  await expect(page).toHaveURL(/\/welcome\?guide=server$/);
  await expect(page.getByRole("heading", { name: "Welcome, server admin" })).toBeVisible();
  await expect(page.getByText("Step 1 of 8")).toBeVisible();
  await page.getByRole("button", { name: "Let's start" }).click();

  await expect(page.getByRole("heading", { name: "The server's address" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Our advice" })).toBeVisible();
  await expect(page.getByLabel("The server's address")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();

  // The real setting, not a copy: 12 characters is the recommended choice.
  await expect(page.getByRole("heading", { name: "How everyone signs in" })).toBeVisible();
  await expect(page.getByRole("option", { name: "12 characters (recommended)" }).first()).toBeAttached();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "The server's address" })).toBeVisible();
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "The server is ready" })).toBeVisible();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page).toHaveURL(/\/server$/);
});

test("the family's setup guide shows the family's own settings", async ({ adminPage: page }) => {
  await page.goto("/settings/members");
  await page.getByRole("link", { name: "Setup guide" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to Smooth Family" })).toBeVisible();
  await page.getByRole("button", { name: "Let's start" }).click();
  await expect(page.getByRole("heading", { name: "Who's in the family" })).toBeVisible();
  await expect(page.getByText("Alex Admin").first()).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Calendars", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Emergency cards" })).toBeVisible();
  // Skipping from the middle goes back to the settings.
  await page.getByRole("button", { name: /Skip the guide/ }).click();
  await expect(page).toHaveURL(/\/settings\/members$/);
});

// 3.0.1: a child's birthday when added – 6 or younger starts in the little ones' mode, shown in the guide.
test("a young child starts in the little ones' mode", async ({ adminPage: page, adminApi }) => {
  const name = unique("Lilly");
  const username = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const born = new Date(Date.now() - 3 * 365 * 86_400_000).toISOString().slice(0, 10);
  await page.goto("/settings/members");
  // The member form (Other people below has a name field and an Add button too).
  const form = page.getByRole("region", { name: "Family members" });
  await form.getByPlaceholder("Name", { exact: true }).fill(name);
  await form.getByPlaceholder("username", { exact: true }).fill(username);
  await form.getByPlaceholder("Password").fill("1234");
  await form.locator("select").filter({ hasText: "Child" }).first().selectOption("child");
  await form.getByLabel("Birthday (optional)").fill(born);
  await form.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(name).first()).toBeVisible();
  const children = await (await adminApi.get("/api/easy/children")).json();
  const child = children.find((c: { display_name: string }) => c.display_name === name);
  try {
    expect(child.easy_mode).toBe(true);
    // In the family's guide, the children's step shows it as a switch.
    await page.goto("/welcome?guide=family");
    await page.getByRole("button", { name: "Let's start" }).click();
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next" }).click();
    const switches = page.getByRole("region", { name: "Little ones' mode" });
    await expect(switches.getByRole("checkbox", { name })).toBeChecked();
  } finally {
    await adminApi.delete(`/api/family/members/${child.id}`);
  }
});
