# Specification: `book-import`

A handover document for implementing the script. It is not the user documentation — the repository README is written as part of the work, see *Deliverables*.

## Purpose

A command line tool that creates an Obsidian note for a printed book, an e-book or an audiobook from an ISBN, downloads the cover into the vault, and writes frontmatter matching the schema in *Book Template Conventions*.

It is the sibling of `tmdb-import` and shares its conventions, but not its input: films are picked by eye in a browser, books are identified by the ISBN printed in the copy at hand. The reasoning is in *Book Import Source Evaluation*.

## Context

- Repository: `obsidian-scripts`, packaged as the Python package `obsidian_scripts`. This one is the module `src/obsidian_scripts/book_import.py`, alongside `tmdb_import.py`, with its tests in `tests/book_import/`.
- Python 3.11 or later, standard library only at runtime. No third-party packages, and nothing imported from the sibling scripts. Invoked either directly as `python3 src/obsidian_scripts/book_import.py`, or as the command `book-import` after installing the package; both must work. Test-only packages are managed with uv.
- `tomllib` for configuration, `xml.etree.ElementTree` for MARC21, `html.parser` for the blurb. Frontmatter is written directly, not via a YAML library.
- No API key, no registration, no authentication anywhere in this script.
- The user runs it from a terminal on the machine that holds the vault.

## Non-goals

Do not implement these. They were considered and deliberately rejected.

- Searching the catalogue by title. Free-text search there is unreliable in ways that are hard to predict — `WOE=1%-Methode` returns 191 records, `WOE=Methode Clear` returns none — and the catalogue carries forthcoming editions, so a title search happily returns a paperback that does not exist yet.
- Importing `genres`. Catalogue subject data is unusable for this purpose: the record for *Die 1 % Methode* carries the GND headings *Lebensführung*, *Gewohnheit*, *Änderung*, *Erfolg*, the VLB code `2933: Taschenbuch / Sachbücher/Angewandte Psychologie`, the BISAC code `PSY000000`, and free keywords including *Rauchen* and *Abnehmen*. The property is written empty and filled by hand.
- Recording translator, narrator, publisher, page count or edition statement, all of which the source supplies.
- Updating an existing note.
- Deduplicating against notes already in the vault beyond the file name check.
- Prompting for `rating` or `shelf` during import.

## Command line behaviour

Interactive loop, matching `tmdb-import`:

1. Prompt for an ISBN or IDN.
2. An empty line, `q`, EOF (Ctrl-D) or Ctrl-C ends the run cleanly with exit code 0.
3. Otherwise process the entry, print a one-line result, and prompt again.

Errors on a single entry — unparseable input, no record found, HTTP failure, existing file — are reported and the loop continues. Only a configuration problem aborts, with exit code 1 and a message naming the config file path.

For each note print the path written, and for the cover either the ISBN it came from or that none was found. When the cover came from a different edition than the one being imported, say so — the user may want to replace it.

## Input parsing

Accept, after stripping spaces and hyphens:

| Input | Handling |
| --- | --- |
| 13 digits starting `978`/`979` | ISBN-13, used as is |
| 10 characters, last may be `X` | ISBN-10, converted to ISBN-13 |
| `https://d-nb.info/<idn>` | IDN extracted |
| 8–10 characters, digits with optional trailing `X` | IDN |

ISBN-10 is converted by dropping the check digit, prefixing `978` and recomputing the EAN-13 check digit. The conversion is required: the cover service rejects ISBN-10.

An ISBN-13 and an IDN of the same length cannot be confused, but a 10-character ISBN-10 and a 10-digit IDN can. Resolve in favour of the ISBN when the ISBN-10 check digit is valid, otherwise treat it as an IDN. Report which was assumed.

Validate the ISBN check digit and reject a bad one rather than querying with it — a typo otherwise returns "not found" and looks like a coverage gap.

## Catalogue lookup

SRU endpoint, no key:

```
https://services.dnb.de/sru/dnb
  ?version=1.1
  &operation=searchRetrieve
  &recordSchema=MARC21-xml
  &maximumRecords=10
  &query=NUM%3D<isbn>        (or IDN%3D<idn>)
```

The response wraps each `marc:record` inside an `srw:record`; both elements are named `record`. Select on the presence of a direct `leader` child, or the parse yields every record twice.

### More than one record

An ISBN lookup usually returns exactly one record, but not always: some publishers register the same ISBN for the printed book and the e-book, and the catalogue then holds both. When more than one record comes back, print them numbered with title, year and derived `type`, and let the user choose. Do not guess.

### Field mapping

| Property | MARC | Notes |
| --- | --- | --- |
| `title` | `245 $a` | subtitle in `$b` is **not** used |
| `original_title` | `240 $a`, else `title` | `240` is the uniform title and holds the original of a translation |
| `authors` | `100 $a`, then each `700 $a` | **only where `$4` is `aut`** |
| `year` | `264 $c`, else `260 $c` | first four-digit run |
| `isbn` | `020 $a` | the 13-digit one; records carry ISBN-10 in a second `020` |
| `series` | `490 $a`, else `830 $a` | |
| `series_index` | `490 $v`, else `830 $v` | strip any `Band `/`vol. ` prefix, keep the number |
| `type` | `336 $a` + `338 $a` | see below |
| `description` | blurb, see below | |
| `url` | `https://d-nb.info/<idn>` | `001` is the IDN |
| `cover` | see below | |
| `genres` | — | written as an empty list |

Filtering `700` on `$4 aut` is not optional. The record for *Die 1 % Methode* carries the translator in `700` with `$4 trl`; an unfiltered read credits her as a co-author. Audiobook records carry the narrator the same way, with `$4 nrt`.

### Deriving `type`

| `336 $a` | `338 $a` | `type` |
| --- | --- | --- |
| `gesprochenes Wort` | anything | `audiobook` |
| `Text` | `Band` | `book` |
| `Text` | `Online-Ressource` | `ebook` |

Any other combination is reported as unsupported and the entry is skipped; this covers sheet music, maps and film, which the catalogue also holds.

### Title cleanup

Titles carry the non-sorting markers `U+0098` and `U+009C` around a leading article, arriving as `&#152;Das&#156; Tor`. Strip both characters everywhere; do not strip the article itself.

### Unicode normalisation

Normalise all external text to NFC as it is read: every MARC subfield and the blurb. The catalogue delivers at least some records in NFD, with `ü` as `u` followed by `U+0308`, and an unnormalised title mixed with the script's own NFC constants — the ` - Hörbuch` suffix — produces a file name and link in two forms at once.

Obsidian resolves links and file paths in NFC, so a `cover` link containing decomposed text does not resolve, whatever form the file name on disk has. Linux compares file names byte for byte, so an NFC and an NFD name are two different files there. And Bases groups by exact value, so a decomposed `authors` or `series` value splits from the same value typed by hand.

Normalisation happens before the file name is sanitised and before the `cover` link is built, so `title`, the note's file name, the cover's file name and the link are guaranteed to share one form.

## Blurb

Take the `856` whose `$3` is `Inhaltstext` and fetch its `$u`, which has the form

```
https://services.dnb.de/plus/idn/<idn>/blurb/
```

It returns HTML without authentication. Strip tags, unescape entities, collapse all whitespace including newlines into single spaces.

Blurbs run long and are written as marketing copy — the *Känguru-Rebellion* blurb continues into several lines of dialogue. Truncate: keep whole sentences while the result stays under 500 characters, and if even the first sentence exceeds that, cut at the last word boundary before 500 and append `…`.

Leave `description` empty when the record has no `Inhaltstext` link. Do not fall back to the `Inhaltsverzeichnis` link in the neighbouring `856`, which is a scanned table of contents as PDF.

## Cover

```
https://portal.dnb.de/opac/mvb/cover?isbn=<isbn13>&size=l
```

Unhyphenated ISBN-13. `size=l` is 442×599 and is also the default. ISBN-10 is not accepted, which is why input conversion happens first.

**Validate the `Content-Type`, not the status code.** The host sits behind a proof-of-work bot filter. A plain command line client is currently let through, but a request that is challenged receives `HTTP 200` with `text/html` — a 4.5 KB page reading *"Dein Browser wird geprüft!"*. A downloader that trusts the status code writes that page into the vault as a JPEG. Treat any response whose `Content-Type` is not `image/*` as no cover, and say so in the printed result rather than failing silently, so a change in the filter's policy is visible immediately.

A missing cover answers with a clean `404`.

### Fallback to other editions

Roughly a third of editions have no cover of their own, e-books most often. The record links its siblings, so the fallback is exact rather than a title search:

1. This edition's own ISBN.
2. Each `776 $z` — an ISBN of another manifestation of the same work.
3. Each `776 $w` of the form `(DE-101)<idn>` — resolve that IDN through SRU and try its `020 $a`.

Take the first response that is an image. In the test sample this closed every gap. Record which ISBN supplied the cover and print it, because the artwork is not always identical across formats — an audiobook or an illustrated edition may differ.

Store the file under the note's own name, so two notes sharing one cover each keep a copy. Disk is cheap and a shared file would break when one note is deleted.

If a file of that name already exists, keep it and do not download again.

## Output

### File name

```
<title> (<year>).md                 type: book
<title> (<year>) - E-Book.md        type: ebook
<title> (<year>) - Hörbuch.md       type: audiobook
```

The suffix is unconditional, not a collision breaker. Editions of one title routinely share a year — the 2026 *Känguru-Rebellion* exists as hardback, e-book, audio CD and audio download — so the year alone does not disambiguate.

Remove the characters `* " \ / < > : | ? # ^ [ ]`, then collapse runs of whitespace and trim. The unmodified title stays in the `title` property.

If the target file already exists, report it and move on. Never overwrite, never append a counter.

### Note

Exact shape, property order significant — identity and origin first, then catalogue data, then the user's own fields:

```
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

`series` and `series_index` are written as empty properties for a standalone book, matching how `tmdb-import` writes `rating` and `last_finished`.

### YAML quoting

Frontmatter is written by hand, so quoting is the implementer's responsibility. The rules from the `tmdb-import` specification apply unchanged, with two additions:

- **`isbn` is always quoted.** It is a run of digits and would otherwise be read as a number, which both loses a leading zero-prefixed group and fixes the property as numeric for the whole vault. `year` and `series_index` stay unquoted, because those are numbers.
- `authors` is a block sequence, one `  - ` item per line, each quoted by the same scalar rules. The `Nachname, Vorname` form contains a comma, which is harmless outside flow context but must not tempt an implementation into emitting `[a, b]`.

`genres: []` is written as an empty flow sequence rather than an empty scalar, so the property's type is unambiguous the first time Obsidian sees it.

## Configuration

TOML, read from `$XDG_CONFIG_HOME/obsidian-scripts/book-import.toml`, falling back to `~/.config/obsidian-scripts/book-import.toml`. Create neither the file nor the directory; if it is missing, print the expected path and an example, and exit 1.

```toml
# Absolute path to the vault root
vault = "~/Notes"

# Both relative to the vault root
notes_dir = "Books"
assets_dir = "assets"

# s (90x122), m (200x272) or l (442x599)
cover_size = "l"
```

`notes_dir` and `assets_dir` must be vault-relative, because `cover` is a vault-relative wikilink while writing the file needs a filesystem path. Expand `~` in `vault`. Create `notes_dir` and `assets_dir` if absent.

Defaults: `assets_dir = "assets"`, `cover_size = "l"`. `vault` and `notes_dir` are required.

There is no token and no language setting. The catalogue is German by nature and returns German-language records for German editions; the language of a note follows from which edition was imported.

## Deliverables

- `src/obsidian_scripts/book_import.py`, with a `main()` that returns the exit code, registered as the `book-import` entry point in `pyproject.toml`.
- Offline tests in `tests/book_import/`, and a contract check against the live catalogue that runs only when switched on.
- A `book-import` section in the repository `README.md`: installation, the configuration file with its location and every key, how to run it, the field mapping table above, the file naming rules, and the `Content-Type` caveat on covers. This is the machine-side documentation.
- An example configuration file, `examples/book-import.example.toml`.

The meaning of the properties — what the `shelf` values stand for, why a note is an edition rather than a work, why `original_title` is stored even when identical to `title` — lives in the vault, in *Book Template Conventions*. Do not duplicate it in the README; refer to it.
