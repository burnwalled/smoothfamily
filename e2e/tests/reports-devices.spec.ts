import { test, expect, unique, KID } from "../fixtures";

// 3.1.0: a report goes to the server admin, who sets its status (the reporter sees it) and exports it
// to the project's public repository – GitHub's form, filled in.
test("a report to the server admin, answered and exported", async ({ adminPage, kidPage, adminApi }) => {
  const title = unique("The fish button");
  await kidPage.goto("/feedback");
  await kidPage.getByLabel("Title").fill(title);
  await kidPage.getByLabel("Description").fill("Nothing happens when I tap it");
  await kidPage.getByRole("button", { name: "Send report" }).click();
  await expect(kidPage.getByText(title)).toBeVisible();

  await adminPage.goto("/server?tab=reports");
  const reports = adminPage.getByRole("region", { name: "Reports" });
  await reports.getByRole("combobox", { name: `Status of ${title}` }).selectOption("planned");
  await reports.getByRole("checkbox", { name: `Choose ${title}` }).check();
  await reports.getByRole("button", { name: /Export the chosen \(1\)/ }).click();
  const dialog = adminPage.getByRole("dialog", { name: "To the project's public repository" });
  await expect(dialog.getByRole("textbox", { name: "The text to the repository" })).toHaveValue(new RegExp(title));
  await expect(dialog.getByRole("link", { name: "Open GitHub" })).toHaveAttribute("href", /github\.com\/burnwalled\/smoothfamily\/issues\/new\?template=server-admin-report\.yml/);
  await dialog.getByRole("button", { name: "Close" }).click();

  await kidPage.reload();
  await expect(kidPage.getByRole("listitem").filter({ hasText: title }).getByText(/Planned/)).toBeVisible();

  const all = await (await adminApi.get("/api/feedback/all")).json();
  await adminApi.delete(`/api/feedback/${all.find((r: { title: string }) => r.title === title).id}`);
});

// 3.1.0: the family admin sees the family's devices on a map and in a list; the server admin sees the
// families' devices as kinds.
test("the family's devices and the server's", async ({ adminPage, kidPage }) => {
  await kidPage.goto("/");
  await expect(kidPage.getByRole("navigation").first()).toBeVisible();

  await adminPage.goto("/settings/devices");
  await expect(adminPage.getByRole("img", { name: "Connected to the family" })).toBeVisible();
  const list = adminPage.getByRole("region", { name: "Every device" });
  await expect(list.getByText(KID.name).first()).toBeVisible();
  await expect(list.getByText(/Well|Old version/).first()).toBeVisible();

  await adminPage.goto("/server?tab=devices");
  await expect(adminPage.getByRole("img", { name: "The families' devices" })).toBeVisible();
  await expect(adminPage.getByRole("region", { name: "E2E Family" })).toBeVisible();
});
