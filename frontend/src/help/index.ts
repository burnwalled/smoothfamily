// Loads one language's help texts – only the one in use is fetched.
import type { Locale } from "@/lib/i18n";
import type { TopicText } from "./types";

export type HelpTexts = Record<string, TopicText>;

export async function loadHelp(locale: Locale): Promise<HelpTexts> {
  switch (locale) {
    case "sv":
      return (await import("./sv")).default;
    case "nb":
      return (await import("./nb")).default;
    case "da":
      return (await import("./da")).default;
    case "fi":
      return (await import("./fi")).default;
    default:
      return (await import("./en")).default;
  }
}

/** All the words of a topic, for the search. */
export function plainText(text: TopicText): string {
  const parts: string[] = [text.title, text.summary];
  const walk = (blocks: TopicText["blocks"]) => {
    for (const b of blocks) {
      if ("p" in b) parts.push(b.p);
      else if ("h" in b) parts.push(b.h);
      else if ("steps" in b) parts.push(...b.steps);
      else if ("tips" in b) parts.push(...b.tips);
      else if ("note" in b) parts.push(b.note);
      else if ("shot" in b) parts.push(b.caption);
      else if ("details" in b) for (const d of b.details) { parts.push(d.title); walk(d.blocks); }
    }
  };
  walk(text.blocks);
  return parts.join(" ").toLowerCase();
}
