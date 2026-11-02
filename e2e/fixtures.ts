import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";

// The family that global-setup creates on the empty test stack.
export const ADMIN = { username: "admin", password: "e2e-password-1", name: "Alex Admin" };
export const KID = { username: "kid", password: "kidpass", name: "Kim Kid" };
export const FAMILY = "E2E Family";

export const STATE = { admin: ".auth/admin.json", kid: ".auth/kid.json" };

// Unique per test run, so a kept stack can be reused without clashing names.
export const unique = (label: string) => `${label} ${Date.now().toString(36)}`;

type Fixtures = {
  adminPage: Page;
  kidPage: Page;
  adminApi: APIRequestContext;
  kidApi: APIRequestContext;
};

// The Content-Security-Policy is enforced in the tests: a page where it stops something fails.
function watchCsp(page: Page): string[] {
  const stopped: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && /Content Security Policy/i.test(msg.text())) stopped.push(msg.text().slice(0, 300));
  });
  return stopped;
}

// Each role gets its own signed-in browser context (cookie from global-setup).
export const test = base.extend<Fixtures>({
  page: async ({ page }, use) => {
    const stopped = watchCsp(page);
    await use(page);
    expect(stopped, "Content-Security-Policy violations").toEqual([]);
  },
  adminPage: async ({ browser }, use, info) => {
    const context = await browser.newContext({ ...info.project.use, storageState: STATE.admin });
    const page = await context.newPage();
    const stopped = watchCsp(page);
    await use(page);
    await context.close();
    expect(stopped, "Content-Security-Policy violations").toEqual([]);
  },
  kidPage: async ({ browser }, use, info) => {
    const context = await browser.newContext({ ...info.project.use, storageState: STATE.kid });
    const page = await context.newPage();
    const stopped = watchCsp(page);
    await use(page);
    await context.close();
    expect(stopped, "Content-Security-Policy violations").toEqual([]);
  },
  adminApi: async ({ playwright, baseURL }, use) => {
    const api = await playwright.request.newContext({ baseURL, storageState: STATE.admin });
    await use(api);
    await api.dispose();
  },
  kidApi: async ({ playwright, baseURL }, use) => {
    const api = await playwright.request.newContext({ baseURL, storageState: STATE.kid });
    await use(api);
    await api.dispose();
  },
});

// A link in the app menu: the sidebar on desktop, the bottom bar or the More sheet on phones. Found by href, since badges ("Tasks 4") become part of the link's name.
export async function openFromMenu(page: Page, href: string) {
  const link = page.locator(`nav a[href="${href}"]:visible`);
  if ((await link.count()) === 0) {
    // Phones: the apps beyond the bottom bar are under "More".
    await page.locator("nav[data-mobile-nav]").getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("dialog").locator(`a[href="${href}"]`).click();
    return;
  }
  await link.click();
}

export { expect };
export type { Page };
