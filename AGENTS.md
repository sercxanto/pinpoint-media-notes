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
  core/          pure logic, no `obsidian` import
    errors.ts      ConfigError (stop the import), EntryError (report, continue)
    text.ts        nfc, sanitizeFileName, noteStem
    frontmatter.ts yamlScalar, buildFrontmatter, buildNote
    paths.ts       vault-relative folder check for settings and imports
  io/
    http.ts        httpGet: the only caller of requestUrl (HttpGet type for fakes)
    vault.ts       VaultFiles interface and its implementation over app.vault
  book/          book importer
    input.ts       ISBN/IDN/link parsing, check digits
    marc.ts        SRU response → MARC records (DOMParser), NFC and marker stripping on read
    record.ts      MARC → BookRecord, BOOK_RECORD_SOURCES (field-coverage table), recordIsbn
    blurb.ts       blurb HTML → text, truncation
    note.ts        file stem with type suffix, note builder
    dnb.ts         SRU, blurb and cover requests (over HttpGet)
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
  fixtures/               recorded API responses
  contract/               live-API checks, only via `npm run test:contract`
    book-shape.ts           BOOK_RECORD_SHAPE: per-field shape checks, typed against BookRecord
    tmdb-shape.ts           TMDB_ENTRY_SHAPE: the same for TmdbEntry
    node-http.ts            HttpGet over fetch, because requestUrl exists only in Obsidian

Tests run under jsdom, because the book importer uses the `DOMParser` that
Obsidian provides.

scripts/install-to-vault.sh  copies main.js and manifest.json into a vault
docs/
  PLAN.md          phases and their notes
  MANUAL_TEST.md   checklist for the manual test in Obsidian
  specs/           the original specs (reference, do not edit)
README.md          user documentation
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

## Documentation

- `README.md` is the user documentation: settings, accepted input, note
  format with field mapping tables, file naming, covers, messages, network
  use. A change to behaviour the user sees (a setting, an accepted input, a
  property, a message category, a host contacted) updates it in the same
  phase. The golden examples in the README match the spec's example notes.
- The README does not explain what the properties mean; that belongs to the
  vault's _Book Template Conventions_ and _Movie Template Conventions_ notes
  (the specs say so), and the README points there.
- `docs/MANUAL_TEST.md` covers what the test suite cannot: the plugin
  inside Obsidian. Add an item when a change touches the settings tab, a
  modal, notices, `io/` or platform behaviour.

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
- **YAML quoting beyond the spec's list:** also quoted are values containing
  ` #` (starts a comment), a tab, ending in `:`, starting with `'`, the
  reserved words `y`, `n`, `~` (any case), and date-like values
  (`2021-05-01`). Backslashes are escaped inside quotes. Each of these would
  otherwise be misread or invalid YAML; none of them changes the spec's
  example notes, which are reproduced exactly in `tests/core/frontmatter.test.ts`.
- **All scalars are single-line**, not only `description`: line breaks become
  one space.
- **File names:** leading dots are stripped as well, because Obsidian ignores
  dotfiles. A title that sanitises to nothing is an `EntryError`.
- **Folder settings:** the vault root is not accepted as a notes or image
  folder; the spec requires a folder. An empty field is allowed while editing
  settings and is reported when an import starts.
- **Collision check** uses `vault.adapter.exists`, which asks the file system,
  so a case-insensitive file system reports a clash the vault index would miss.
- **XML and HTML parsing** use the `DOMParser` built into Obsidian, no
  library. Tests run under jsdom.
- **10 characters with a wrong ISBN-10 check digit** are rejected as a typo,
  not looked up as IDN: IDNs use the same check digit scheme, so such an input
  is neither.
- **Input extras:** a leading `ISBN`, `ISBN-10:` or `ISBN-13:` is ignored;
  `d-nb.info` links may carry extra path, query or fragment. `d-nb.info/gnd/…`
  (authority records) is rejected.
- **Collision check comes right after the lookup**, before the blurb request,
  so a skipped entry costs one request only.
- **Existing cover:** the extension comes from the response, so before any
  download the importer looks for `<stem>.<ext>` for every accepted image
  type (`jpg`, `png`, `gif`, `webp`, `avif`) and reuses the first one found.
  Other `image/*` types are reported as unsupported rather than guessed.
- **Blurb failure** (HTTP error, network) leaves `description` empty and is
  mentioned in the result; it does not skip the entry. Same for the cover.
- **Blurb host:** only `services.dnb.de` counts as the DNB's own
  `Inhaltstext` link; publishers' homepages carry the same label.
- **Year:** `264` with second indicator `1` (publication) first, then other
  `264`s (copyright, …), then `260`.
- **ISBN:** the first ISBN-13 in `020 $a`; a record with only an ISBN-10 gets
  it converted, because the cover service needs ISBN-13.
- **Series index:** the first number in `490 $v`, else `830 $v`; a decimal
  comma becomes a dot.
- **Authors** are de-duplicated (a name can appear in `100` and `700`).
- **Cover fallback stops early** when the cover server is blocked (bot check
  page, an HTTP status other than 404, network failure): asking for other
  editions would meet the same answer and only add load on a filtered host.
  A 404 or an unsupported image type moves on to the next candidate.
- **`776 $w`** is used only with the `(DE-101)` prefix (the DNB's own record
  numbers); a failed lookup of a linked record skips that candidate and is
  named in the result if no cover is found.
- **Record picker** lists every record, unsupported material included, so the
  user sees what the lookup returned; choosing such a record reports it as
  unsupported. Closing the picker skips the entry.
- **User-Agent for the DNB:** every DNB request sends
  `User-Agent: pinpoint-media-notes (Obsidian plugin)` (`DNB_HEADERS` in
  `dnb.ts`). The cover host's bot filter (Anubis) challenges every User-Agent
  containing `Mozilla`, which includes Obsidian's default, and lets clients
  that name themselves through, as it did the original script. Found in the
  first manual test (2026-09-29); a contract test watches the filter's rule.
- **Contract tests use `fetch`** through `tests/contract/node-http.ts`; the
  ESLint `fetch` ban is lifted for `tests/contract/` only. Production code
  still goes through `requestUrl`.
- **TMDB token storage:** plaintext in `data.json`, shown as a masked
  (password) field; chosen by the maintainer (2026-09-29) over Obsidian's
  `SecretStorage`, which would keep it out of `data.json` but has to be
  entered on every device. The field is a `render` item, because the
  declarative `text` control cannot be masked.
- **HTTP 401 from TMDB** is a `ConfigError`: no further entry can succeed,
  so the import modal closes. Every other TMDB failure is per entry.
- **API key instead of token:** a 32-character hex value in the token
  setting is rejected by the config check; it is the API key shown next to
  the token and does not work as a bearer token.
- **Token redaction:** `getJson` removes the token from any lower-level
  error message before it becomes an `EntryError`; own messages never contain
  it. The token is sent to `api.themoviedb.org` only, never to the image host.
- **Translation fallback** is triggered by an empty `overview` or a null
  `poster_path` (the spec's triggers) and then fills every field that is
  empty, keeping localised values. If the fallback request fails, the note is
  written with what the first answer had and the failure is mentioned; a 401
  still stops. The message names the fields taken from the default language.
- **TMDB collision check** comes after the details (and fallback), before
  `external_ids` and the poster: the file name may depend on the fallback.
- **`external_ids` failure** fails the entry (unlike blurb and cover): the
  IMDb id is identity data, and a retry is cheap.
- **Poster:** extension from `poster_path` (lower-cased), as the spec says;
  a `poster_path` that is not a plain `/<name>.<ext>` is not followed. The
  download must be HTTP 200 with `image/*`; otherwise the note is written
  without cover and the reason reported, as for DNB covers.
- **TMDB contract tests** skip themselves without `TMDB_READ_ACCESS_TOKEN`,
  except the 401 check, which needs no token.

- **README discloses network use:** a table of every host contacted and
  what it receives, and that there is no telemetry; the community plugin
  guidelines require disclosing network use and needed accounts. It also
  carries TMDB's attribution sentence ("This product uses the TMDB API but
  is not endorsed or certified by TMDB."), which TMDB's API terms require.

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
