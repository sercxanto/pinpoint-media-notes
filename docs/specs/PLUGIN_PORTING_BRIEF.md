# Porting brief: obsidian-scripts → native Obsidian plugin

## Context

This is a from-scratch rewrite, in a new repository, of the Python project
`obsidian-scripts` (two standalone CLI scripts: `tmdb-import` and
`book-import`) as a native Obsidian plugin (TypeScript). The two scripts
create Obsidian notes with frontmatter and a cover/poster image, one from a
TMDB movie/series URL, the other from a book's ISBN via the Deutsche
Nationalbibliothek (DNB) catalogue.

The original repository's `CONTRIBUTING.md` explicitly lists "an installer or
a plugin" under things "considered and deliberately rejected" for *that*
project — its constraint is "standard library only, runs as a script or
installed CLI tool". That constraint does not apply here: this is a
deliberately separate, new project, free to use npm packages and the full
Obsidian Plugin API. Nothing in the old repository needs to change; this brief
just carries forward the *behavior* so the plugin has feature parity.

This document is self-contained — the agent working from it will not have
access to the original Python source, only this brief. Everything needed to
reproduce the behavior is below.

**Primary sources included alongside this brief**: `tmdb-import-spec.md` and
`book-import-spec.md` (the original handover specs the Python scripts were
built from). This brief distills and adapts them; those two files are the
authoritative reference for exact wire-level details (precise endpoint URLs,
header names, the full YAML-quoting-indicator list, the ISBN-10→13 checksum
algorithm) in case anything below is ambiguous or a corner case comes up that
isn't covered here. Read this brief first; drop into the specs for exact
byte-level behavior.

## Shared design (both importers, in the original)

- One pass per entry: parse input → fetch metadata → decide file name and
  bail out on collision *before* fetching the image → download image (or
  reuse an existing file of the same name) → write the note last.
  **Order matters**: collision check before any network cost is spent, and
  the note file is written only after the image step succeeds, so a failed
  run never leaves an orphaned image or a note without its image.
- **A note is never overwritten and no counter/suffix is appended to dodge a
  collision.** An existing file of the target name is reported and the entry
  is skipped. This is a deliberate product decision (a name clash is usually
  a *real* clash worth a human's attention, e.g. a remake with the same
  title+year), not an oversight — preserve it.
- An existing image file of the target name is left alone and not
  re-downloaded. Re-running the importer on the same entry is cheap and never
  clobbers an image the user replaced by hand.
- Two configured folders, both **vault-relative, never absolute, never
  containing `..`**: one for notes, one for images. They're used both as
  filesystem paths and inside the vault-relative wikilink written to the
  note's `cover` property, so a relative, clean path is a hard requirement,
  not a style choice.
- All external text (titles, descriptions, author names, etc.) is normalized
  to Unicode NFC on read. Both source APIs are known to sometimes return
  decomposed forms (e.g. `ü` as `u` + combining mark), which Obsidian does not
  resolve inside a `[[wikilink]]`, silently breaking the `cover` link.
- File name sanitization: strip the characters `* " \ / < > : | ? # ^ [ ]`
  from the title before using it in a file name (the first few are rejected
  outright by the filesystem/Obsidian, the rest break wikilinks), collapse
  whitespace runs, trim. The *unsanitized* title is still what's written into
  the `title` frontmatter property, so nothing is lost.
- Frontmatter property order is part of the contract, not incidental —
  whichever template/serialization approach is used, the property order below
  must be reproduced exactly, and two YAML typing rules are load-bearing:
  - a bare year (and, for books, `series_index`) is written **unquoted** so
    it round-trips as a number, not a string — quoting it would make the
    property text-typed for the whole vault and break numeric comparisons in
    Bases/Dataview.
  - `isbn` is always **quoted**, for the mirror-image reason: an unquoted run
    of digits would parse as a number and lose leading behavior/precision
    expectations.
  - Full quoting rule, since frontmatter is still built as a plain string
    here rather than via a YAML-writing library (to keep exact control over
    key order and intentionally-blank values): quote a scalar and escape
    inner `"` when the value contains a `"`, a `: ` (colon-space), a leading
    `#`, leading/trailing whitespace, or starts with a YAML indicator
    character (`- ? : , [ ] { } & * ! | > % @` or a backtick). Also quote
    anything that would otherwise parse as `true`, `false`, `null`, `yes`,
    `no`, `on`, `off`, or a number — except the intentionally-numeric `year`
    and `series_index`. `template` and `cover` always contain `[[...]]` and
    are always quoted. `description` is collapsed to a single line
    (newlines → spaces) rather than emitted as a YAML block scalar.
    `genres: []` (and `authors: []` when a book record names no author) is
    an empty flow sequence, not an empty scalar, so the property's list-type
    is unambiguous the first time Obsidian reads it.
- Never log, display (via `Notice`, console, or otherwise), or otherwise leak
  an API token/credential. This must hold even in error paths.
- Three-tier error handling translates directly to plugin UX:
  - a **fatal/config problem** (missing settings, bad auth) should stop
    before doing anything and surface a clear message naming what's missing —
    analogous to the scripts' `ConfigError`/`AuthError` which abort the whole
    run with exit 1.
  - a **per-entry problem** (bad input, no record found, a name collision, a
    failed request for *this* item) should be reported (e.g. via `Notice` or
    an inline log) and let the user continue with the next entry —
    analogous to `EntryError`. When in doubt, treat a failure as per-entry,
    not fatal: aborting an entire session because one input was a typo is
    poor UX when someone's working through a stack of entries.
- Keep network access behind as few, narrow functions as practical (the
  Python version funnels everything through one or two "seam" functions per
  script specifically so tests can mock exactly those and nothing else).
  Recommended: use Obsidian's `requestUrl` API (not `fetch`) for all HTTP
  calls — it runs outside the page's CORS/referrer restrictions the way the
  original scripts' unrestricted HTTP client did, which matters because both
  TMDB and the DNB endpoints are being called directly, not through a proxy.

## Platform translation notes (Python CLI → Obsidian plugin)

These aren't from the original project (which has no plugin concept) — they're
the natural mapping to make while porting:

- **Config → plugin settings.** Replace the TOML file with a normal Obsidian
  `PluginSettingTab`, persisted via `loadData()`/`saveData()`. Settings
  needed: TMDB Read Access Token, TMDB `language` (default `en-US`), TMDB
  `poster_size` (default `w500`), DNB `cover_size` (`s`/`m`/`l`, default `l`),
  and vault-relative `notes_dir`/`assets_dir` — either one shared pair or one
  pair per importer, whichever fits the plugin's settings UI better. Same
  trust boundary as the old TOML file: the token sits in plaintext in
  `data.json` under `.obsidian/plugins/<id>/`, which is the accepted norm for
  Obsidian plugins, but the "never print it" rule from above still applies.
- **stdin loop → a command + modal.** The original interactive loop ("paste a
  URL, get a note, prompt again, empty line/`q`/Ctrl-D/Ctrl-C to quit") maps
  to a command in the command palette that opens a small modal with a single
  text input; submitting imports one entry and can immediately reopen the
  modal for the next, or the user just re-triggers the command. No search
  UI — by design in the original (the user picks the exact TMDB entry or
  reads the ISBN off the physical copy), keep it that way rather than adding
  title search, which was deliberately rejected in the original scope.
- **stdout result lines → `Notice`.** Report success/failure per entry the
  same way the scripts print a result line per entry, including the reasons
  entries get skipped (collision, no cover found and why, ambiguous
  ISBN/IDN, unsupported material type, etc. — see below).
- **File I/O → Vault API.** Use `app.vault.create()` for the note (fails if
  the file exists — use that failure as the collision check, or check
  existence explicitly first since the check must happen *before* the image
  is downloaded), `app.vault.createBinary()` for the image, and
  `app.vault.createFolder()` for `notes_dir`/`assets_dir` if missing (guard
  against it throwing when the folder already exists).
- **Testing — carry this forward as a hard requirement, not a nice-to-have.**
  The original project treats the offline test suite as non-negotiable (it's
  rule #2 in its own contributing guide) and has a golden test that fails the
  build if the note format changes by accident. Reproduce that discipline
  here; don't let "it's just a plugin" become an excuse to skip it. Concretely:
  - **No standard-library-only constraint applies anymore** — pull in a real
    test runner (Jest or Vitest; Vitest is the lower-friction choice with
    esbuild/Vite-based plugin templates) and an assertion library as dev
    dependencies.
  - **Obsidian-specific wrinkle**: the `obsidian` npm package ships **type
    definitions only** (`obsidian.d.ts`), no runtime implementation — there is
    no official in-process fake for `App`/`Vault`/`Notice`/`requestUrl` to
    import into a test. The standard community pattern is a hand-written
    manual mock module (e.g. `__mocks__/obsidian.ts` for Jest, or a Vitest
    alias) implementing just the surface actually used (a fake `Vault` with an
    in-memory file map, a `Notice` that records what it was called with, a
    stubbed `requestUrl`). Keep that fake as small and explicit as the real
    usage, the same way the Python tests hand-roll `FakeHttp`.
  - **Mirror the "seam" discipline from the Python code**: isolate all calls
    to `requestUrl` behind one function per importer (or one shared one) and
    all calls to the Vault API behind a thin layer, so tests mock exactly
    those and nothing else — this is what let the original tests assert on
    the exact URL/query string built, not just "some request happened".
  - **Keep the core logic Obsidian-free where possible.** URL/ISBN parsing,
    MARC field mapping, TMDB field mapping, file-name sanitization, and
    frontmatter/note-string building are all pure functions of
    strings/objects in and a string out — they don't need the `obsidian`
    import at all and can be unit-tested with zero mocking, exactly like
    `build_entry`/`build_note`/`note_stem` in the Python version. Only the
    integration edges (settings tab, vault I/O, `requestUrl`, the modal UI)
    need the Obsidian mock.
  - **Reproduce the golden note-format test.** Have one test per importer
    that builds a complete note from a fixed fake API response and compares
    the *entire* string, character for character, against the exact template
    shown below — this is what caught accidental format drift in the
    original and should do the same job here.
  - **Reproduce the field-list "coverage" tests.** The Python suite has tests
    asserting that every field the script reads is also covered by a fixture
    and by the contract-check's type table, so a newly-read field can't be
    silently unverified. Whatever form fits TypeScript best (e.g. a
    `keyof Entry` check against the mapping table, or just a checklist test),
    keep the same spirit: it should be impossible to add a field to the
    mapping without also being forced to add a test for it.
  - **Live-API check stays separate and opt-in**, mirroring
    `test_api_contract.py`'s "shape, not content" philosophy — asserting a
    field exists and has the expected type, never asserting on text (a title,
    a blurb) that changes over time. Gate it behind an environment variable
    or an explicit npm script, never run it in the default test command.
- Standard Obsidian plugin scaffold (manifest.json, main.ts, esbuild build)
  applies; no need to reproduce the Python packaging (pyproject.toml, entry
  points) at all.

---

## Importer 1: tmdb-import (movies & series from TMDB)

### Purpose

Given a TMDB URL, create a note for the movie or series with a poster image
and frontmatter matching the vault's schema. It exists to replace the
"Media DB" community plugin, which can't set TMDB's `language` parameter
(so it returns English titles/posters only) and can't write constant fields
the API doesn't supply.

### Settings

| Setting | Required | Default | Meaning |
| --- | --- | --- | --- |
| TMDB Read Access Token | yes | — | Bearer token from TMDB account settings (the *long* value, not the short "API Key"). |
| `notes_dir` | yes | — | Vault-relative folder for notes. |
| `assets_dir` | no | `assets` | Vault-relative folder for posters. |
| `language` | no | `en-US` | TMDB locale, e.g. `de-DE`. |
| `poster_size` | no | `w500` | TMDB image size token, e.g. `w342`, `w500`, `original`. |

### Input parsing

Accept anything containing `themoviedb.org/movie/<id>` or
`themoviedb.org/tv/<id>` — with or without a slug, extra path segments, query
string, or fragment — and also a bare `movie/<id>` or `tv/<id>`. Examples that
must all parse to the same `(kind, id)`:

```
https://www.themoviedb.org/movie/800815-official-competition
https://www.themoviedb.org/movie/800815/cast?language=de#top
https://www.themoviedb.org/tv/1396/season/2
movie/800815
```

A bare number alone is refused — it doesn't disambiguate movie vs. series.

### Fetching

Base URL `https://api.themoviedb.org/3`. Every request carries:

```
Authorization: Bearer <token>
Accept: application/json
```

- Movie: one request, `GET /movie/{id}?language={language}` (bearer auth).
  The movie endpoint includes `imdb_id` directly.
- Series: **two** requests — `GET /tv/{id}?language={language}` for the main
  fields, and `GET /tv/{id}/external_ids` for `imdb_id`, because the `/tv/{id}`
  response does **not** include it. This asymmetry is the whole reason series
  cost an extra request; don't "optimize" it away.
- **Translation fallback**: TMDB doesn't reliably fall back to another
  language — an entry lacking a translation comes back with an empty
  `overview` or no poster in that language. When that happens, repeat the
  request *without* the `language` parameter and use the result to fill
  **only the fields that came back empty**; anything already obtained in the
  configured language is kept as-is. Net effect: a note may end up with a
  translated title but an English description/poster for an obscure title,
  never the reverse.

### Field mapping

| Property | Movie source | Series source |
| --- | --- | --- |
| `title` | `title` | `name` |
| `original_title` | `original_title` | `original_name` |
| `year` | year part of `release_date` | year part of `first_air_date` |
| `description` | `overview` | `overview` |
| `genres` | `genres[].name` | `genres[].name` |
| `imdb_id` | `imdb_id` | `external_ids.imdb_id` |
| `cover` (poster) | `poster_path` | `poster_path` |
| `url` | rebuilt as `https://www.themoviedb.org/movie/<id>` | rebuilt as `https://www.themoviedb.org/tv/<id>` |

`url` is always rebuilt from the id, never copied from the pasted URL (which
may carry a slug/query string). If a date field is missing/malformed, leave
`year` empty rather than failing the whole entry.

### Note template (exact property order — treat as a golden format)

```yaml
---
template: "[[Movie Template]]"
type: movie
title: Der beste Film aller Zeiten
original_title: Competencia oficial
url: https://www.themoviedb.org/movie/800815
imdb_id: tt8740768
year: 2021
genres:
  - Komödie
  - Drama
description: Eine exzentrische Regisseurin bringt zwei rivalisierende Schauspieler zusammen.
cover: "[[assets/Der beste Film aller Zeiten (2021).jpg]]"
rating:
last_finished:
shelf: unsorted
tags:
  - movies
---

## Notes
```

`type` is `movie` or `series` — that's the only thing distinguishing the two,
they otherwise share one template and one tag. `rating`, `last_finished` are
always written empty and `shelf` is always `unsorted`: together these mark
the note as "not yet reviewed by the user" — filled in later, inside
Obsidian, never by the importer. What the properties actually *mean* is
vault-specific documentation (a note called "Movie Template Conventions" in
the original vault) — not needed to port the mechanics, just don't invent new
meanings for them.

### File naming

`<title> (<year>).md` in `notes_dir`, using the *localized* title (after
sanitization, see shared rules above). If year is unknown, name the file
after the title alone. Collision → report and skip, per the shared rule
above (never overwrite, never append a counter).

### Poster

Image URL: `https://image.tmdb.org/t/p/{poster_size}{poster_path}` (note
`poster_path` already starts with `/`). Download to `assets_dir` as `<same
base name as the note>.<original extension>`. Skip the download if a file
with that name already exists.
`cover` frontmatter is a vault-relative wikilink to it, e.g.
`[[assets/Der beste Film aller Zeiten (2021).jpg]]`. If TMDB has no poster in
either the configured or the fallback language, leave `cover` empty.

### Explicit non-goals (carried over on purpose)

- No search-by-title UI. The user picks the exact entry in a browser (poster,
  year, and plot compared by eye) and pastes its URL.
- No updating an existing note from TMDB.
- No per-season notes for series — one note per series, seasons untracked.
- No prompting for `rating`/`shelf` during import.

---

## Importer 2: book-import (books/e-books/audiobooks from ISBN)

### Purpose

Given an ISBN (or DNB record number), create a note for a printed book,
e-book, or audiobook, with a cover image and frontmatter matching the vault's
schema. Data source: the Deutsche Nationalbibliothek (DNB) catalogue — public,
no account/key/registration needed. Sibling of tmdb-import, same shape,
different source.

### Settings

| Setting | Required | Default | Meaning |
| --- | --- | --- | --- |
| `notes_dir` | yes | — | Vault-relative folder for notes. |
| `assets_dir` | no | `assets` | Vault-relative folder for covers. |
| `cover_size` | no | `l` | `s` (90×122), `m` (200×272), or `l` (442×599). |

No token, no language setting — the catalogue is German by nature; whichever
edition the ISBN names determines the note's language.

### Input parsing

Strip spaces and hyphens first, then classify:

| Input shape | Handling |
| --- | --- |
| 13 digits starting `978`/`979` | ISBN-13, used as-is |
| 10 characters, last may be `X` | ISBN-10 → converted to ISBN-13 |
| `https://d-nb.info/<idn>` | extract the DNB record number (IDN) |
| 8–10 chars, digits + optional trailing `X` | IDN |

ISBN-10 → ISBN-13 conversion (required — the cover service rejects ISBN-10):
drop the ISBN-10 check digit, prefix `978`, recompute the EAN-13 check digit
over the resulting 12 digits.

Reject an ISBN with a wrong check digit *before* any lookup, so a typo reads
as a typo, not as "not in the catalogue".

**Ambiguous case**: a bare 10-character input could be ISBN-10 or IDN — the
check digit scheme can't tell them apart (every real IDN also passes as a
valid ISBN-10). Resolution order: try it as an ISBN-13 lookup first; if no
record matches, retry as an IDN. Report to the user which interpretation was
used. Pasting the full `d-nb.info/<idn>` URL sidesteps the guess entirely.

### Lookup

SRU endpoint, no key:

```
https://services.dnb.de/sru/dnb
  ?version=1.1
  &operation=searchRetrieve
  &recordSchema=MARC21-xml
  &maximumRecords=10
  &query=NUM%3D<isbn>        (or IDN%3D<idn> for the IDN case)
```

Returns MARC21 XML records. Field references below are `<field> $<subfield>`,
e.g. `245 $a` = subfield `a` of field `245`. **Parsing gotcha**: the response
wraps each `marc:record` inside an `srw:record` — both elements are named
plain `record` once namespaces are stripped/ignored, so a naive recursive
search finds every record twice. Select only records that have a direct
`leader` child.

**Multiple matches**: some publishers register one ISBN for both the print
and e-book edition, so a lookup can return more than one record. List them
(title, year, type, ISBN) and ask the user which one is meant; an empty
answer skips the entry — do not guess.

### Field mapping

| Property | MARC source | Notes |
| --- | --- | --- |
| `title` | `245 $a` | subtitle in `$b` is not used |
| `original_title` | `240 $a`, else `title` | `240` = uniform title, i.e. the work's original title for a translation |
| `authors` | `100 $a`, then each `700 $a` | **only** where the paired `$4` role code is `aut` — this is mandatory filtering, not optional cleanup: the same fields also carry translators (`trl`), narrators (`nrt`), editors (`edt`), illustrators (`ill`), and for audio, the reading artist (`art`) |
| `url` | `https://d-nb.info/<idn>` | IDN comes from field `001` |
| `isbn` | `020 $a` | the 13-digit one; a second `020` may carry the ISBN-10, ignore it |
| `year` | `264 $c`, else `260 $c` | first 4-digit run found; publication statement preferred over a copyright date |
| `series` | `490 $a`, else `830 $a` | |
| `series_index` | `490 $v`, else `830 $v` | number only — "Band 5" → `5`; a volume with no number is left empty |
| `type` | `336 $a` + `338 $a` | see table below |
| `description` | via the blurb link, see below | |
| `cover` | via the cover service, see below | |
| `genres` | — | always written as `[]` — catalogue subject headings don't map to vault genres, filled by hand |

Titles arrive with non-sorting markers around a leading article — the raw
characters (or their numeric entity form `&#152;`/`&#156;`) around e.g.
`Die` in `„Die" 1 % Methode`. Strip the markers, keep the article.

### Type

| `336 $a` (content) | `338 $a` (carrier) | `type` |
| --- | --- | --- |
| `gesprochenes Wort` | (any) | `audiobook` |
| `Text` | `Band` | `book` |
| `Text` | `Online-Ressource` | `ebook` |

Anything else (sheet music, maps, film, etc. — the catalogue holds those too)
is unsupported: report and skip the entry.

### Description (blurb)

The catalogue links to the blurb rather than embedding it: an `856` field
labeled `Inhaltstext` points at
`https://services.dnb.de/plus/idn/<idn>/blurb/`, returning HTML. Strip tags,
unescape entities, collapse all whitespace to single spaces. Truncate: keep
whole sentences while staying under 500 characters; if even the first
sentence exceeds that, cut at a word boundary and append `…`. Leave
`description` empty if there's no blurb link. Only follow the DNB's own
`Inhaltstext` link — some publishers register their homepage under the same
label, don't use that. Never use the neighboring `Inhaltsverzeichnis` link
(a scanned table-of-contents PDF).

### File naming

`<title> (<year>)` plus a **type suffix that is always present**, not just on
collision (editions of the same title routinely share a year, so the year
alone doesn't disambiguate them):

```
<title> (<year>).md                type: book
<title> (<year>) - E-Book.md       type: ebook
<title> (<year>) - Hörbuch.md      type: audiobook
```

Same character-stripping/whitespace rules as tmdb-import. Unknown year →
title alone, suffix still applied. Collision → report and skip, before
anything is downloaded (same shared rule as above).

### Cover

Fetch from
`https://portal.dnb.de/opac/mvb/cover?isbn=<isbn13>&size=<cover_size>`, save
to `assets_dir` under the note's base name, extension taken from the
response's `Content-Type` (usually `.jpg`). Skip if a file of that name
already exists.

About a third of editions (mostly e-books) have no cover of their own. Try,
in order, until one image is found:

1. the edition's own ISBN,
2. each ISBN listed in `776 $z` (sibling editions of the same work),
3. each DNB record linked in `776 $w`, of the form `(DE-101)<idn>` — resolve
   that IDN through another SRU lookup and try *its* `020 $a`.

Report which ISBN actually supplied the image, and flag it when it wasn't
the edition's own (an audiobook or illustrated edition may carry different
cover art the user may want to swap out by hand). Two notes sharing a source
cover still each get their **own copy of the file** — never a shared/linked
file, since deleting one note shouldn't break the other's cover.

**Critical gotcha, must be preserved**: the cover host sits behind a
proof-of-work bot filter. A request that gets challenged responds with
**HTTP 200 and an HTML page** ("Dein Browser wird geprüft!"), not an HTTP
error. Decide whether a response is a real cover **by checking the
`Content-Type` header is `image/*`**, never by the HTTP status code. Treat
anything else as "no cover found" and say so in the per-entry result message
(e.g. "no cover: the cover server answered with text/html instead of an
image, probably its bot check"). If this starts happening for every book,
the filter's behavior changed upstream — the note should still be written,
with `cover` left empty, not treated as a fatal error.

If no candidate ISBN/record has a cover, leave `cover` empty.

### Note template (exact property order — treat as a golden format)

```yaml
---
template: "[[Book Template]]"
type: book
title: Die 1 % Methode
original_title: Atomic habits
authors:
  - Clear, James
url: https://d-nb.info/1198618736
isbn: "9783442178582"
year: 2020
series:
series_index:
genres: []
description: Das Standardwerk über Gewohnheiten. Wer seine Gewohnheiten ändert, ändert sein Leben.
cover: "[[assets/Die 1 % Methode (2020).jpg]]"
rating:
last_finished:
shelf: unsorted
tags:
  - books
---

## Notes
```

`type` distinguishes `book` / `ebook` / `audiobook`, otherwise one shared
template and tag. Same "always empty `rating`/`last_finished`, always
`unsorted` `shelf`" convention as tmdb-import — marks "not yet reviewed",
filled in later by hand. `authors` is written as `[]` (not omitted) when the
record names no author, same reasoning as `genres: []` — make the property's
list-type unambiguous from the very first write rather than leaving it null.

### Explicit non-goals (carried over on purpose)

- No search-by-title UI — the catalogue's free-text search is unpredictable
  and surfaces not-yet-published editions; the ISBN on the physical copy
  names exactly one edition.
- No updating an existing note from the catalogue.
- No importing `genres` from the catalogue's subject headings.
- No recording translator, narrator, publisher, page count, or edition
  statement, even though the catalogue has them.
- No prompting for `rating`/`shelf` during import.

---

## Suggested order of work in the new repo

1. Scaffold the plugin (manifest, esbuild, settings tab skeleton) **and the
   test runner in the same step** (Jest or Vitest, plus the minimal
   `obsidian` mock module) — don't defer testing to "later," there is no
   later in this project's own history of that going well.
2. Port `book-import` first — no auth to configure, so it's usable and
   testable sooner. Get parsing → MARC mapping → note template → file naming
   solid with offline unit tests (mock the one network seam) before touching
   the cover-fallback chain and the bot-check `Content-Type` handling, which
   is the trickiest part.
3. Port `tmdb-import` — same shape, plus the token setting and the
   two-requests-for-series / translation-fallback logic.
4. Only then consider UX polish (batch import, a picker instead of pasting
   raw input, etc.) — none of that was in scope for the original scripts and
   should be a deliberate new decision, not scope creep while porting.
