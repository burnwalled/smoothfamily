import assert from "node:assert/strict";
import { test } from "node:test";
import { TemplateError, galaTemplate, parseTemplate, portableLayouts, templateFile, templatePrompt } from "./posterTemplate";

const KNOWN = { themes: ["glamour", "disco"], pictures: ["gold-star"] };

test("the JSON is found in what an AI says around it", () => {
  const { template, warnings } = parseTemplate('Here it is:\n```json\n{"name":"Natt","theme":"disco","layouts":{"invite":[{"type":"text","text":"{title}","size":"xxl"}]}}\n```\nEnjoy!', KNOWN);
  assert.equal(template.name, "Natt");
  assert.equal(template.theme, "disco");
  assert.deepEqual(template.layouts.invite, [{ id: "invite-0", type: "text", text: "{title}", size: "xxl" }]);
  assert.deepEqual(warnings, []);
});

test("what isn't a template is refused, by its reason", () => {
  const code = (s: string) => {
    try {
      parseTemplate(s, KNOWN);
    } catch (e) {
      return (e as TemplateError).code;
    }
    return "ok";
  };
  assert.equal(code("Sorry, I can't"), "notJson");
  assert.equal(code("{ not json }"), "notJson");
  assert.equal(code('{"name":"x"}'), "notTemplate");
  assert.equal(code('{"layouts":{"invite":[{"type":"html","html":"<script>"}]}}'), "empty");
  assert.equal(code("{" + " ".repeat(200_001) + "}"), "tooBig");
});

test("only what the posters know comes in: nothing else in a block survives", () => {
  const { template, warnings } = parseTemplate(JSON.stringify({
    theme: "nope",
    layouts: {
      invite: [
        { type: "text", text: "Hej", onclick: "alert(1)", font: "Comic Sans", size: "huge", tilt: 90, style: "position:fixed" },
        { type: "image", source: "url", asset: "https://evil.example/x.png", src: "https://evil.example/x.png" },
        { type: "image", source: "library", asset: "../../secret" },
        { type: "decor", items: [{ kind: "library", value: "gold-star" }, { kind: "library", value: "https://evil.example/y.png" }, { kind: "sticker", value: "abc" }] },
        { type: "marquee", text: "x" },
      ],
      other: [{ type: "text", text: "not a page" }],
    },
  }), KNOWN);
  const [txt, img1, img2, decor] = template.layouts.invite!;
  assert.deepEqual(txt, { id: "invite-0", type: "text", text: "Hej", tilt: 8 });
  assert.deepEqual(img1, { id: "invite-1", type: "image", source: "invite" });
  assert.deepEqual(img2, { id: "invite-2", type: "image", source: "invite" });
  assert.deepEqual(decor, { id: "invite-3", type: "decor", items: [{ kind: "library", value: "gold-star" }] });
  assert.equal(template.layouts.invite!.length, 4);
  assert.equal(template.theme, null);
  assert.equal(Object.keys(template.layouts).join(), "invite");
  assert.deepEqual([...new Set(warnings.map((w) => w.code))].sort(), ["badPart", "ownPicture", "unknownBlock", "unknownTheme"]);
});

test("an own look needs readable colours", () => {
  const blocks = { invite: [{ type: "text", text: "x" }] };
  const ok = parseTemplate(JSON.stringify({ look: { bg: "#000000", bg2: "#111111", accent: "#d9a94a", ink: "#ffffff", font: "gala", pattern: "wat" }, layouts: blocks }), KNOWN);
  assert.equal(ok.template.look?.accent, "#d9a94a");
  assert.equal(ok.template.look?.pattern, "none");
  const bad = parseTemplate(JSON.stringify({ look: { bg: "url(x)", bg2: "#111111", accent: "#d9a94a", ink: "#ffffff" }, layouts: blocks }), KNOWN);
  assert.equal(bad.template.look, null);
  assert.deepEqual(bad.warnings, [{ code: "badLook" }]);
});

test("a party's own pictures stay with the party", () => {
  const out = portableLayouts({
    invite: [
      { id: "a", type: "image", source: "asset", asset: "x1" },
      { id: "b", type: "emblem", item: { kind: "sticker", value: "x2" } },
      { id: "c", type: "decor", items: [{ kind: "sticker", value: "x3" }] },
      { id: "d", type: "decor", items: [{ kind: "sticker", value: "x4" }, { kind: "emoji", value: "🎉" }] },
    ],
    save: null,
  });
  assert.deepEqual(out.invite, [
    { id: "a", type: "image", source: "invite", asset: undefined },
    { id: "b", type: "emblem", item: { kind: "emoji", value: "🎉" } },
    { id: "d", type: "decor", items: [{ kind: "emoji", value: "🎉" }] },
  ]);
  assert.equal(out.save, null);
});

test("the gala goes out and comes back the same, and its parts are all known", () => {
  const gala = galaTemplate((k) => k);
  const known = { themes: ["glamour"], pictures: ["champagne-glasses", "champagne-bottle"] };
  const { template, warnings } = parseTemplate(templateFile(gala), known);
  assert.deepEqual(warnings, []);
  assert.deepEqual(template.layouts.invite, gala.layouts.invite);
  assert.deepEqual(template.layouts.save, gala.layouts.save);
  assert.equal(template.theme, "glamour");
});

test("the prompt holds the wishes and the app's choices, and no party details", () => {
  const prompt = templatePrompt({ wishes: "80-tal med neon", kind: "party", language: "svenska", themes: ["glamour", "disco"], stickers: ["gold-star"] });
  for (const part of ["80-tal med neon", "svenska", "glamour, disco", "gold-star", "{title}", "smooth-family-template"]) assert.ok(prompt.includes(part), part);
  const example = JSON.parse(prompt.slice(prompt.lastIndexOf("(make your own)") + 15));
  assert.ok(parseTemplate(JSON.stringify(example), { themes: ["glamour"], pictures: [] }).template.layouts.invite?.length);
});
