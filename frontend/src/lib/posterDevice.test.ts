import assert from "node:assert/strict";
import { test } from "node:test";
import type { Block } from "./poster";
import { forDevice, movePhone, phoneDiffers, phoneOrder, placePhone, resetPhone, toggleHidden } from "./posterDevice";
import { parseTemplate } from "./posterTemplate";

const text = (id: string, extra: object = {}): Block => ({ id, type: "text", text: id, ...extra });
const ids = (blocks: Block[]) => blocks.map((b) => b.id).join();

test("without anything of its own, the phone follows the computer and keeps the rows", () => {
  const blocks = [text("a", { side: "left" }), text("b", { side: "right" })];
  assert.deepEqual(forDevice(blocks, "phone"), { blocks, flat: false });
  assert.equal(phoneDiffers(blocks), false);
});

test("moving a part on the phone leaves the computer's order alone", () => {
  const blocks = [text("a"), text("b"), text("c")];
  const moved = movePhone(blocks, "c", -1);
  assert.equal(ids(moved), "a,b,c");
  assert.equal(ids(phoneOrder(moved)), "a,c,b");
  assert.equal(ids(forDevice(moved, "desktop").blocks), "a,b,c");
  const phone = forDevice(moved, "phone");
  assert.equal(ids(phone.blocks), "a,c,b");
  assert.equal(phone.flat, true);
  assert.equal(movePhone(moved, "a", -1), moved);
});

test("hidden on one device, still there on the other", () => {
  const blocks = [toggleHidden(text("a"), "phone"), toggleHidden(text("b"), "desktop"), text("c")];
  assert.equal(ids(forDevice(blocks, "phone").blocks), "b,c");
  assert.equal(ids(forDevice(blocks, "desktop").blocks), "a,c");
  assert.equal(toggleHidden(blocks[0], "phone").hide, undefined);
});

test("the phone's alignment and size go over the shared ones, the texts stay shared", () => {
  const blocks = [text("a", { align: "left", size: "xxl", phone: { align: "center", size: "l" } })];
  assert.deepEqual(forDevice(blocks, "phone").blocks[0], { ...blocks[0], align: "center", size: "l" });
  assert.deepEqual(forDevice(blocks, "desktop").blocks[0], blocks[0]);
  assert.equal(forDevice(blocks, "phone").flat, false);
});

test("a new part lands after the chosen one on the phone", () => {
  const moved = movePhone([text("a"), text("b"), text("c")], "c", -1);
  assert.equal(ids(phoneOrder(placePhone([...moved, text("n")], "n", "c"))), "a,c,n,b");
  assert.equal(ids(phoneOrder(placePhone([...moved, text("n")], "n", null))), "a,c,b,n");
});

test("resetting gives the phone back to the computer, what's hidden on the computer stays", () => {
  const blocks = [text("a", { hide: ["phone", "desktop"], phone: { order: 1, align: "center" } }), text("b", { hide: ["phone"], phone: { order: 0 } })];
  const back = resetPhone(blocks);
  assert.deepEqual(back[0].hide, ["desktop"]);
  assert.equal(back[1].hide, undefined);
  assert.equal(phoneDiffers(back), false);
});

test("a template keeps what's the phone's own, and only what's valid", () => {
  const { template } = parseTemplate(JSON.stringify({ layouts: { invite: [
    { type: "text", text: "a", hide: ["phone", "tv"], phone: { order: 2, align: "center", size: "l" } },
    { type: "text", text: "b", phone: { order: "x", align: "up", size: "huge", script: "y" }, hide: "phone" },
  ] } }), { themes: [], pictures: [] });
  const [a, b] = template.layouts.invite!;
  assert.deepEqual(a.hide, ["phone"]);
  assert.deepEqual(a.phone, { order: 2, align: "center", size: "l" });
  assert.equal(b.phone, undefined);
  assert.equal(b.hide, undefined);
});
