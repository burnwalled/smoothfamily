import { test, expect } from "../fixtures";

// 2.8.4: the server admin sets the server's address; links handed out point there.
test("the server address is set in server settings", async ({ adminPage: page }) => {
  await page.goto("/server");
  await page.getByRole("button", { name: "Address and services" }).click();
  const card = page.getByRole("region", { name: "Server address" });
  await card.getByRole("textbox", { name: "The server's address" }).fill("family.example.com/");
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card.getByText("https://family.example.com", { exact: true })).toBeVisible();

  // A path is refused: it would break every link.
  await card.getByRole("textbox", { name: "The server's address" }).fill("https://family.example.com/app");
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card.getByRole("status")).toContainText("no path");

  await card.getByRole("button", { name: "Clear" }).click();
  await expect(card.getByRole("textbox", { name: "The server's address" })).toHaveValue("");
});
