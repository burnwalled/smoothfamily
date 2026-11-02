import { test, expect } from "../fixtures";

// 2.9.0: the Content-Security-Policy – an injected script doesn't run, the app's own do.
test("an injected script is stopped by the Content-Security-Policy", async ({ browser }, info) => {
  const context = await browser.newContext({ ...info.project.use, storageState: ".auth/admin.json" });
  const page = await context.newPage();
  const stopped: string[] = [];
  page.on("console", (m) => /Content Security Policy/i.test(m.text()) && stopped.push(m.text()));
  const response = await page.goto("/");
  const policy = response!.headers()["content-security-policy"] ?? "";
  expect(policy).toContain("script-src 'self' 'nonce-");
  expect(policy).toContain("frame-ancestors 'none'");
  await expect(page.getByRole("navigation").first()).toBeVisible();
  // What a stored XSS looks like: someone's text read as HTML, with code in an attribute.
  await page.evaluate(() => {
    const div = document.createElement("div");
    div.innerHTML = '<img src="/does-not-exist.png" onerror="window.__injected = true"><img src="https://evil.example/x.png">';
    document.body.appendChild(div);
  });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { __injected?: boolean }).__injected)).toBeUndefined();
  expect(stopped.length).toBeGreaterThan(0);
  await context.close();
});
