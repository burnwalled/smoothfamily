import { test, expect } from "../fixtures";

// #44 / #60 without Home Assistant connected: the Flows tab is there but there is nothing to use
// yet, and the profile offers no presence choice.
test("flows and presence wait for Home Assistant", async ({ adminPage: page }) => {
  await page.goto("/smarthome");
  await page.getByRole("tab", { name: "Flows" }).click();
  await expect(page.getByText(/No flows yet/)).toBeVisible();
  await expect(page.getByRole("button", { name: "New flow" })).toBeDisabled();

  await page.goto("/profile?tab=security");
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Show when I'm home" })).toHaveCount(0);
});

// The simulated Home Assistant: a lamp, a button flow on Today and a person coming home.
test("a simulated home with a flow and presence", async ({ adminPage: page, adminApi }) => {
  await page.goto("/settings/smarthome");
  await page.getByRole("button", { name: "Use a simulated home" }).click();
  // Shown at the top and, at once, in the list of homes too.
  await expect(page.getByText("Connected to a simulated home (no real devices)").first()).toBeVisible();
  try {
    await page.goto("/smarthome");
    await expect(page.getByRole("region", { name: "Simulated home" })).toBeVisible();
    await expect(page.getByText("Kitchen ceiling")).toBeVisible();

    // A button flow that runs a scene, starred for Today.
    await page.getByRole("tab", { name: "Flows" }).click();
    await page.getByRole("button", { name: "New flow" }).click();
    const editor = page.getByLabel("Build a flow");
    await editor.getByLabel("Name").fill("Movie night");
    await editor.getByLabel("When", { exact: true }).selectOption("button");
    await editor.getByLabel("Show as a button on Today").check();
    await editor.getByLabel("Add a step").selectOption("device");
    await editor.getByLabel("Device", { exact: true }).selectOption({ label: "Movie night" });
    await editor.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Movie night").first()).toBeVisible();
    await page.getByRole("button", { name: "Run “Movie night” now" }).click();
    await expect(page.getByText(/^Ran /)).toBeVisible();
    const devices = await (await adminApi.get("/api/smarthome/my-devices")).json();
    expect(devices.find((d: { entity_id: string }) => d.entity_id === "cover.living_room_blinds").state).toBe("closed");

    // Who's home: link me, share, then move me in the simulator.
    const me = await (await adminApi.get("/api/auth/me")).json();
    await adminApi.put(`/api/presence/links/${me.id}`, { data: { person_entity: "person.anna", travel_entity: "sensor.home_anna_direction_of_travel" } });
    await page.goto("/profile?tab=security");
    await page.getByRole("radio", { name: "Also on the way home" }).click();
    await expect(page.getByRole("radio", { name: "Also on the way home" })).toHaveAttribute("aria-checked", "true");
    await page.goto("/smarthome");
    await page.getByRole("button", { name: /^Anna: On the way home$/ }).click();
    await expect.poll(async () => (await (await adminApi.get("/api/presence")).json()).members[0]?.state).toBe("travel");
  } finally {
    const flows = await (await adminApi.get("/api/smarthome/flows")).json();
    for (const flow of flows) await adminApi.delete(`/api/smarthome/flows/${flow.id}`);
    const me = await (await adminApi.get("/api/auth/me")).json();
    await adminApi.put("/api/presence/me", { data: { share: "off" } });
    await adminApi.put(`/api/presence/links/${me.id}`, { data: { person_entity: null } });
    await adminApi.delete("/api/smarthome/connection");
  }
});

// A music step: the speaker's own library is browsed, a Spotify account plays on one of its own
// devices, and a pasted Spotify share link becomes the URI Home Assistant plays.
test("a music step from the speaker's library or a pasted Spotify link", async ({ adminPage: page, adminApi }) => {
  await adminApi.post("/api/smarthome/connection/simulated");
  try {
    await page.goto("/smarthome");
    await page.getByRole("tab", { name: "Flows" }).click();
    await page.getByRole("button", { name: "New flow" }).click();
    const editor = page.getByLabel("Build a flow");
    await editor.getByLabel("Name").fill("Morning music");
    await editor.getByLabel("When", { exact: true }).selectOption("button");
    await editor.getByLabel("Add a step").selectOption("media");
    await editor.getByRole("button", { name: "Choose from the speaker" }).click();

    // The speaker's library, one level at a time.
    await editor.locator("li", { hasText: /^Spotify playlistsOpen$/ }).getByRole("button", { name: "Open" }).click();
    await expect(editor.getByText("Dinner jazz")).toBeVisible();

    // A Spotify account takes the speaker's place: it plays alone, on a device of its own, and
    // has no library to show while nothing is playing.
    await editor.getByRole("button", { name: "Spotify Anna" }).click();
    await expect(editor.getByRole("button", { name: "Kitchen Sonos" })).toHaveAttribute("aria-pressed", "false");
    await editor.getByLabel("Play on").selectOption("Living room TV");
    await expect(editor.getByText(/not showing a library of its own/)).toBeVisible();

    // A share link, as Spotify copies it.
    const pasted = editor.getByLabel("Or paste what to play");
    await pasted.fill("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123");
    await expect(pasted).toHaveValue("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M");
    await expect(editor.getByLabel("Kind")).toHaveValue("playlist");
    await editor.getByRole("button", { name: "Choose", exact: true }).last().click();
    await editor.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Morning music").first()).toBeVisible();

    const flows = await (await adminApi.get("/api/smarthome/flows")).json();
    expect(flows[0].actions[0]).toMatchObject({ media_content_id: "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M", media_content_type: "playlist", output: "Living room TV" });
    expect(flows[0].actions[0].device_ids).toHaveLength(1);
  } finally {
    const flows = await (await adminApi.get("/api/smarthome/flows")).json();
    for (const flow of flows) await adminApi.delete(`/api/smarthome/flows/${flow.id}`);
    await adminApi.delete("/api/smarthome/connection");
  }
});
