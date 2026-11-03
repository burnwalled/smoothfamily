import { test, expect, unique, openFromMenu } from "../fixtures";

// 3.4.0: health per person – a workout and the day's steps, private until shared.
test("log a workout and the day's steps, then share them", async ({ adminPage: page, adminApi, kidApi }) => {
  const me = await (await adminApi.get("/api/auth/me")).json();
  await adminApi.put("/api/health/sharing", { data: { workouts: "me", steps: "me", sleep: "me", weight: "me" } });
  const note = unique("Morning run");
  await page.goto("/");
  await openFromMenu(page, "/health");
  await expect(page).toHaveURL(/\/health$/);

  const log = page.getByRole("region", { name: "Log a workout" });
  await log.getByRole("button", { name: "Run" }).click();
  await log.getByRole("button", { name: "45", exact: true }).click();
  await log.getByLabel("Distance (km)").fill("7,5");
  await log.getByRole("textbox", { name: "Note" }).fill(note);
  await log.getByRole("button", { name: "Save" }).click();
  const workouts = page.getByRole("region", { name: "Workouts" });
  await expect(workouts.getByText(note)).toBeVisible();
  await expect(workouts.getByText(/45 min · 7[.,]5 km/).first()).toBeVisible();

  const day = page.getByRole("region", { name: "The day's numbers" });
  await day.getByLabel("Steps").fill("8123");
  await day.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("region", { name: "The days" }).getByText(/8[ ,. ]?123/).first()).toBeVisible();

  // The child sees none of it until the workouts are shared with the family.
  expect((await kidApi.get(`/api/health/people/${me.id}`)).status()).toBe(404);
  await page.getByRole("region", { name: "Who sees your health" }).getByLabel("Workouts").selectOption("family");
  await expect.poll(async () => (await kidApi.get(`/api/health/people/${me.id}`)).status()).toBe(200);
  const seen = await (await kidApi.get(`/api/health/people/${me.id}`)).json();
  expect(seen.sees).toEqual(["workouts"]);
  expect(seen.workouts.some((w: { note: string }) => w.note === note)).toBe(true);

  // Tidy up.
  for (const w of seen.workouts.filter((x: { note: string }) => x.note === note)) await adminApi.delete(`/api/health/workouts/${w.id}`);
  await adminApi.put("/api/health/sharing", { data: { workouts: "me" } });
});
