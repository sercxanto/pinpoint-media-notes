# AGENTS.md

Guidance for coding agents working in this repository. Read this first.

## What this is

**Pinpoint Media Notes** (plugin id `pinpoint-media-notes`) is an Obsidian
plugin, written in TypeScript. It creates one note per entry, with a cover
image and a fixed frontmatter schema:

- **book import**: from an ISBN or DNB record number, using the Deutsche
  Nationalbibliothek (DNB) catalogue (SRU/MARC21, no key needed).
- **TMDB import**: from a TMDB movie or series URL, using the TMDB API (bearer
  token).

## Documents

| File                             | What it is                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `docs/SPEC.md`                   | what the plugin does and why. The authority on behaviour. Read it first.         |
| `docs/schema/`                   | the vault notes describing the schema the plugin writes: conventions, templates. |
| `docs/book-source-evaluation.md` | why the book importer uses the DNB, measurements behind the cover fallback.      |
| `README.md`                      | user documentation, derived from the spec.                                       |
| `docs/MANUAL_TEST.md`            | checklist for the manual test in Obsidian.                                       |
| `docs/PLAN.md`                   | the current multi-session plan (LoC fallback). Removed when the work is done.    |
| this file                        | how to work here: commands, architecture, implementation decisions.              |

## Working agreement with the maintainer

- Tasks come from the maintainer. Work autonomously within a task. Stop only
  for decisions that belong to the maintainer.
- At the end of a task: `npm run check` must pass, update `docs/SPEC.md`,
  this file (new decisions, architecture changes), `README.md` and
  `docs/MANUAL_TEST.md` where the task affects them (see _Documentation_),
  then report and stop.
- A larger undertaking may get a short plan file of its own; remove it when
  the work is done and keep what stays relevant here.
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
  core/          pure logic, no `obsidian` import
    errors.ts      ConfigError (stop the import), EntryError (report, continue)
    text.ts        nfc, sanitizeFileName, noteStem
    frontmatter.ts yamlScalar, buildFrontmatter, buildNote
    paths.ts       vault-relative folder check for settings and imports
  io/
    http.ts        httpGet: the only caller of requestUrl (HttpGet type for fakes); BOOK_HOST_HEADERS
    vault.ts       VaultFiles interface and its implementation over app.vault
  book/          book importer
    input.ts       ISBN/IDN/link parsing, check digits
    marc.ts        SRU response → MARC records (DOMParser), NFC and marker stripping on read
    record.ts      BookRecord (source-neutral), rdaBookType (RDA codes → type), describeRecord
    dnb-record.ts  MARC → DnbRecord, DNB_RECORD_SOURCES (field-coverage table), recordIsbn
    jsonld.ts      JsonLdGraph: flat JSON-LD nodes linked by @id, NFC and trimming on read
    loc-record.ts  JSON-LD → LocRecord, LOC_RECORD_SOURCES, matchLocRecords (the cancinv rule)
    blurb.ts       blurb HTML → text, truncation
    note.ts        file stem with type suffix, note builder
    cover.ts       downloadCover: one cover request, judged by Content-Type; COVER_EXTENSIONS
    dnb.ts         SRU, blurb and cover requests (over HttpGet)
    loc.ts         id.loc.gov search and record requests (over HttpGet); not wired yet
    openlibrary.ts Open Library title and cover requests (over HttpGet); not wired yet
    importer.ts    importBook: the per-entry order, cover fallback chain; bookImportConfig
  tmdb/          TMDB importer
    input.ts       link parsing (movie/tv + id), canonicalUrl
    api.ts         URLs, bearer headers, getJson (401 → ConfigError, NFC on read), fetchPoster, redact
    entry.ts       response → TmdbEntry, TMDB_ENTRY_SOURCES (field-coverage table), translation fallback
    note.ts        file stem, note builder
    importer.ts    importTmdb: the per-entry order, poster; tmdbImportConfig
  ui/
    import-modal.ts  text field modal, stays open for the next entry; closes on a ConfigError
    record-picker.ts choose one of several catalogue records; closing skips
tests/
  __mocks__/obsidian.ts   hand-written fake of the obsidian API (aliased in vitest.config.ts)
  helpers.ts              fixtures, fake HttpGet and VaultFiles, MARC record builder
  fixtures/               API responses, see "Fixtures" below
  contract/               live-API checks, only via `npm run test:contract`
    dnb-shape.ts            DNB_RECORD_SHAPE: per-field shape checks, typed against DnbRecord
    loc-shape.ts            LOC_RECORD_SHAPE: the same for LocRecord
    tmdb-shape.ts           TMDB_ENTRY_SHAPE: the same for TmdbEntry
    node-http.ts            HttpGet over fetch, because requestUrl exists only in Obsidian

Tests run under jsdom, because the book importer uses the `DOMParser` that
Obsidian provides.

The obsidian mock: `Modal.close` calls `onClose`, as Obsidian does;
`onOpen` is not run in tests. `requestUrl` and the in-memory `Vault` serve
the `io/` and plugin tests; importer tests use the fakes in `helpers.ts`.

scripts/install-to-vault.sh  copies main.js and manifest.json into a vault
scripts/install-schema-to-vault.sh  copies docs/schema/ into a vault; --diff previews
docs/
  SPEC.md                    behaviour, the authority
  book-source-evaluation.md  why the DNB
  MANUAL_TEST.md             checklist for the manual test in Obsidian
  schema/                    vault notes: conventions and templates, copied 1:1 into a vault
README.md                    user documentation
```

Fixtures (`tests/fixtures/`): the SRU responses in `book/` are real (DNB
metadata is CC0): _Die 1 % Methode_, a title search for _Die
Känguru-Rebellion_ returning five editions, and an empty result. The
`id.loc.gov` search responses and record documents in `loc/` are real too
(LoC data is public domain), except every summary and table of contents,
replaced by invented text of the same form (quotes and attribution kept).
The Open Library edition records in `openlibrary/` are real (CC0), with
`description` and `notes` removed; they are the bodies behind the redirect.
Blurb texts
and the TMDB texts in `tmdb/` are the spec's examples or invented, because
blurbs are publisher copy and TMDB overviews are user contributions; only
the response shapes are real. Do not add real copyrighted text.

Principles:

- **Keep core logic Obsidian-free.** Parsing, field mapping, sanitising and
  note building are pure functions, tested with zero mocking.
- **Seams:** all HTTP goes through one function (`requestUrl`, never `fetch`);
  all vault access goes through a thin layer. Tests mock exactly these.
- **The obsidian mock stays minimal.** Only add what production code actually
  uses.

## Behaviour and schema

- `docs/SPEC.md` states the behaviour, and every rule in it is a product
  decision. Do not change behaviour the spec describes unless the task asks
  for it. A task that changes behaviour updates the spec in the same change,
  including the reason when it is not obvious.
- Where the code and the spec disagree, that is a bug in one of them. Report
  it to the maintainer rather than deciding which one is right.
- `docs/schema/` belongs to the maintainer. It describes what the properties
  mean, and changing it changes the maintainer's vault. Propose changes; make
  them only when the task asks for it. A schema change gets an entry under
  _Schema changes_ in the conventions note concerned, describing the
  migration.
- The files in `docs/schema/` are Obsidian notes, copied 1:1 between this
  repository and a vault. Keep them that way: wikilinks (`[[Book Template]]`),
  not Markdown links, even though they do not resolve on GitHub; no links into
  the repository; no other files in that folder (no README). They are
  excluded from Prettier, so a round trip through the vault produces no diff.

## Tests

- Every importer has a golden note-format test, comparing a complete note
  string against the spec's example note, and a field-coverage test: the
  source tables (`DNB_RECORD_SOURCES`, `LOC_RECORD_SOURCES`,
  `TMDB_ENTRY_SOURCES`) are typed
  against the record types, and every entry is checked against the fixtures
  and the contract shapes. A new field cannot be added without a test.
- Contract tests check the live APIs for shape, never for content, and stay
  opt-in.

## Documentation

- `docs/SPEC.md` changes with every change in behaviour.
- `README.md` is the user documentation: settings, accepted input, note
  format with field mapping tables, file naming, covers, messages, network
  use. A change to behaviour the user sees (a setting, an accepted input, a
  property, a message category, a host contacted) updates it in the same
  change. The golden examples in the README match the spec's.
- Neither the spec nor the README explains what the properties mean; that
  belongs to `docs/schema/`, and both point there.
- `docs/MANUAL_TEST.md` covers what the test suite cannot: the plugin
  inside Obsidian. Add an item when a change touches the settings tab, a
  modal, notices, `io/` or platform behaviour.

## Decisions

Implementation and tooling decisions, with a short reason. Product decisions
go into the spec.

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
  (`getSettingDefinitions`), which also makes settings searchable. The token
  field is a `render` item, because the declarative `text` control cannot be
  masked.
- **License:** MIT.
- **Book records per catalogue:** `BookRecord` holds what the note, the
  record picker and messages read, whatever the catalogue (`catalogue`,
  `url`, `otherEditionIsbns`, …). Each catalogue extends it with what only
  its own path reads (`DnbRecord`: `idn`, `blurbUrl`, `otherEditionIdns`),
  and has its own source table and contract shape. The type is mapped from
  RDA codes in one place (`rdaBookType`), so both catalogues share it.
- **One User-Agent for the book hosts** (`BOOK_HOST_HEADERS` in
  `io/http.ts`), with the repository URL as contact; the TMDB hosts keep
  Obsidian's default.
- **JSON-LD without a library:** `id.loc.gov` serves expanded flat JSON-LD,
  so following `@id` links over a map of nodes is all the reading needs.
  Nodes are matched on full IRIs, not compacted names.
- **XML and HTML parsing** use the `DOMParser` built into Obsidian, no
  library. Tests run under jsdom.
- **Contract tests use `fetch`** through `tests/contract/node-http.ts`; the
  ESLint `fetch` ban is lifted for `tests/contract/` only. Production code
  still goes through `requestUrl`.
- **TMDB contract tests** skip themselves without `TMDB_READ_ACCESS_TOKEN`,
  except the 401 check, which needs no token.
- **README discloses network use:** a table of every host contacted and
  what it receives, and that there is no telemetry; the community plugin
  guidelines require disclosing network use and needed accounts. It also
  carries TMDB's attribution sentence ("This product uses the TMDB API but
  is not endorsed or certified by TMDB."), which TMDB's API terms require.
- **`docs/schema/` is excluded from Prettier**, see _Behaviour and schema_.

## Before publishing to the community list

- Re-check the plugin name and id against
  `https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json`.
- Run `npm run check`; the obsidianmd lint rules cover the review guidelines.
- Run `docs/MANUAL_TEST.md` on desktop and, if possible, on mobile. Mobile
  is untested so far.
- Replace the "not in the community plugin list yet" sentence in the
  README's installation section with the real installation path.
- Version: `manifest.json`, `package.json` and `versions.json` in step; the
  release tag is the bare version (no `v`), with `main.js` and
  `manifest.json` attached.
