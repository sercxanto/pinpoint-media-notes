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
| 2a    | Book import: input, MARC, mapping, note, import order                | open   |
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

- [ ] Input parsing: ISBN-13, ISBN-10 → ISBN-13, check digits, IDN, `d-nb.info` URL, ambiguous 10-character case
- [ ] SRU request and MARC21 parsing (records with a direct `leader` child only)
- [ ] Field mapping incl. `$4 aut` filter, non-sorting markers, year, series index
- [ ] Type from `336`/`338`, unsupported types reported
- [ ] Blurb: fetch `Inhaltstext` link only, strip HTML, truncate at sentence boundary under 500 characters
- [ ] File name with type suffix; note builder with golden test; field-coverage test
- [ ] Import orchestration with the invariant order, collision check before download
- [ ] Command and input modal

## Phase 2b: book import, covers and edge cases

- [ ] Cover download with `Content-Type` check and message when blocked
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
