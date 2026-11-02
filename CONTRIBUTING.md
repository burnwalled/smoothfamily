# Contributing to Smooth Family

Thank you for wanting to help. Smooth Family is a family's app first: it should be calm, clear and
private, and it should work for a child of six as well as for a grandparent.

## Before you start

- **A bug or a wish?** Open an issue with the matching form. Server admins can also collect their
  families' reports in the app (Server settings → Reports) and export them here – those arrive with
  the label `from-server-admin`.
- **A bigger change?** Open an issue first, so we can agree on the shape before you build it.
- **A security problem?** Don't open an issue – see [SECURITY.md](SECURITY.md).

## The principles

- **The family's data stays at home.** No calls to other services unless the family turns them on,
  and then only what is needed (a barcode, not the shopping list). No telemetry, no trackers, no
  fonts or scripts from other servers.
- **Five languages, always.** Every text the user sees is in `frontend/src/locales/<code>.ts` – en,
  sv, nb, da and fi. The tests fail on a missing or unused key. See
  [docs/TRANSLATIONS.md](docs/TRANSLATIONS.md).
- **The help centre follows the app.** A new feature or a change gets its text in
  `frontend/src/help/<code>.ts` (all five languages, the same blocks) and, where it helps, a
  screenshot from `sh scripts/help-shots.sh`. The wiki is made from the English help
  (`frontend/scripts/help-wiki.ts`), so it follows too.
- **One look everywhere.** See [docs/DESIGN.md](docs/DESIGN.md): the page frame, cards, tabs and
  colours from the theme.
- **Children see what is meant for them.** Check who may read and change what, in the backend – not
  only by hiding a button.

## Working on it

```sh
docker compose up -d --build        # the whole stack
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit && npm test
sh scripts/e2e.sh                   # browser tests on a throwaway stack
```

- A database change is an Alembic migration in `backend/alembic/versions/` (numbered, with a
  docstring that says what and why). Constraints that only Postgres enforces are mirrored in the
  models, so the SQLite tests catch them too.
- Tests come with the change: a backend test for the API, an e2e test for what a person does.
- Write code that reads like the code around it – the same naming, the same comment density.
- Commits and pull requests in English; say what changed and why.

## Branches and releases

- **`main`** is the released, stable version – what `git clone` gives, what the website and the
  wiki describe, and where the Home Assistant add-on comes from. Every release is a tag (`v3.3.0`)
  and a GitHub release on `main`.
- **`beta`** is where changes are gathered and tested together. The maintainer runs it on their own
  family's server before it is released.
- **Your branch** starts from `beta` and goes back to `beta` as a pull request; it is squashed into
  one commit there.
- **A release** is a pull request from `beta` to `main`, merged with a merge commit (not squashed,
  so the two branches stay in step). In "What's new" the version is `3.3.0-beta.1` while it is in
  beta and `3.3.0` when it reaches `main`.
- **An urgent fix** for a release goes to `beta` and is released from there at once.

## Pull requests

1. Fork, branch from `beta`, make the change with its tests and texts.
2. Make sure the backend tests, `npx tsc --noEmit`, `npm test` and the e2e tests pass.
3. Open the pull request against `beta` and fill in its form.

By contributing you agree that your contribution is licensed under the
[AGPL-3.0](LICENSE).
