import { test, expect, unique } from "../fixtures";

// #88 / #89: invite a family, let them try the demo, create their own family; then move it
// (encrypted export → delete → import) on the real PostgreSQL database.
test("invite a family: demo first, then their own family", async ({ adminPage, adminApi, browser, playwright, baseURL }, info) => {
  const label = unique("The Guests");
  await adminPage.goto("/server");
  await adminPage.getByLabel("Who is it for? e.g. The Anderssons").fill(label);
  await adminPage.getByLabel("Valid for").first().selectOption("14");
  await adminPage.getByRole("button", { name: "Create invitation" }).click();
  const link = await adminPage.getByLabel("Invitation link").inputValue();
  expect(link).toMatch(/\/invite\/[\w-]+$/);

  // The guest has no account on the server – a fresh browser.
  const context = await browser.newContext({ ...info.project.use, storageState: undefined });
  const guest = await context.newPage();
  await guest.goto(link);
  await expect(guest.getByText(`Invitation: ${label}`)).toBeVisible();
  await guest.getByRole("button", { name: "Try the demo" }).click();
  await expect(guest.getByText("Demo – sample data")).toBeVisible();
  await guest.getByRole("button", { name: "Maja", exact: true }).click();
  await expect(guest.getByRole("button", { name: "Maja", exact: true })).toHaveAttribute("aria-pressed", "true");
  await guest.getByRole("button", { name: "Start over" }).click();
  await expect(guest.getByRole("button", { name: "Anna", exact: true })).toHaveAttribute("aria-pressed", "true");

  await guest.getByRole("button", { name: "Create my own family" }).click();
  await expect(guest).toHaveURL(/\/invite\//);
  const username = unique("guest").replace(/\s/g, "-").toLowerCase();
  await guest.getByLabel("Family name").fill(label);
  await guest.getByLabel("Your name").fill("Gina");
  await guest.getByLabel("E-mail").fill("gina@example.com");
  await guest.getByLabel("Username").fill(username);
  await guest.getByLabel("Password").fill("guest-password-1");
  await guest.getByRole("button", { name: "Create family" }).click();
  // A new family's admin starts in the family's setup guide (2.9.0) – and may skip it.
  await expect(guest).toHaveURL(/\/welcome$/);
  await expect(guest.getByRole("heading", { name: "Welcome to Smooth Family" })).toBeVisible();
  await guest.getByRole("button", { name: /Skip the guide/ }).click();
  await expect(guest).toHaveURL(/\/$/);
  await expect(guest.getByText(label, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(guest.getByText("Demo – sample data")).toHaveCount(0);
  // A hosted family brings its own Home Assistant through the add-on – never by address (2.8.4).
  await guest.goto("/settings/smarthome");
  await expect(guest.getByText(/connects to this server through the Smooth Family add-on/)).toBeVisible();
  await expect(guest.getByRole("button", { name: "Add a home through the add-on" })).toBeVisible();
  await expect(guest.getByPlaceholder(/8123/)).toHaveCount(0);
  await context.close();

  // Move the family on PostgreSQL: export, remove, import – the guest can sign in again.
  const families = await (await adminApi.get("/api/server/families")).json();
  const family = families.find((f: { name: string }) => f.name === label);
  const exported = await adminApi.post(`/api/server/families/${family.id}/export`, { data: { passphrase: "correct horse battery" } });
  expect(exported.ok()).toBeTruthy();
  const blob = await exported.body();
  expect((await adminApi.delete(`/api/server/families/${family.id}?confirm=${encodeURIComponent(label)}`)).status()).toBe(204);
  const imported = await adminApi.post(`/api/server/families/import?passphrase=${encodeURIComponent("correct horse battery")}`, {
    data: blob,
    headers: { "Content-Type": "application/octet-stream" },
  });
  expect(imported.status()).toBe(201);
  // A separate session, so the admin's own session stays the admin's.
  const guestApi = await playwright.request.newContext({ baseURL });
  expect((await guestApi.post("/api/auth/login", { data: { username, password: "guest-password-1" } })).status()).toBe(200);
  await guestApi.dispose();
  // Clean up so the phone run starts the same way.
  await adminApi.delete(`/api/server/families/${family.id}?confirm=${encodeURIComponent(label)}`);
});
