import { test, expect, unique, KID } from "../fixtures";

// #56: a document with its number masked until shown.
test("a passport with a masked number", async ({ adminPage: page, adminApi }) => {
  const title = unique("Passport");
  await page.goto("/documents");
  await page.getByRole("button", { name: "Add document" }).click();
  await page.getByLabel("Whose").selectOption({ label: KID.name });
  await page.getByLabel("Name", { exact: true }).fill(title);
  await page.getByLabel("Number", { exact: true }).fill("AB 1234567");
  await page.getByRole("button", { name: "Save" }).click();
  const row = page.getByRole("listitem").filter({ hasText: title });
  await expect(row.getByText("•••• 4567")).toBeVisible();
  await row.getByRole("button", { name: "Show" }).click();
  await expect(row.getByText("AB 1234567")).toBeVisible();

  const docs = await (await adminApi.get("/api/documents")).json();
  await adminApi.delete(`/api/documents/${docs.find((d: { title: string }) => d.title === title).id}`);
});

// #54: the child's emergency card, read by a babysitter through a guest link.
test("a babysitter reads the emergency card through a guest link", async ({ adminPage: page, adminApi, browser }, info) => {
  const allergy = unique("Peanuts");
  const sitter = unique("Sara");
  // A member's card is changed on their page in the family's settings (3.0.4); guest links under Sharing.
  const kid = (await (await adminApi.get("/api/family/members")).json()).find((m: { username: string }) => m.username === KID.username);
  await page.goto(`/settings/members/${kid.id}`);
  await page.getByRole("button", { name: `Edit the card for ${KID.name}` }).click();
  // The emergency card (the child's allowance on the same page has the child's name too).
  const card = page.getByRole("region", { name: KID.name }).filter({ has: page.getByLabel("Allergies") });
  await card.getByLabel("Allergies").fill(allergy);
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText(allergy)).toBeVisible();

  await page.goto("/settings/sharing");
  await page.getByLabel("Who", { exact: true }).fill(sitter);
  await page.getByRole("button", { name: "Make a link" }).click();
  const url = await page.getByLabel("Guest link").inputValue();
  const path = new URL(url).pathname;

  const context = await browser.newContext({ ...info.project.use, storageState: undefined });
  const guest = await context.newPage();
  await guest.goto(path);
  await expect(guest.getByRole("heading", { name: `Hi ${sitter}!` })).toBeVisible();
  await expect(guest.getByText(allergy)).toBeVisible();

  // Revoked: the link stops working.
  const guests = await (await adminApi.get("/api/guests")).json();
  await adminApi.delete(`/api/guests/${guests.find((g: { name: string }) => g.name === sitter).id}`);
  await guest.reload();
  await expect(guest.getByText(/run out or been revoked/)).toBeVisible();
  await context.close();
});
