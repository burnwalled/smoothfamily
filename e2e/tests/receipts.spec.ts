import { test, expect, unique, KID } from "../fixtures";

// 2.8.4: a receipt added in the vault from a screenshot, shared with the other home for a child,
// and the home insurance list.
test("a receipt from a screenshot, shared with the other home", async ({ adminPage: page }) => {
  const store = unique("Lindex");
  await page.goto("/vault?view=receipt");
  await page.getByRole("button", { name: "Add a receipt" }).click();
  const form = page.getByRole("form", { name: "Add a receipt" });
  // A screenshot from the phone: chosen as a picture (no camera needed).
  await form.getByText("Choose a picture or screenshot").setInputFiles({
    name: "screenshot.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
  });
  await form.getByLabel("Store").fill(store);
  await form.getByLabel("Amount").fill("400");
  await form.getByLabel("Category").selectOption("clothes");
  await form.getByLabel("A child's things shared with the other home").selectOption({ label: KID.name });
  await form.getByRole("button", { name: "Save the receipt" }).click();

  const row = page.getByRole("listitem").filter({ hasText: store });
  await expect(row.getByText(`${KID.name}, shared 50 %`)).toBeVisible();
  await expect(row.getByRole("button", { name: "Show the receipt" })).toBeVisible();
  await page.getByRole("button", { name: "The year in numbers" }).click();
  await expect(page.getByText("Shared costs for the children")).toBeVisible();
});

test("the list for the home insurance", async ({ adminPage: page }) => {
  const home = await (await page.request.post("/api/property/properties", { data: { name: unique("Villan") } })).json();
  await page.request.post("/api/property/items", { data: { property_id: home.id, name: "Diskmaskin", brand: "Bosch", price: 6990 } });
  await page.goto(`/property/insurance?id=${home.id}`);
  await expect(page.getByRole("heading", { name: `Home insurance list – ${home.name}` })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Diskmaskin" })).toBeVisible();
  await expect(page.getByText("In all: 6,990")).toBeVisible();
});
