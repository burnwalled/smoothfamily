// A poster on a computer and on a phone (3.4.0): one set of parts with one set of texts, and what's
// the phone's own – the order, what's hidden, the alignment and the size. Parts without anything of
// the phone's own follow the computer's, and a poster with no order of its own keeps its rows.
import type { Block, Device } from "@/lib/poster";

// Where a poster's parts stop sitting side by side (party.css, @container poster).
export const PHONE_BELOW = 760;

const hasOrder = (blocks: Block[]) => blocks.some((b) => b.phone?.order !== undefined);

// The parts in the phone's order: its own numbers, the others where they are in the list.
export function phoneOrder(blocks: Block[]): Block[] {
  return blocks.map((b, i) => ({ b, at: b.phone?.order ?? i })).sort((x, y) => x.at - y.at).map((x) => x.b);
}

const numbered = (list: Block[], all: Block[]): Block[] => all.map((b) => ({ ...b, phone: { ...b.phone, order: list.findIndex((x) => x.id === b.id) } }) as Block);

export function movePhone(blocks: Block[], id: string, by: number): Block[] {
  const list = phoneOrder(blocks);
  const i = list.findIndex((b) => b.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return blocks;
  [list[i], list[j]] = [list[j], list[i]];
  return numbered(list, blocks);
}

// A new part on the phone: after the chosen one, or last.
export function placePhone(blocks: Block[], id: string, after: string | null): Block[] {
  const list = phoneOrder(blocks.filter((b) => b.id !== id));
  const at = after ? list.findIndex((b) => b.id === after) + 1 : list.length;
  const part = blocks.find((b) => b.id === id);
  if (!part) return blocks;
  list.splice(at > 0 ? at : list.length, 0, part);
  return numbered(list, blocks);
}

export function toggleHidden(block: Block, device: Device): Block {
  const hide = block.hide?.includes(device) ? block.hide.filter((d) => d !== device) : [...(block.hide ?? []), device];
  return { ...block, hide: hide.length ? hide : undefined };
}

// The part as the device shows it: the phone's alignment and size over the shared ones.
export function onDevice(block: Block, device: Device): Block {
  if (device !== "phone" || !block.phone) return block;
  const { order: _order, ...look } = block.phone;
  return { ...block, ...look } as Block;
}

// What a device shows, and whether a phone's own order means taking the rows apart.
export function forDevice(blocks: Block[], device: Device): { blocks: Block[]; flat: boolean } {
  const ordered = device === "phone" ? phoneOrder(blocks) : blocks;
  return { blocks: ordered.filter((b) => !b.hide?.includes(device)).map((b) => onDevice(b, device)), flat: device === "phone" && hasOrder(blocks) };
}

// The phone back to following the computer.
export function resetPhone(blocks: Block[]): Block[] {
  return blocks.map((b) => {
    const { phone: _phone, ...rest } = b;
    const hide = b.hide?.filter((d) => d !== "phone");
    return { ...rest, hide: hide?.length ? hide : undefined } as Block;
  });
}

export const phoneDiffers = (blocks: Block[]) => blocks.some((b) => b.phone || b.hide?.includes("phone"));
export { hasOrder };
