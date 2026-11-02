import { test, expect } from "../fixtures";

// 3.0.2: the help centre – topics by category, search, a topic with its screenshot, and the ? next
// to an app's title leading to its help.
test("the help centre", async ({ adminPage: page }) => {
  await page.goto("/help");
  await expect(page.getByRole("region", { name: "Smart home and Home Assistant" })).toBeVisible();
  // The server's topics are there for the server's admin.
  await expect(page.getByRole("link", { name: /Backups and the backup key/ })).toBeVisible();

  await page.getByLabel("Search the help").fill("gateway");
  const hits = page.getByRole("region", { name: "Search results" });
  await hits.getByRole("link", { name: /The gateway/ }).click();
  await expect(page).toHaveURL(/\/help\/gateway$/);
  await expect(page.getByRole("heading", { name: "The gateway – Home Assistant in another home" })).toBeVisible();
  // The installation per kind of Home Assistant folds out.
  await page.getByText("Home Assistant Container or Core: as a container of its own").click();
  await expect(page.getByText(/docker build -t smooth-family-gateway/)).toBeVisible();
  const shot = page.getByRole("img", { name: "A home through the gateway, with its version." });
  await shot.scrollIntoViewIfNeeded();
  await expect.poll(() => shot.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);

  // The ? next to a page's title.
  await page.goto("/tasks");
  await page.getByRole("link", { name: "Help: Tasks" }).click();
  await expect(page).toHaveURL(/\/help\/tasks$/);
  await expect(page.getByRole("heading", { name: "Tasks and points" })).toBeVisible();
});

test("a child sees only the help for their apps", async ({ kidPage: page }) => {
  await page.goto("/help");
  await expect(page.getByRole("link", { name: /Tasks and points/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Server settings/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Family settings/ })).toHaveCount(0);
});
