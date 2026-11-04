import { test, expect, KID } from "../fixtures";

// 3.4.0: a child's school from Home Assistant (InfoMentor in the simulated home) – linked on the
// child's page, shown on the school card on Today, the weekly letter opens there.
test("a child's school from Home Assistant", async ({ adminPage: page, adminApi }) => {
  const members = await (await adminApi.get("/api/family/members")).json();
  const kid = members.find((m: { username: string }) => m.username === KID.username);
  await adminApi.post("/api/smarthome/connection/simulated");
  let widgetId: string | null = null;
  try {
    await page.goto(`/settings/members/${kid.id}`);
    const links = page.getByRole("region", { name: "School from Home Assistant" });
    await links.getByRole("checkbox", { name: /InfoMentor · Maja/ }).check();
    await expect(links.getByText(/The school's calendars are in the calendar/)).toBeVisible();

    const widget = await (await adminApi.post("/api/dashboard/widgets", { data: { type: "school", config: {} } })).json();
    widgetId = widget.id;
    await page.goto("/");
    await expect(page.getByText("School 08:10–14:40").first()).toBeVisible();
    await expect(page.getByText("PE tomorrow").first()).toBeVisible();
    // The sortable card marks its content aria-disabled outside edit mode; a tap still opens it.
    await page.getByRole("button", { name: "Veckobrev v.45", exact: true }).click({ force: true });
    const letter = page.getByRole("dialog", { name: "Veckobrev v.45" });
    await expect(letter.getByText(/utflykt till Skansen/)).toBeVisible();
    await letter.getByRole("button", { name: "Close" }).click();

    // The school's calendar is the child's subscription.
    const feeds = await (await adminApi.get("/api/calendar/feeds")).json();
    expect(feeds.some((f: { url: string; member_id: string }) => f.url === "homeassistant://calendar.maja_calendar" && f.member_id === kid.id)).toBe(true);
  } finally {
    if (widgetId) await adminApi.delete(`/api/dashboard/widgets/${widgetId}`);
    await adminApi.put(`/api/school/links/${kid.id}`, { data: { accounts: [] } });
    await adminApi.delete("/api/smarthome/connection");
  }
});
