# AGENTS.md

Guidance for coding agents working in this repository. Read this first, then
`docs/PLAN.md` for the current state of work.

## What this is

**Pinpoint Media Notes** (plugin id `pinpoint-media-notes`) is an Obsidian
plugin, written in TypeScript. It creates one note per entry, with a cover
image and a fixed frontmatter schema:

- **book import**: from an ISBN or DNB record number, using the Deutsche
  Nationalbibliothek (DNB) catalogue (SRU/MARC21, no key needed).
- **TMDB import**: from a TMDB movie or series URL, using the TMDB API (bearer
  token).

It ports two Python CLI scripts (`tmdb-import`, `book-import` from the
`obsidian-scripts` project) to a plugin with feature parity. That Python source
is **not** available here. The specs are:

- `docs/specs/PLUGIN_PORTING_BRIEF.md`: the porting brief. Read it first.
- `docs/specs/book-import-spec.md`, `docs/specs/tmdb-import-spec.md`: the
  original specs, authoritative for wire-level details (URLs, headers, quoting
  indicators, checksums).

The specs are reference material. Do not edit them; record deviations and
decisions in the _Decisions_ section below instead.

## Working agreement with the maintainer

- Work proceeds in the phases listed in `docs/PLAN.md`, usually one session per
  phase. Start by reading `docs/PLAN.md` and continue with the next open phase.
- Work autonomously within a phase. Stop only for decisions that belong to the
  maintainer.
- At the end of a phase: `npm run check` must pass, update `docs/PLAN.md`
  (status, notes) and this file (new decisions, architecture changes), then
  report and stop.
- **Do not commit on your own.** The maintainer reviews the uncommitted diff
  first and then asks for the commit.
- Talk to the maintainer in German. Code, comments and docs in the repository
  are in English.

## Commands

| Command                     | What it does                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run check`             | typecheck, lint, format check, tests, production build. Must pass before handing over.               |
| `npm test`                  | offline test suite (Vitest)                                                                          |
| `npm run test:contract`     | opt-in checks against the live DNB/TMDB APIs; TMDB needs `TMDB_READ_ACCESS_TOKEN` in the environment |
| `npm run lint` / `lint:fix` | ESLint, warnings fail the run                                                                        |
| `npm run format`            | Prettier                                                                                             |
| `npm run build`             | bundles `src/main.ts` into `main.js`                                                                 |
| `npm run dev`               | watch build                                                                                          |

The real Obsidian app does not run in the dev container. Everything is verified
through the test suite; manual testing in Obsidian is the maintainer's job.

## Architecture

```
src/
  main.ts        plugin class: settings load/save, commands
  settings.ts    settings model, defaults, settings tab (declarative API, Obsidian 1.13+)
  core/          pure logic, no `obsidian` import (planned, phase 1)
  io/            the only places that touch the network (requestUrl) and the vault (planned)
  book/, tmdb/   the two importers (planned, phases 2 and 3)
  ui/            modals (planned)
tests/
  __mocks__/obsidian.ts   hand-written fake of the obsidian API (aliased in vitest.config.ts)
  contract/               live-API checks, only via `npm run test:contract`
```

Principles:

- **Keep core logic Obsidian-free.** Parsing, field mapping, sanitising and
  note building are pure functions, tested with zero mocking.
- **Seams:** all HTTP goes through one function (`requestUrl`, never `fetch`);
  all vault access goes through a thin layer. Tests mock exactly these.
- **The obsidian mock stays minimal.** Only add what production code actually
  uses.

## Invariants: do not break these

They are deliberate product decisions carried over from the original scripts.

1. **Order per entry:** parse input, fetch metadata, compute file name and
   check for a collision _before_ any image download, download the image (or
   reuse an existing file of the same name), write the note last.
2. **Never overwrite a note and never append a counter.** A name clash is
   reported and the entry is skipped.
3. **Never re-download an existing image** of the target name.
4. Note and image folders are **vault-relative**, never absolute, never `..`.
5. **NFC-normalise all external text** as it is read, before sanitising and
   before building the `cover` link.
6. **File names:** strip `* " \ / < > : | ? # ^ [ ]`, collapse whitespace,
   trim. The unmodified title goes into `title`.
7. **Frontmatter is built as a string** and its property order is a golden
   format (see specs). `year` and `series_index` unquoted, `isbn` always
   quoted, `template` and `cover` always quoted, `description` a single line,
   `genres: []` and (for books without author) `authors: []` as empty flow
   sequences.
8. **Never log or display the TMDB token**, error paths included.
9. **Errors:** configuration problems stop before any work and name what is
   missing; per-entry problems are reported and the user continues. When in
   doubt, treat it as per-entry.
10. **DNB covers:** decide by `Content-Type: image/*`, never by HTTP status (a
    bot filter answers 200 with HTML).
11. **Tests are not optional:** golden note-format test and field-coverage test
    per importer; contract tests stay opt-in.

Non-goals (rejected on purpose, do not add): search by title, updating
existing notes, per-season series notes, importing genres from the DNB,
recording translator/narrator/publisher/page count, prompting for
`rating`/`shelf`.

## Decisions

Record decisions here with a short reason.

- **Name and id:** "Pinpoint Media Notes" / `pinpoint-media-notes`. Checked
  against the community plugin list (2026-09-29): no collision; note that
  `media-importer` exists. **Check again before publishing.** The id is
  effectively permanent once published.
- **Language:** TypeScript. Toolchain: esbuild, Vitest, ESLint 9 with
  `eslint-plugin-obsidianmd` (recommended config, includes typescript-eslint
  type-checked rules), Prettier.
- **TypeScript 6.0, ESLint 9:** typescript-eslint does not support TS 7 yet;
  `eslint-plugin-obsidianmd` requires ESLint 9 (`@eslint/js` ^9). Revisit when
  those support newer majors.
- **minAppVersion 1.13.0**, to use the declarative settings API
  (`getSettingDefinitions`), which also makes settings searchable.
- **Settings:** one notes folder per importer (`bookNotesDir`,
  `tmdbNotesDir`), one shared `assetsDir` (default `assets`).
- **Ambiguous 10-character input** (ISBN-10 or IDN): look it up as ISBN first,
  retry as IDN if nothing matches, report which one was used. This follows the
  porting brief, not `book-import-spec.md`: every real IDN also passes the
  ISBN-10 check digit test, so the check digit cannot decide.
- **License:** MIT.

## Before publishing to the community list

- Re-check the plugin name and id against
  `https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json`.
- Run `npm run check`; the obsidianmd lint rules cover the review guidelines.
