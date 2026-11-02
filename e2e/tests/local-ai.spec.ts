import { test, expect } from "../fixtures";

// The local AI is optional: without it the AI page says so and nothing else changes; the server
// admin can only point it at an address on the home network.
test("local AI settings stay at home", async ({ adminPage: page }) => {
  await page.goto("/ai");
  await expect(page.getByText(/isn't set up for your family/)).toBeVisible();

  await page.goto("/server");
  await page.getByRole("button", { name: "AI computer" }).click();
  const panel = page.getByRole("region", { name: "Local AI" });
  await expect(panel.getByText("Not set up yet.")).toBeVisible();
  await panel.getByLabel(/Ollama's address/).fill("https://api.openai.com");
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(panel.getByText(/must be on your home network/)).toBeVisible();

  // No AI buttons anywhere while it isn't set up.
  await page.goto("/pantry");
  await expect(page.getByText("Read a receipt with AI")).toHaveCount(0);
});
