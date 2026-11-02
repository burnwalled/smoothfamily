# Design guide

How Smooth Family looks and behaves, so every app feels like the same app on a phone (≈390 px)
and on a computer. New screens follow this; old ones are moved over when they are touched.

## Pages

- **Heading:** `PageTitle` (`components/PageTitle.tsx`) – the app's menu icon and its name. The
  icon comes from the menu (`lib/nav.ts`), so the heading always matches the menu. Today is the
  exception: its heading is the date.
- **Actions** sit to the right of the heading (`flex flex-wrap items-center justify-between`), and
  wrap below it on a phone.
- **Sections** are cards: `card p-5` with a small heading
  `text-sm font-bold uppercase tracking-wide text-muted`. Cards stack with `mt-4` (or a `grid gap-4`).
- **Empty:** `EmptyState` – a dashed box with one sentence that says what to do, and maybe a button.
- **Loading:** `t("common.loading")` in `text-sm text-muted`; the read cache usually shows the
  last answer at once, so this is rare.
- **Errors:** one line in `text-sm text-red-700` near what failed. Field problems from the server
  are explained field by field (`lib/fieldErrors.ts`).

## Controls

- **Buttons:** `btn-primary` for the main action of a card (one per card), `btn-ghost` for the
  rest, `btn-ghost border border-edge` for a secondary action that needs to look like a button.
  Removing is a small red text button or a trash icon, and asks first when it can't be undone.
- **Inputs:** `input`, with a visible label (`label` or a small `text-xs text-muted` text above).
  Every input without a visible label has an `aria-label`.
- **Choices:** chips (`rounded-full border px-2.5 py-1 text-xs`, `aria-pressed`) for a few options,
  a `select` for many, tabs (`role="tab"`, `aria-selected`) to switch views within a page.
- **Touch:** targets at least 40 × 40 px on phones (icon buttons `h-10 w-10` or `px-2 py-1`
  around a 16 px icon); nothing important only on hover.

## Colour and type

- Colours only through the theme tokens (`bg-surface`, `bg-base`, `text-ink`, `text-muted`,
  `border-edge`, `accent`, `primary-*`) so every theme works. Status colours: green for done/home,
  amber for "soon"/waiting, red for errors, allergies and the emergency card.
- Type scale: page `text-2xl font-extrabold`, card heading `text-sm font-bold uppercase`, body
  `text-sm`, details `text-xs text-muted`.
- Icons: lucide, `strokeWidth={2}` (1.75 in dense lists), `aria-hidden` unless they carry meaning
  alone – then they get an `aria-label`.

## Phones

- Safe areas (`env(safe-area-inset-*)`) at the bottom bar and floating buttons.
- Forms open inline in the page rather than in dialogs; dialogs are kept for things that need full
  attention (the emergency card on the kitchen display).
- Long rows wrap (`flex-wrap`) instead of scrolling sideways.

## Language and privacy

- Every text is in all five languages (`docs/TRANSLATIONS.md`).
- Say plainly what is shared and with whom when it isn't obvious (presence, guest links, documents).
