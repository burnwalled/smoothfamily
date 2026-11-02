# Translations

The app is translated into English, Swedish, Norwegian (Bokmål), Danish and Finnish. Each
language is one file in `frontend/src/locales/`:

| File    | Language                         |
|---------|----------------------------------|
| `en.ts` | English – the reference language |
| `sv.ts` | Swedish                          |
| `nb.ts` | Norwegian (Bokmål)               |
| `da.ts` | Danish                           |
| `fi.ts` | Finnish                          |

English is always bundled with the app. Every other language is downloaded only when someone
chooses it. Missing texts fall back to English.

## Adding or changing a text

1. Add the key and the English text to `en.ts`. Name the key `<area>.<what>`, for example
   `tasks.waitingApproval`.
2. Add the same key to every other locale file. TypeScript reports a missing key as an error.
3. Use the text in code with `t("tasks.waitingApproval")`.
4. Variables are written `{name}` and filled in with `t("tasks.doneBy", { name })`. Keep every
   `{placeholder}` in every translation, but move it wherever the language needs it.

`npm test` (in `frontend/`) checks that:

- every language has exactly the English keys;
- every `{placeholder}` is kept;
- no text is empty;
- every key is used somewhere in the app.

When you remove the last use of a text, remove its key from all five files.

## Adding a language

1. Copy `en.ts` to `<code>.ts`, using the ISO 639-1 code (`de`, `pl`, …). Change the header to
   `import type { Dictionary } from "./en";` and `const de: Dictionary = { … }`, like `sv.ts`.
2. Translate every value. Leave the keys and `{placeholders}` exactly as they are.
3. In `frontend/src/lib/i18n.tsx`:
   - add the code to `Locale`;
   - add it to `LOCALES`, with the language's own name, such as `Deutsch`;
   - add it to `DATE_LOCALES`, with a BCP 47 tag such as `de-DE`;
   - add it to `LOADERS`.
4. Add the new file to the `OTHERS` list in `frontend/src/locales/locales.test.ts`.
5. Add the language to the "What's new" entries in `frontend/src/lib/releaseNotes.ts`. Its
   `Record<Locale, …>` type requires it.
6. In `backend/app/schemas.py`, allow the code where the profile's `language` is validated.
7. Run `npm test` and `npx tsc --noEmit` in `frontend/`.
