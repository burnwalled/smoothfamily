import { test, expect } from "../fixtures";

// 3.4.0: departures from several providers – the server admin adds the keys; SL needs none.
test("the server admin adds a departures key, and the widget can use the provider", async ({ adminPage: page, adminApi }) => {
  await page.goto("/server");
  await page.getByRole("button", { name: "Address and services" }).click();
  const keys = page.getByRole("group", { name: "Departures (public transport)" });
  await expect(keys.getByText("SL", { exact: true })).toBeVisible();
  await keys.getByLabel("API key for Trafiklab").fill("e2e-not-a-real-key-123");
  await keys.getByRole("button", { name: "Save" }).first().click();
  await expect(keys.getByText("Key added")).toBeVisible();
  // The key is never shown again; the providers list now has Trafiklab.
  expect(JSON.stringify(await (await adminApi.get("/api/admin/integrations/transit")).json())).not.toContain("e2e-not-a-real-key-123");
  const providers = await (await adminApi.get("/api/transit/providers")).json();
  expect(providers.find((p: { id: string }) => p.id === "trafiklab").available).toBe(true);
  expect(providers.find((p: { id: string }) => p.id === "sl").available).toBe(true);

  await keys.getByRole("button", { name: "Remove" }).click();
  await expect(keys.getByLabel("API key for Trafiklab")).toBeVisible();
});
