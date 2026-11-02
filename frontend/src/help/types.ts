// The help centre's content (3.0.2): one file per language (help/<locale>.ts) with a text for every
// topic in topics.ts. A topic is a list of blocks; every language has the same blocks in the same
// order, so screenshots and steps line up (help.test.ts checks it).
export type Block =
  | { p: string } // a paragraph
  | { h: string } // a sub-heading
  | { steps: string[] } // numbered steps
  | { tips: string[] } // "Good to know"
  | { note: string } // an aside, e.g. what isn't possible yet
  | { shot: string; caption: string } // a screenshot: public/help/<locale>/<shot>.webp
  | { details: { title: string; blocks: Block[] }[] }; // fold-outs, e.g. one per calendar service

export type TopicText = { title: string; summary: string; blocks: Block[] };

export type Category = "start" | "everyday" | "food" | "children" | "vault" | "home" | "smarthome" | "ai" | "family" | "server";

// Who a topic is for: everyone, adults, those who run the family's settings, or the server admin.
export type Audience = "everyone" | "adults" | "family" | "server";
