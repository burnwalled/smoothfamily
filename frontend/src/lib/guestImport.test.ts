import assert from "node:assert/strict";
import { test } from "node:test";
import { guessColumns, parseText, toGuests } from "./guestImport";

const guests = (text: string) => {
  const rows = parseText(text);
  const { columns, header } = guessColumns(rows);
  return toGuests(rows, columns, header);
};

test("a Swedish Excel's CSV: semicolons, a byte-order mark and Swedish headers", () => {
  const out = guests("﻿Förnamn;Efternamn;E-post;Allergier\r\nSaga;Berg;saga@example.com;Nötter\r\nNils;Ek;;\r\n");
  assert.deepEqual(out.guests, [
    { first_name: "Saga", last_name: "Berg", email: "saga@example.com", allergies: "Nötter" },
    { first_name: "Nils", last_name: "Ek", email: "", allergies: "" },
  ]);
});

test("commas with quotes, and the other languages' headers", () => {
  const out = guests('Etunimi,Sukunimi,Sähköposti,Allergia\nAino,Virtanen,aino@example.fi,"Pähkinät, maito"\n');
  assert.equal(out.guests[0].allergies, "Pähkinät, maito");
  assert.equal(out.guests[0].email, "aino@example.fi");
});

test("a text file of names, with or without addresses", () => {
  const out = guests("Saga Berg\nNils Erik Ek <nils@example.com>\n\nMaja\n");
  assert.deepEqual(out.guests.map((g) => [g.first_name, g.last_name, g.email]), [["Saga", "Berg", ""], ["Nils", "Erik Ek", "nils@example.com"], ["Maja", "", ""]]);
});

test("no header: the columns are told by what they hold", () => {
  const out = guests("Saga Berg\tsaga@example.com\nNils Ek\tnils@example.com\n");
  assert.deepEqual(out.guests[1], { first_name: "Nils", last_name: "Ek", email: "nils@example.com", allergies: "" });
});

test("a stray comma in a list of names doesn't make columns", () => {
  assert.deepEqual(parseText("Saga Berg\nNils Ek\nMaja, Leo och Sixten\n"), [["Saga Berg"], ["Nils Ek"], ["Maja, Leo och Sixten"]]);
});

test("the same person once, a bad address left out, and a limit", () => {
  const out = guests("Namn;E-post\nSaga Berg;saga@example.com\nSaga B;SAGA@example.com\nNils Ek;inte-en-adress\nNils Ek;\n");
  assert.equal(out.guests.length, 2);
  assert.equal(out.duplicates, 2);
  assert.equal(out.badEmails, 1);
  assert.equal(out.guests[1].email, "");
  const many = Array.from({ length: 520 }, (_, i) => `Gäst${i}`).join("\n");
  const big = guests(many);
  assert.equal(big.guests.length, 500);
  assert.equal(big.tooMany, 20);
});

test("rows of an Excel sheet with chosen columns", () => {
  const rows = [["Bord", "Vem", "Mejl"], ["1", "Saga Berg", "saga@example.com"]];
  const out = toGuests(rows, { name: 1, email: 2 }, true);
  assert.deepEqual(out.guests, [{ first_name: "Saga", last_name: "Berg", email: "saga@example.com", allergies: "" }]);
});

test("nothing to bring in", () => {
  assert.deepEqual(parseText("  \n\n"), []);
  assert.deepEqual(guessColumns([]).columns, {});
});
