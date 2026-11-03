import { test, expect, unique } from "../fixtures";

// 3.4.0: address fields suggest real addresses (OpenStreetMap, asked by the server – faked here)
// and link the address to a map.
test("an address field suggests addresses and links to the map", async ({ adminPage: page }) => {
  await page.route("**/api/places?*", (route) =>
    route.fulfill({ json: [{ label: "Storgatan 1, 114 51 Stockholm", detail: "Sverige", lat: 59.33, lon: 18.07 }, { label: "Storgatan 1, 252 21 Helsingborg", detail: "Sverige", lat: 56.04, lon: 12.69 }] }),
  );
  await page.goto("/parties");
  await page.getByRole("button", { name: "New party" }).click();
  const form = page.getByRole("region", { name: "New party" });
  await form.getByLabel("Name").fill(unique("Adressfest"));
  const address = form.getByRole("combobox", { name: "Address" });
  await address.fill("Storgatan 1");
  const list = page.getByRole("listbox", { name: "Addresses" });
  await expect(list.getByRole("option")).toHaveCount(2);
  await address.press("ArrowDown");
  await address.press("ArrowDown");
  await address.press("Enter");
  await expect(address).toHaveValue("Storgatan 1, 252 21 Helsingborg");
  await expect(list).toHaveCount(0);
  await expect(form.getByRole("link", { name: "On the map" })).toHaveAttribute("href", /openstreetmap\.org\/search\?query=Storgatan%201%2C%20252%2021%20Helsingborg/);
});
