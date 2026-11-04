// Bringing a guest list in (3.4.0): the rows of an Excel sheet, a CSV or a text file become guests. The
// columns are guessed from their names in the five languages or from what they hold, and can be
// changed before anything is added. Nothing runs from the file, and it's read in the browser.
export type GuestRow = { first_name: string; last_name: string; email: string; allergies: string };
export type ColumnKey = "name" | "first_name" | "last_name" | "email" | "allergies";
export type Columns = Partial<Record<ColumnKey, number>>;
export const COLUMN_KEYS: ColumnKey[] = ["name", "first_name", "last_name", "email", "allergies"];
export const MAX_GUESTS = 500;

const EMAIL = /[^@\s<>,;:"]+@[^@\s<>,;:"]+\.[^@\s<>,;:"]+/;
const WORDS: Record<ColumnKey, string[]> = {
  name: ["name", "full name", "guest", "namn", "fullständigt namn", "gäst", "navn", "fullt navn", "fulde navn", "gjest", "gæst", "nimi", "koko nimi", "vieras"],
  first_name: ["first name", "firstname", "given name", "förnamn", "fornamn", "fornavn", "etunimi"],
  last_name: ["last name", "lastname", "surname", "family name", "efternamn", "etternavn", "efternavn", "sukunimi"],
  email: ["email", "e-mail", "mail", "e-post", "epost", "e-postadress", "sähköposti", "email address"],
  allergies: ["allergies", "allergy", "diet", "special diet", "allergier", "allergi", "kost", "specialkost", "allergia", "allergiat", "ruokavalio"],
};

const clean = (s: string) => s.replace(/^﻿/, "").trim();

// A delimited line, with "quotes" holding separators and doubled quotes.
function cells(line: string, separator: string): string[] {
  const out: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && !cell.trim()) {
      cell = "";
      quoted = true;
    } else if (c === separator) {
      out.push(clean(cell));
      cell = "";
    } else cell += c;
  }
  out.push(clean(cell));
  return out;
}

// The rows of a CSV or text file. The separator is whichever splits the lines most evenly: Swedish
// Excel saves with ;, others with , or a tab. A comma in "Saga Berg, Ella Berg" in a plain list of
// names only counts if most lines have it.
export function parseText(text: string): string[][] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const best = ["\t", ";", ","].map((sep) => ({ sep, rows: lines.filter((l) => l.includes(sep)).length })).sort((a, b) => b.rows - a.rows)[0];
  const separator = best.rows * 2 > lines.length ? best.sep : null;
  return lines.map((l) => (separator ? cells(l, separator) : [clean(l)]));
}

const headerOf = (cell: string): ColumnKey | null => {
  const word = cell.toLowerCase().replace(/[:*]/g, "").trim();
  return COLUMN_KEYS.find((k) => WORDS[k].includes(word)) ?? null;
};

// Which column is what: by the header when the first row has one, else by what the columns hold.
export function guessColumns(rows: string[][]): { columns: Columns; header: boolean } {
  const first = rows[0] ?? [];
  const named: Columns = {};
  first.forEach((cell, i) => {
    const key = headerOf(cell);
    if (key && named[key] === undefined) named[key] = i;
  });
  if (Object.keys(named).length) return { columns: named, header: true };
  const columns: Columns = {};
  const width = Math.max(0, ...rows.map((r) => r.length));
  for (let i = 0; i < width; i++) {
    const filled = rows.map((r) => r[i] ?? "").filter(Boolean);
    if (columns.email === undefined && filled.length && filled.filter((c) => EMAIL.test(c)).length * 2 >= filled.length) columns.email = i;
    else if (columns.name === undefined && filled.length) columns.name = i;
  }
  return { columns, header: false };
}

// "Saga Berg <saga@x.se>", or just a name: the first word is the first name, the rest the last.
function nameAndMail(text: string): { first_name: string; last_name: string; email: string } {
  const email = text.match(EMAIL)?.[0] ?? "";
  const name = text.replace(EMAIL, "").replace(/[<>()"]/g, " ").replace(/\s+/g, " ").trim();
  const [first = "", ...rest] = name.split(" ");
  return { first_name: first, last_name: rest.join(" "), email };
}

const key = (g: GuestRow) => (g.email ? g.email.toLowerCase() : `${g.first_name} ${g.last_name}`.trim().toLowerCase());

export type Parsed = { guests: GuestRow[]; duplicates: number; badEmails: number; tooMany: number };

// The guests of the rows; the same person twice comes once, and a bad address is left out.
export function toGuests(rows: string[][], columns: Columns, header: boolean): Parsed {
  const seen = new Set<string>();
  const out: Parsed = { guests: [], duplicates: 0, badEmails: 0, tooMany: 0 };
  const get = (row: string[], k: ColumnKey) => (columns[k] === undefined ? "" : (row[columns[k]!] ?? "").trim());
  for (const row of header ? rows.slice(1) : rows) {
    const whole = nameAndMail(get(row, "name"));
    const written = get(row, "email");
    let email = written || whole.email;
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      out.badEmails++;
      email = "";
    }
    const guest: GuestRow = {
      first_name: (get(row, "first_name") || whole.first_name).slice(0, 80), last_name: (get(row, "last_name") || whole.last_name).slice(0, 80),
      email, allergies: get(row, "allergies").slice(0, 300),
    };
    if (!guest.first_name) continue;
    if (seen.has(key(guest))) {
      out.duplicates++;
      continue;
    }
    seen.add(key(guest));
    if (out.guests.length >= MAX_GUESTS) out.tooMany++;
    else out.guests.push(guest);
  }
  return out;
}
