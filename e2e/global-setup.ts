import { mkdirSync } from "node:fs";
import { request, type FullConfig } from "@playwright/test";
import { ADMIN, FAMILY, KID, STATE } from "./fixtures";

// Creates the test family on an empty stack (or reuses it on a kept one) and saves a signed-in
// cookie per role, so the tests themselves only sign in through the UI where that is the point.
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  mkdirSync(".auth", { recursive: true });
  const api = await request.newContext({ baseURL });

  const deadline = Date.now() + 120_000;
  for (;;) {
    const res = await api.get("/api/auth/setup").catch(() => null);
    if (res?.ok()) break;
    if (Date.now() > deadline) throw new Error(`The test stack at ${baseURL} did not answer`);
    await new Promise((r) => setTimeout(r, 2000));
  }

  const status = await (await api.get("/api/auth/setup")).json();
  if (status.needs_setup) {
    const res = await api.post("/api/auth/setup", {
      data: {
        family_name: FAMILY,
        display_name: ADMIN.name,
        username: ADMIN.username,
        password: ADMIN.password,
        email: "admin@example.com",
        passkeys_enabled: false,
        totp_policy: "off",
      },
    });
    if (!res.ok()) throw new Error(`Setup failed: ${res.status()} ${await res.text()}`);
  }

  await login(api, ADMIN);
  // The tests make adults with short passwords; the 12-character default has its own backend test.
  const rules = await (await api.get("/api/admin/security-policy")).json();
  await api.put("/api/admin/security-policy", { data: { ...rules, password_min_adult: 4 } });
  // The setup guides are tested on their own; the test family starts set up.
  await api.post("/api/guide/server/done");
  await api.post("/api/guide/family/done");
  const kid = await api.post("/api/family/members", {
    data: { display_name: KID.name, username: KID.username, password: KID.password, role: "child" },
  });
  if (!kid.ok() && kid.status() !== 409) throw new Error(`Could not create the child: ${kid.status()} ${await kid.text()}`);
  await api.storageState({ path: STATE.admin });
  await api.dispose();

  const kidApi = await request.newContext({ baseURL });
  await login(kidApi, KID);
  await kidApi.storageState({ path: STATE.kid });
  await kidApi.dispose();
}

async function login(api: Awaited<ReturnType<typeof request.newContext>>, user: { username: string; password: string }) {
  const res = await api.post("/api/auth/login", { data: { username: user.username, password: user.password } });
  if (!res.ok()) throw new Error(`Login as ${user.username} failed: ${res.status()} ${await res.text()}`);
}
