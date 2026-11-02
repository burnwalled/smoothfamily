import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, unique } from "../fixtures";

const SHOTS = process.env.E2E_SHOTS;

// A tiny PNG for uploads.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

// 2.8.1: the vault – photos and albums, chat pictures, receipts and documents, with filters.
test("the vault keeps the family's files with a filter per kind", async ({ adminPage: page, adminApi }) => {
  const name = unique("Summer");
  const album = await (await adminApi.post("/api/albums", { data: { name } })).json();
  const doc = await (await adminApi.post("/api/documents", { data: { kind: "insurance", title: unique("Home insurance") } })).json();
  try {
    await adminApi.post(`/api/documents/${doc.id}/files`, { multipart: { file: { name: "policy.png", mimeType: "image/png", buffer: PNG } } });

    // Old links to Photos land in the vault.
    await page.goto("/photos");
    await expect(page).toHaveURL(/\/vault\?view=photo$/);
    await expect(page.getByRole("heading", { name: "Vault", level: 1 })).toBeVisible();

    // Upload a photo into the album from the Photos view.
    await page.getByLabel("Upload to").selectOption({ label: name });
    await page.locator('input[type="file"]').setInputFiles({ name: "beach.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByRole("button", { name: /^beach.png/ }).first()).toBeVisible();

    // The album shows with its photo; Documents shows the scan.
    await page.getByRole("button", { name: "Albums", exact: true }).click();
    await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
    await expect(page.getByRole("button", { name: /^beach.png/ })).toBeVisible();
    // Documents is the register itself; its scan opens in the vault's viewer.
    await page.getByRole("button", { name: "Documents", exact: true }).click();
    await expect(page.getByText(doc.title)).toBeVisible();
    await page.getByRole("button", { name: /^policy.png/ }).click();
    await expect(page.getByRole("dialog", { name: doc.title }).getByRole("img", { name: doc.title })).toBeVisible();
    await page.getByRole("dialog", { name: doc.title }).getByRole("button", { name: "Close" }).click();

    // Search across everything.
    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(page.getByRole("button", { name: /^beach.png/ })).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/vault-${test.info().project.name}.png` });
    await page.getByLabel("Search the vault").fill("beach");
    await expect(page.getByRole("button", { name: /^beach.png/ })).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(doc.title) })).toHaveCount(0);

    // A photo opens large and can be removed.
    await page.getByRole("button", { name: /^beach.png/ }).click();
    const viewer = page.getByRole("dialog", { name: "beach.png" });
    await expect(viewer).toBeVisible();
    await viewer.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("button", { name: /^beach.png/ })).toHaveCount(0);
  } finally {
    await adminApi.delete(`/api/albums/${album.id}`);
    await adminApi.delete(`/api/documents/${doc.id}`);
  }
});

// The password manager: a strong password is made, shown only on request, and kept encrypted.
test("the vault keeps logins with a generated password", async ({ adminPage: page, adminApi }, info) => {
  const title = unique("Netflix");
  try {
    await page.goto("/vault?view=logins");
    await page.getByRole("button", { name: "Add a login" }).click();
    await page.getByLabel("Name", { exact: true }).fill(title);
    await page.getByLabel("Web address").fill("netflix.com");
    await page.getByLabel("Username").fill("family@example.com");
    // A strong password is already there.
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue(/^.{20}$/);
    await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    const row = page.getByRole("listitem").filter({ hasText: title });
    await expect(row.getByRole("link", { name: "netflix.com" })).toHaveAttribute("href", "https://netflix.com");
    await expect(row.getByText("••••••••••")).toBeVisible();
    await expect(row.getByText("correct-horse-battery")).toHaveCount(0);
    await row.getByRole("button", { name: `Show the password for ${title}` }).click();
    await expect(row.getByText("correct-horse-battery")).toBeVisible();
    if (info.project.name === "desktop") {
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
      await row.getByRole("button", { name: `Copy the password for ${title}` }).click();
      await expect(page.getByRole("status")).toContainText("Password copied");
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("correct-horse-battery");
    }
  } finally {
    const rows = await (await adminApi.get("/api/vault/logins")).json();
    for (const r of rows) if (r.title === title) await adminApi.delete(`/api/vault/logins/${r.id}`);
  }
});

// A link out of the vault: a guest without an account looks (no download), until it is closed.
test("a photo shared with a link that can be closed", async ({ adminPage: page, adminApi, browser }, info) => {
  const name = unique("Trip");
  const who = unique("Grandma");
  const album = await (await adminApi.post("/api/albums", { data: { name } })).json();
  try {
    await adminApi.post(`/api/albums/${album.id}/media`, { multipart: { file: { name: "view.png", mimeType: "image/png", buffer: PNG } } });
    await page.goto("/vault?view=photo");
    await page.getByRole("button", { name: /^view.png/ }).first().click();
    await page.getByRole("dialog", { name: "view.png" }).getByRole("button", { name: "Share" }).click();
    const dialog = page.getByRole("dialog", { name: "Share “view.png” with a link" });
    await dialog.getByLabel("For whom (only you see this)").fill(who);
    await dialog.getByLabel("Works for").selectOption({ label: "1 hour" });
    await dialog.getByRole("button", { name: "Make the link" }).click();
    const url = await dialog.getByLabel("The link").inputValue();
    expect(url).toMatch(/\/share\/[\w-]{20,}$/);

    // Someone without an account.
    const guest = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } });
    const visitor = await guest.newPage();
    await visitor.goto(new URL(url).pathname);
    await expect(visitor.getByRole("heading", { name: "view.png" })).toBeVisible();
    await expect(visitor.getByRole("img", { name: "view.png" })).toBeVisible();
    await expect(visitor.getByRole("link", { name: "Download" })).toHaveCount(0);

    // Closed from the vault's list of links.
    await page.keyboard.press("Escape");
    await page.goto("/vault?view=shares");
    const link = page.getByRole("listitem").filter({ hasText: `For ${who}` });
    await link.getByRole("button", { name: "Close the link to view.png" }).click();
    await expect(link.getByText("Closed or run out")).toBeVisible();
    await visitor.reload();
    await expect(visitor.getByRole("heading", { name: "The link doesn't work any more" })).toBeVisible();
    await guest.close();
  } finally {
    await adminApi.delete(`/api/albums/${album.id}`);
  }
});

// A Word document is shown in the page, drawn in the browser.
test("a Word document opens in the vault", async ({ adminPage: page, adminApi }) => {
  const doc = await (await adminApi.post("/api/documents", { data: { kind: "contract", title: unique("Letter") } })).json();
  try {
    const word = readFileSync(join(__dirname, "../files/sample.docx"));
    await adminApi.post(`/api/documents/${doc.id}/files`, {
      multipart: { file: { name: "letter.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: word } },
    });
    await page.goto("/vault?view=document");
    await page.getByRole("button", { name: "letter.docx", exact: true }).click();
    await expect(page.getByRole("dialog", { name: doc.title }).getByText("Shown in the browser by the vault.")).toBeVisible();
  } finally {
    await adminApi.delete(`/api/documents/${doc.id}`);
  }
});

// Excel shows its values as a table (a sheet per tab); PowerPoint each slide's text and pictures.
test("Excel and PowerPoint open in the vault", async ({ adminPage: page, adminApi }) => {
  const doc = await (await adminApi.post("/api/documents", { data: { kind: "other", title: unique("Plans") } })).json();
  try {
    const upload = (name: string, mimeType: string) =>
      adminApi.post(`/api/documents/${doc.id}/files`, { multipart: { file: { name, mimeType, buffer: readFileSync(join(__dirname, `../files/${name}`)) } } });
    await upload("sample.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    await upload("sample.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    await page.goto("/vault?view=document");

    await page.getByRole("button", { name: "sample.xlsx", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: doc.title });
    await expect(sheet.getByRole("cell", { name: "Groceries" })).toBeVisible();
    await expect(sheet.getByRole("cell", { name: "1234.5" })).toBeVisible();
    // A date cell is shown as a date, not the number Excel keeps.
    await expect(sheet.getByRole("cell", { name: "2026-10-29" })).toBeVisible();
    await sheet.getByRole("button", { name: "Notes" }).click();
    await expect(sheet.getByRole("cell", { name: "Second sheet" })).toBeVisible();
    await sheet.getByRole("button", { name: "Close" }).click();

    await page.getByRole("button", { name: "sample.pptx", exact: true }).click();
    const slides = page.getByRole("dialog", { name: doc.title });
    await expect(slides.getByRole("region", { name: "Slide 1" }).getByText("Summer trip")).toBeVisible();
    await expect(slides.getByRole("region", { name: "Slide 2" }).locator("img")).toHaveCount(1);
  } finally {
    await adminApi.delete(`/api/documents/${doc.id}`);
  }
});

// Any file goes in the vault; "only me" keeps it to yourself. Everything has a share button.
test("any file in the vault, with a share button", async ({ adminPage: page, adminApi }) => {
  const name = `${unique("notes")}.txt`;
  try {
    await page.goto("/vault?view=file");
    await page.getByLabel("Only me").check();
    await page.locator('input[type="file"]:not([accept])').setInputFiles({ name, mimeType: "text/plain", buffer: Buffer.from("milk, eggs") });
    const tile = page.getByRole("button", { name: new RegExp(`^${name}`) });
    await expect(tile).toBeVisible();
    await expect(page.getByRole("button", { name: `Share “${name}” with a link` })).toBeVisible();
    await tile.click();
    // A text file isn't shown: it is downloaded.
    await expect(page.getByRole("dialog", { name }).getByRole("link", { name: "Download the document" })).toBeVisible();
  } finally {
    const rows = await (await adminApi.get("/api/vault?source=file")).json();
    for (const r of rows) if (r.title === name) await adminApi.delete(`/api/vault/files/${r.id}`);
  }
});
