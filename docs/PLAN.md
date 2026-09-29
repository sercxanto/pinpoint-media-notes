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
| 2b    | Book import: cover fallback, bot check, record picker, contract test | open   |
| 3     | TMDB import                                                          | open   |
| 4     | README complete, manual test checklist                               | open   |

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
- [ ] Fallback chain: own ISBN, `776 $z`, `776 $w` via SRU
- [ ] Report which ISBN supplied the cover, flag foreign editions
- [ ] Record picker modal when a lookup returns several records
- [ ] Contract test against the live DNB

## Phase 3: TMDB import

- [ ] URL parsing
- [ ] Movie request; series with a second request for `external_ids`
- [ ] Translation fallback: refill empty fields only
- [ ] Field mapping, file name, note builder with golden test, field-coverage test
- [ ] Poster download
- [ ] Token masked in settings, never in messages; config check before import
- [ ] Command and modal
- [ ] Contract test against the live API (token from environment)

## Phase 4: documentation

- [ ] README: installation (manual and later community list), settings, usage, field mapping tables, file naming, cover caveat, pointer to the vault's conventions notes
- [ ] Final pass over `AGENTS.md`
- [ ] Checklist for manual testing in Obsidian
