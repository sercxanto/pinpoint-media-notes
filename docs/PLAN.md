# Plan

Phases of the port. One session per phase is the norm; each phase ends with
`npm run check` passing, this file and `AGENTS.md` updated, and a report to the
maintainer. The maintainer reviews the uncommitted diff, then asks for the
commit.

Status values: `open`, `in progress`, `review` (done, waiting for the
maintainer), `done` (committed).

| Phase | Content                                                              | Status |
| ----- | -------------------------------------------------------------------- | ------ |
| 0     | Scaffold, lint, tests, handover docs                                 | done   |
| 1     | Shared core                                                          | done   |
| 2a    | Book import: input, MARC, mapping, note, import order                | done   |
| 2b    | Book import: cover fallback, bot check, record picker, contract test | done   |
| 3     | TMDB import                                                          | done   |
| 4     | README complete, manual test checklist                               | done   |

## Phase 0: scaffold

- [x] git repository, `.gitignore`, `.editorconfig`, MIT `LICENSE`
- [x] specs moved to `docs/specs/`
- [x] `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `manifest.json`, `versions.json`
- [x] ESLint (`eslint-plugin-obsidianmd` recommended) and Prettier
- [x] Vitest with `obsidian` alias to `tests/__mocks__/obsidian.ts`; separate contract config
- [x] Plugin class with settings load/save and settings tab (all settings of both importers)
- [x] `AGENTS.md`, `CLAUDE.md`, this plan, README stub

Notes:

- The obsidian mock currently covers `Plugin`, `PluginSettingTab`, `App`,
  `Notice`. Vault, `requestUrl` and `Modal` are added when first used.
- The token field is a plain text field for now; masking it is part of phase 3.

## Phase 1: shared core

Pure functions in `src/core/`, no `obsidian` import, fully unit-tested.

- [x] `text.ts`: `nfc`, `sanitizeFileName`, `noteStem` (title, year, type suffix)
- [x] `frontmatter.ts`: YAML scalar quoting, block sequences, `[]`, single-line scalars, `buildFrontmatter`/`buildNote` keeping the given key order; both spec example notes reproduced character for character
- [x] `paths.ts`: `checkVaultFolder`, `validateFolderInput` (wired into the settings tab), `requireVaultFolder` (throws `ConfigError` naming the setting)
- [x] `errors.ts`: `ConfigError`, `EntryError`
- [x] `io/http.ts` (`httpGet`, the only `requestUrl` caller) and `io/vault.ts` (`VaultFiles` interface and its Obsidian implementation); the obsidian mock gained `requestUrl`, `normalizePath` and an in-memory `Vault`

Notes:

- Importer tests should depend on the `HttpGet` and `VaultFiles` interfaces
  and use small in-memory fakes, not the obsidian mock.
- The quoting rules go beyond the spec where the spec's list would produce
  invalid or misread YAML; see _Decisions_ in `AGENTS.md`.

## Phase 2a: book import, core path

- [x] Input parsing: ISBN-13, ISBN-10 → ISBN-13, check digits, IDN, `d-nb.info` URL, ambiguous 10-character case
- [x] SRU request and MARC21 parsing (records with a direct `leader` child only)
- [x] Field mapping incl. `$4 aut` filter, non-sorting markers, year, series index
- [x] Type from `336`/`338`, unsupported types reported
- [x] Blurb: fetch `Inhaltstext` link only, strip HTML, truncate at sentence boundary under 500 characters
- [x] File name with type suffix; note builder with golden test; field-coverage test
- [x] Import orchestration with the invariant order, collision check before download
- [x] Command and input modal

Notes:

- Code in `src/book/`: `input.ts` (parsing, check digits), `marc.ts`
  (SRU/MARC-XML via `DOMParser`), `record.ts` (field mapping,
  `BOOK_RECORD_SOURCES`), `blurb.ts`, `note.ts` (stem, note), `dnb.ts` (URLs
  and the three requests), `importer.ts` (orchestration, config check). The
  modal is `src/ui/import-modal.ts`, generic enough for TMDB.
- Tests run under jsdom (for `DOMParser`). Fixtures in `tests/fixtures/book/`
  are real SRU responses (DNB metadata is CC0): _Die 1 % Methode_, a title
  search for _Die Känguru-Rebellion_ returning five editions (audio CD,
  paperback, e-book with series, audio download with the author in `700`,
  illustrated edition), and an empty result. Blurb fixtures are invented,
  because blurb texts are publisher copy.
- Pulled forward from 2b: the edition's own cover is downloaded with the
  `Content-Type` check, and the reason for a missing cover (404, bot check,
  other) is reported. Still open for 2b: the fallback chain and flagging
  foreign editions.
- Several records: `importBook` takes a `chooseRecord` callback. Until the
  picker exists, `refuseSeveralRecords` skips the entry and lists the records
  with their `d-nb.info` links, which the user can paste instead.
- Fixed `vitest.contract.config.ts`: `mergeConfig` concatenated the base
  config's `exclude: tests/contract/**`, so no contract test would ever have
  run.
- The command is named "Import book": the sentence-case lint rule rejects
  "ISBN" in a command name.
- The modal stays open after an import; the field is cleared on success and
  kept on error, so a typo can be fixed. Results go to a `Notice` (10 s).

## Phase 2b: book import, covers and edge cases

- [x] Cover download with `Content-Type` check and message when blocked (done in 2a)
- [x] Fallback chain: own ISBN, `776 $z`, `776 $w` via SRU
- [x] Report which ISBN supplied the cover, flag foreign editions
- [x] Record picker modal when a lookup returns several records
- [x] Contract test against the live DNB

Notes:

- `BookRecord` gained `otherEditionIsbns` (`776 $z`, as ISBN-13) and
  `otherEditionIdns` (`776 $w` with the `(DE-101)` prefix only; other
  libraries' numbers and a link to the record itself are dropped).
  `recordIsbn` reads the ISBN of a linked record without mapping the rest.
- The chain lives in `importer.ts` (`findCover`, `coverCandidates`). Linked
  records are looked up lazily, only when the own ISBN and every `776 $z`
  have failed. Each ISBN is asked for once.
- `fetchCover` now classifies a failure as `missing` (404, unsupported image
  type: try the next edition) or `blocked` (bot check, other HTTP status,
  network: stop the chain, see _Decisions_).
- Messages: `Cover from ISBN X.` for the own edition; `Cover from ISBN X,
another edition; its artwork may differ.` otherwise, with the
  `d-nb.info` link when it came from a `776 $w` record. Without a cover the
  message lists every ISBN tried and every linked record that could not be
  looked up.
- Record picker: `src/ui/record-picker.ts`, a modal over the import modal
  with one row per record (title and year; type, ISBN, `d-nb.info` link) and
  an "Import" button each. Closing it skips the entry. Unsupported material
  is listed too; choosing it gives the usual "unsupported material" message.
  `refuseSeveralRecords` is gone. The obsidian mock's `Modal.close` now calls
  `onClose`, as Obsidian does; `onOpen` is still not run in tests.
- Contract test `tests/contract/dnb.contract.test.ts` (9 checks, passed live
  on 2026-09-29): SRU by ISBN and by record number, `776 $w` resolution, empty
  result, blurb, cover as `image/*`, 404 for a coverless ISBN, and one
  `importBook` end to end. Field shapes are checked against
  `BOOK_RECORD_SHAPE` (`tests/contract/book-shape.ts`, typed against
  `BookRecord`); the offline field-coverage test checks its keys too. HTTP in
  the contract tests goes through `fetch` (`node-http.ts`); ESLint's
  `fetch` ban is lifted for `tests/contract/` only.

## Phase 3: TMDB import

- [x] URL parsing
- [x] Movie request; series with a second request for `external_ids`
- [x] Translation fallback: refill empty fields only
- [x] Field mapping, file name, note builder with golden test, field-coverage test
- [x] Poster download
- [x] Token masked in settings, never in messages; config check before import
- [x] Command and modal
- [x] Contract test against the live API (token from environment)

Notes:

- Code in `src/tmdb/`: `input.ts` (link parsing, canonical `url`), `api.ts`
  (URLs, bearer headers, `getJson` with NFC over the whole response,
  `fetchPoster`, `redact`), `entry.ts` (field mapping, `TMDB_ENTRY_SOURCES`,
  fallback merge), `note.ts` (stem, note), `importer.ts` (orchestration,
  config check). The command is "Import movie or series"
  (`import-movie-or-series`), using the same modal as the book import.
- Order per entry: details in the configured language; the same request
  without `language` if `overview` is empty or `poster_path` is null; name
  and collision check; for a series `external_ids`; poster; note. A skipped
  series costs at most two requests.
- The import modal's `onSubmit` now resolves to `next` (clear the field),
  `retry` (keep the input) or `stop` (close the modal). `stop` is used for a
  `ConfigError` during an import, i.e. TMDB answering 401.
- Token field: the declarative `text` control cannot be masked, so the token
  row is a `render` item with a password input over
  `getControlValue`/`setControlValue`. The obsidian mock gained those two.
  The maintainer chose plaintext in `data.json` over Obsidian's
  `SecretStorage` (see _Decisions_).
- Fixtures in `tests/fixtures/tmdb/` have the shape of real responses; the
  texts are the spec's example or invented, because TMDB overviews are user
  contributions. The series fixtures (Breaking Bad, `de-DE` without
  overview and poster, the untranslated answer, `external_ids`) cover the
  fallback path.
- Contract test `tests/contract/tmdb.contract.test.ts`: six checks need
  `TMDB_READ_ACCESS_TOKEN` and are skipped without it; one (a bad token gets
  401, read as `ConfigError`) needs no token. All seven passed live on
  2026-09-29, run by the maintainer with a token (the dev container has
  none).
  Field shapes are in `tests/contract/tmdb-shape.ts`, typed against
  `TmdbEntry`.

## Phase 4: documentation

- [x] README: installation (manual and later community list), settings, usage, field mapping tables, file naming, cover caveat, pointer to the vault's conventions notes
- [x] Final pass over `AGENTS.md`
- [x] Checklist for manual testing in Obsidian

Notes:

- README rewritten for users: requirements, installation (community list
  placeholder, manual build with the install script), settings table with
  how to get the TMDB token, both imports with accepted input, both golden
  notes with field mapping tables, file naming and the no-overwrite rule,
  covers and the bot-filter caveat, message categories, network use and
  privacy (hosts, no telemetry, TMDB attribution), sync and mobile, non-goals.
  The meaning of the properties is not explained; the README points to the
  vault's conventions notes, as the specs ask.
- `docs/MANUAL_TEST.md`: checklist for Obsidian itself (settings tab,
  configuration errors, both imports with real ISBNs, record numbers and
  TMDB ids, name clash, mobile), with a result table. The record picker
  item needs an ISBN shared by two editions, which none of the fixtures
  has; the checklist says to find one first.
- `AGENTS.md`: `docs/` and the install script in the layout, a
  _Documentation_ section (keep the README in step with user-visible
  behaviour), a decision on the network disclosure and TMDB attribution,
  and release steps under _Before publishing_.
- No code changes.
