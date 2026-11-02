import { test, expect, unique, type Page } from "../fixtures";

// The newest message also shows as the conversation preview; the bubble in the thread comes last.
const bubble = (page: Page, text: string) => page.getByText(text, { exact: true }).last();

test("a family chat message reaches the others", async ({ adminPage, kidPage }) => {
  const text = unique("Dinner at six");

  await adminPage.goto("/chat");
  await adminPage.getByPlaceholder("Write a message...").fill(text);
  await adminPage.getByRole("button", { name: "Send", exact: true }).click();
  await expect(bubble(adminPage, text)).toBeVisible();
  await expect(adminPage.getByPlaceholder("Write a message...")).toHaveValue("");

  await kidPage.goto("/chat");
  await expect(bubble(kidPage, text)).toBeVisible();
});

// 2.8.2: a nicer chat – grouped bubbles, a big emoji, avatars. Screenshots with E2E_SHOTS.
test("the chat groups messages and shows a lone emoji large", async ({ adminPage, kidPage }, info) => {
  const first = unique("Pizza tonight?");
  await kidPage.goto("/chat");
  const field = kidPage.getByPlaceholder("Write a message...");
  await field.fill(first);
  await field.press("Enter");
  await expect(bubble(kidPage, first)).toBeVisible();
  await field.fill("With extra cheese please");
  await field.press("Enter");
  await expect(bubble(kidPage, "With extra cheese please")).toBeVisible();
  await adminPage.goto("/chat");
  const reply = adminPage.getByPlaceholder("Write a message...");
  await reply.fill("Yes! 🍕 at six");
  await reply.press("Enter");
  await expect(bubble(adminPage, "Yes! 🍕 at six")).toBeVisible();
  await reply.fill("🎉");
  await reply.press("Enter");
  await expect(adminPage.locator("p.text-4xl", { hasText: "🎉" }).last()).toBeVisible();
  const shots = process.env.E2E_SHOTS;
  if (shots) await adminPage.screenshot({ path: `${shots}/chat-${info.project.name}.png` });
});
