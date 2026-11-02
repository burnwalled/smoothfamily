// Reading Excel (.xlsx) and PowerPoint (.pptx) files in the browser for a preview (2.8.1). Both are
// zip files of XML: we take the cell values and each slide's text and pictures – no layout, no
// formulas, nothing run from the file. Nothing is sent anywhere.
import JSZip from "jszip";

export type Sheet = { name: string; rows: string[][]; truncated: boolean };
export type Slide = { texts: string[]; images: string[] };

const MAX_ROWS = 500;
const MAX_COLS = 50;
// Built-in number formats that are dates (ECMA-376, 18.8.30).
const DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function xml(text: string): Document {
  return new DOMParser().parseFromString(text, "application/xml");
}

function byTag(node: Document | Element, name: string): Element[] {
  return Array.from(node.getElementsByTagNameNS("*", name));
}

async function read(zip: JSZip, path: string): Promise<Document | null> {
  const file = zip.file(path);
  return file ? xml(await file.async("text")) : null;
}

/** Where a part's relationships point: id → path inside the zip. */
async function rels(zip: JSZip, part: string): Promise<Record<string, string>> {
  const dir = part.slice(0, part.lastIndexOf("/") + 1);
  const doc = await read(zip, `${dir}_rels/${part.slice(dir.length)}.rels`);
  const out: Record<string, string> = {};
  for (const r of doc ? byTag(doc, "Relationship") : []) {
    const target = r.getAttribute("Target") ?? "";
    if (r.getAttribute("TargetMode") === "External") continue;
    // Resolve "../media/x.png" against the part's folder.
    const parts = (target.startsWith("/") ? target.slice(1) : dir + target).split("/");
    const clean: string[] = [];
    for (const p of parts) p === ".." ? clean.pop() : p !== "." && clean.push(p);
    out[r.getAttribute("Id") ?? ""] = clean.join("/");
  }
  return out;
}

function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function excelDate(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  const hasTime = serial % 1 !== 0;
  return hasTime ? d.toISOString().slice(0, 16).replace("T", " ") : d.toISOString().slice(0, 10);
}

export async function readWorkbook(data: ArrayBuffer): Promise<Sheet[]> {
  const zip = await JSZip.loadAsync(data);
  const book = await read(zip, "xl/workbook.xml");
  if (!book) throw new Error("not a workbook");
  const links = await rels(zip, "xl/workbook.xml");
  const shared = (await read(zip, "xl/sharedStrings.xml"))
    ? byTag((await read(zip, "xl/sharedStrings.xml"))!, "si").map((si) => byTag(si, "t").map((t) => t.textContent ?? "").join(""))
    : [];
  // Which cell styles are dates.
  const styles = await read(zip, "xl/styles.xml");
  const custom = new Map<number, string>();
  for (const f of styles ? byTag(styles, "numFmt") : []) custom.set(Number(f.getAttribute("numFmtId")), f.getAttribute("formatCode") ?? "");
  const xfs = styles ? byTag(byTag(styles, "cellXfs")[0] ?? styles.documentElement, "xf") : [];
  const isDate = xfs.map((xf) => {
    const id = Number(xf.getAttribute("numFmtId") ?? 0);
    const code = custom.get(id);
    return DATE_FORMATS.has(id) || (!!code && /[dmy]/i.test(code.replace(/\[[^\]]*\]|"[^"]*"/g, "")));
  });

  const sheets: Sheet[] = [];
  for (const s of byTag(book, "sheet")) {
    const id = s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? s.getAttribute("r:id") ?? "";
    const doc = links[id] ? await read(zip, links[id]) : null;
    if (!doc) continue;
    const rows: string[][] = [];
    let truncated = false;
    for (const row of byTag(doc, "row")) {
      const r = Number(row.getAttribute("r") ?? rows.length + 1) - 1;
      if (r >= MAX_ROWS) {
        truncated = true;
        break;
      }
      const cells: string[] = rows[r] ?? [];
      for (const c of byTag(row, "c")) {
        const col = columnIndex(c.getAttribute("r") ?? "A1");
        if (col >= MAX_COLS) {
          truncated = true;
          continue;
        }
        const type = c.getAttribute("t");
        const v = byTag(c, "v")[0]?.textContent ?? "";
        let value = v;
        if (type === "s") value = shared[Number(v)] ?? "";
        else if (type === "inlineStr") value = byTag(c, "t").map((t) => t.textContent ?? "").join("");
        else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
        else if (!type || type === "n") {
          const style = Number(c.getAttribute("s") ?? 0);
          if (v && isDate[style]) value = excelDate(Number(v));
        }
        cells[col] = value;
      }
      rows[r] = cells;
    }
    const width = Math.max(0, ...rows.map((r) => (r ? r.length : 0)));
    sheets.push({ name: s.getAttribute("name") ?? "", rows: Array.from(rows, (r) => Array.from({ length: width }, (_, i) => r?.[i] ?? "")), truncated });
  }
  return sheets;
}

const IMAGE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

/** Each slide's text (one entry per paragraph) and pictures, as blob URLs the caller revokes. */
export async function readPresentation(data: ArrayBuffer): Promise<Slide[]> {
  const zip = await JSZip.loadAsync(data);
  const pres = await read(zip, "ppt/presentation.xml");
  if (!pres) throw new Error("not a presentation");
  const links = await rels(zip, "ppt/presentation.xml");
  const slides: Slide[] = [];
  for (const ref of byTag(pres, "sldId")) {
    const id = ref.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? ref.getAttribute("r:id") ?? "";
    const path = links[id];
    const doc = path ? await read(zip, path) : null;
    if (!doc) continue;
    const texts = byTag(doc, "p")
      .map((p) => byTag(p, "t").map((t) => t.textContent ?? "").join(""))
      .filter((t) => t.trim());
    const slideRels = await rels(zip, path);
    const images: string[] = [];
    for (const blip of byTag(doc, "blip")) {
      const target = slideRels[blip.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed") ?? ""];
      const type = IMAGE_TYPES[(target ?? "").split(".").pop()?.toLowerCase() ?? ""];
      const file = target && type ? zip.file(target) : null;
      if (file) images.push(URL.createObjectURL(new Blob([await file.async("arraybuffer")], { type })));
    }
    slides.push({ texts, images });
  }
  return slides;
}
