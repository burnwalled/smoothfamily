// The help centre as the public repository's wiki (3.1.1): one page per topic from help/en.ts, the
// categories in the sidebar and on Home, the screenshots copied next to them. Run it into a clone
// of the wiki and push from there:
//
//   cd frontend && npx tsx scripts/help-wiki.ts ../../smoothfamily.wiki
//
// The pages are written over each time – edit the help centre, not the wiki.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import texts from "../src/help/en";
import { CATEGORIES, TOPICS } from "../src/help/topics";
import type { Audience, Block } from "../src/help/types";
import en from "../src/locales/en";

const out = process.argv[2];
if (!out || !existsSync(join(out, ".git"))) {
  console.error("usage: npx tsx scripts/help-wiki.ts <folder of the wiki's clone>");
  process.exit(1);
}

const REPO = "https://github.com/burnwalled/smoothfamily";
const GENERATED = "<!-- Made from frontend/src/help/en.ts by frontend/scripts/help-wiki.ts – edit the help centre, not this page. -->";
const FOR: Record<Audience, string> = {
  everyone: "",
  adults: "For the adults.",
  family: "For the family's admin.",
  server: "For the server admin.",
};

// A wiki page's name is its file name; the links leave out ".md".
const page = (id: string) => texts[id].title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
const link = (id: string) => `[${texts[id].title}](${page(id)})`;

function render(blocks: Block[]): string[] {
  const lines: string[] = [];
  for (const b of blocks) {
    if ("p" in b) lines.push(b.p, "");
    else if ("h" in b) lines.push(`## ${b.h}`, "");
    else if ("steps" in b) lines.push(...b.steps.map((s, i) => `${i + 1}. ${s}`), "");
    else if ("tips" in b) lines.push("**Good to know**", "", ...b.tips.map((s) => `- ${s}`), "");
    else if ("note" in b) lines.push(`> ${b.note}`, "");
    else if ("shot" in b) lines.push(`![${b.caption}](images/${b.shot}.webp)`, `*${b.caption}*`, "");
    else if ("details" in b)
      for (const d of b.details) lines.push("<details>", `<summary>${d.title}</summary>`, "", ...render(d.blocks), "</details>", "");
  }
  return lines;
}

// Start afresh: the pages of topics that are gone go too.
for (const name of readdirSync(out)) if (name !== ".git") rmSync(join(out, name), { recursive: true, force: true });
mkdirSync(join(out, "images"));

const shots = join(__dirname, "../public/help/en");
for (const topic of TOPICS) {
  const text = texts[topic.id];
  const related = (topic.related ?? []).filter((id) => texts[id]);
  const lines = [GENERATED, "", `*${text.summary}*`, ""];
  if (FOR[topic.audience]) lines.push(`> ${FOR[topic.audience]}`, "");
  lines.push(...render(text.blocks));
  if (related.length) lines.push("---", "", `**See also:** ${related.map(link).join(" · ")}`, "");
  writeFileSync(join(out, `${page(topic.id)}.md`), lines.join("\n"));
  for (const b of text.blocks) if ("shot" in b) copyFileSync(join(shots, `${b.shot}.webp`), join(out, "images", `${b.shot}.webp`));
}

const contents = CATEGORIES.flatMap(({ id }) => {
  const topics = TOPICS.filter((t) => t.category === id);
  return topics.length ? [`### ${en[`help.category.${id}` as keyof typeof en]}`, "", ...topics.map((t) => `- ${link(t.id)}`), ""] : [];
});

writeFileSync(
  join(out, "Home.md"),
  [
    GENERATED,
    "",
    "Smooth Family is a family's own portal – it runs in your home, not in someone's cloud. This wiki is the",
    "app's help centre: what every part does and how to use it. In the app it is in five languages (English,",
    "Svenska, Norsk, Dansk, Suomi) – press **?** next to any page's title.",
    "",
    `Installing and running a server: the [README](${REPO}#install), how the server's parts fit together in`,
    `[ARCHITECTURE.md](${REPO}/blob/main/docs/ARCHITECTURE.md), and how to reach it from outside – and what to`,
    `think about before you publish it on the internet – in [ACCESS.md](${REPO}/blob/main/docs/ACCESS.md).`,
    "",
    ...contents,
  ].join("\n"),
);
writeFileSync(join(out, "_Sidebar.md"), ["**[Smooth Family](Home)**", "", ...contents].join("\n"));
console.log(`${TOPICS.length} topics written to ${out}`);
