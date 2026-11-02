import { test, expect, unique } from "../fixtures";

// #69: groceries scanned in one after another (typed here – the test browser has no camera), the
// same one again counts up, the family remembers the barcode, and a place is counted.
const code = () => "20" + String(Date.now()).slice(-10) + String(Math.floor(Math.random() * 10));

test("scanning groceries in and taking stock", async ({ adminPage: page, adminApi }) => {
  const barcode = code();
  const name = unique("Oat milk");
  try {
    await page.goto("/pantry");
    await page.getByRole("button", { name: "Scan groceries" }).click();
    const scan = page.getByRole("dialog", { name: "Scan in groceries" });
    const typed = scan.getByLabel("Barcode number or name");
    await typed.fill(barcode);
    await typed.press("Enter");
    await scan.getByPlaceholder("New item – what is it?").fill(name);
    await typed.fill(barcode);
    await typed.press("Enter");
    await expect(scan.getByLabel("Amount")).toHaveValue("2");
    await scan.getByRole("button", { name: "Put 2 in the pantry" }).click();
    await expect(scan.getByText("2 saved in the pantry.")).toBeVisible();

    // Next time it fills itself in.
    await scan.getByRole("button", { name: "Scan more" }).click();
    await typed.fill(barcode);
    await typed.press("Enter");
    await expect(scan.getByLabel("Name", { exact: true })).toHaveValue(name);
    await expect(scan.getByText("Known in the family")).toBeVisible();
    await scan.getByRole("button", { name: "Empty the list" }).click();

    // Stocktaking the fridge: only one left.
    await scan.getByRole("button", { name: "Take stock" }).click();
    await scan.getByLabel("Counting").selectOption("fridge");
    await typed.fill(barcode);
    await typed.press("Enter");
    await expect(scan.getByLabel("Name", { exact: true })).toHaveValue(name);
    await scan.getByRole("button", { name: "One less" }).click();
    await scan.getByRole("button", { name: "One more" }).click();
    await scan.getByRole("button", { name: "One less" }).click();
    await expect(scan.getByLabel("Amount")).toHaveValue("0");
    await scan.getByRole("button", { name: "One more" }).click();
    await scan.getByRole("button", { name: /^Save the count of the Fridge/ }).click();
    // Other things in the fridge (from other tests) may be asked about; leave them be.
    await scan.getByRole("button", { name: "Done" }).click();
    await expect(scan).toHaveCount(0);

    const items = (await (await adminApi.get("/api/pantry?place=fridge")).json()).filter((i: { barcode: string }) => i.barcode === barcode);
    expect(items.map((i: { amount: number }) => i.amount)).toEqual([1]);
    await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
  } finally {
    for (const i of await (await adminApi.get("/api/pantry")).json()) if (i.barcode === barcode) await adminApi.delete(`/api/pantry/${i.id}`);
  }
});

test("the kitchen display scans when allowed", async ({ adminApi, browser }, info) => {
  const barcode = code();
  const name = unique("Crispbread");
  const screen = await (await adminApi.post("/api/kiosks", { data: { name: unique("Kitchen"), pantry_scan: true } })).json();
  const context = await browser.newContext({ ...info.project.use, storageState: undefined });
  try {
    const tablet = await context.newPage();
    await tablet.goto(new URL(screen.url, "http://screen").pathname);
    await tablet.getByRole("button", { name: "Scan groceries" }).click();
    const scan = tablet.getByRole("dialog", { name: "Scan in groceries" });
    await scan.getByLabel("Barcode number or name").fill(barcode);
    await scan.getByLabel("Barcode number or name").press("Enter");
    await scan.getByPlaceholder("New item – what is it?").fill(name);
    await scan.getByRole("button", { name: "Put 1 in the pantry" }).click();
    await expect(scan.getByText("1 saved in the pantry.")).toBeVisible();
    const items = (await (await adminApi.get("/api/pantry")).json()).filter((i: { barcode: string }) => i.barcode === barcode);
    expect(items.map((i: { name: string }) => i.name)).toEqual([name]);

    // Not allowed any more: the button is gone.
    await adminApi.put(`/api/kiosks/${screen.id}`, { data: { pantry_scan: false } });
    await tablet.reload();
    await expect(tablet.getByText("E2E Family", { exact: false })).toBeVisible();
    await expect(tablet.getByRole("button", { name: "Scan groceries" })).toHaveCount(0);
  } finally {
    await context.close();
    for (const i of await (await adminApi.get("/api/pantry")).json()) if (i.barcode === barcode) await adminApi.delete(`/api/pantry/${i.id}`);
    await adminApi.delete(`/api/kiosks/${screen.id}`);
  }
});
