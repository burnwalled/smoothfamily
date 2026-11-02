import { test, expect, openFromMenu } from "../fixtures";

// #75: the frame stays mounted between pages, so moving around does not refetch the profile.
test("navigating keeps the shell and loads the profile once", async ({ adminPage: page }) => {
  let profileRequests = 0;
  page.on("request", (req) => {
    if (new URL(req.url()).pathname === "/api/auth/me") profileRequests += 1;
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  const afterLoad = profileRequests;

  // Lists sits behind "More" on phones, so both menu paths are covered.
  for (const path of ["/tasks", "/chat", "/lists", "/"]) {
    await openFromMenu(page, path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }

  expect(afterLoad).toBe(1);
  expect(profileRequests).toBe(afterLoad);
});
