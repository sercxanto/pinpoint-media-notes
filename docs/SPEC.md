# Pinpoint Media Notes: specification

This document describes what the plugin does and why. It is the authority on
behaviour: a change to the plugin's behaviour updates this file in the same
change, and a statement here that the code does not match is a bug in one of
the two.

What the properties _mean_ (what a `shelf` value stands for, why a book note
describes an edition, which genre values are allowed) is not specified here.
That lives in the vault notes under [`docs/schema/`](schema/), which this
plugin writes to. `README.md` is the user documentation and is derived from
this file.

## Contents

- [Purpose and scope](#purpose-and-scope)
- [Settings](#settings)
- [Commands and interaction](#commands-and-interaction)
- [Processing one entry](#processing-one-entry)
- [File names](#file-names)
- [Frontmatter](#frontmatter)
- [Network](#network)
- [Book import](#book-import)
- [Movie and series import](#movie-and-series-import)
- [Messages](#messages)

## Purpose and scope

The plugin creates one Obsidian note per entry, with a local copy of the
cover image and a fixed frontmatter schema, from an exact identifier:

- **Books**, e-books and audiobooks from an ISBN or a DNB record number, using
  the catalogue of the Deutsche Nationalbibliothek (DNB). Why the DNB is the
  source is set out in [`book-source-evaluation.md`](book-source-evaluation.md).
- **Movies and series** from a TMDB link, using the TMDB API in a configured
  language.

The identifier is chosen outside the plugin, on purpose. A film is picked on
the TMDB website, where poster, year and plot can be compared by eye; a book
is identified by the ISBN printed in the copy at hand, which names exactly one
edition. A title search would reintroduce the one step a program gets wrong.

### Non-goals

Considered and rejected. Do not add them.

- Search by title, in either importer. DNB free-text search is unpredictable
  and returns forthcoming editions; TMDB matches need human judgement.
- Updating an existing note from the source.
- One note per season of a series.
- Importing genres from the DNB. Catalogue subject data (GND headings, VLB and
  BISAC codes, free keywords) does not map to the vault's genre vocabulary,
  which also requires a fiction/non-fiction form value no catalogue field
  expresses.
- Recording translator, narrator, publisher, page count or edition statement.
- Asking for `rating`, `last_finished` or `shelf` during the import. They are
  filled in later, in Obsidian.
- Deduplicating against existing notes beyond the file name check.

## Settings

Stored with Obsidian's `loadData`/`saveData` in the plugin's `data.json`.
Missing keys take their default.

| Key            | Setting name                  | Default  | Rule                                                        |
| -------------- | ----------------------------- | -------- | ----------------------------------------------------------- |
| `assetsDir`    | Image folder                  | `assets` | vault folder; shared by both importers                      |
| `bookNotesDir` | Book notes folder             | empty    | vault folder; required for the book import                  |
| `coverSize`    | Cover size                    | `l`      | `s` (90×122), `m` (200×272) or `l` (442×599)                |
| `tmdbNotesDir` | Movie and series notes folder | empty    | vault folder; required for the movie and series import      |
| `tmdbToken`    | TMDB read access token        | empty    | required for the movie and series import; see below         |
| `tmdbLanguage` | Language                      | `en-US`  | TMDB locale, not empty                                      |
| `posterSize`   | Poster size                   | `w500`   | `w92`, `w154`, `w185`, `w342`, `w500`, `w780` or `original` |

The settings tab uses the declarative settings API (Obsidian 1.13), in three
groups: Images, Books, Movies and series.

**Vault folders.** Backslashes become slashes; `.` segments, doubled and
trailing slashes are dropped. Rejected: an absolute path (leading `/`, `~` or
a drive letter), any `..` segment, and the vault root itself. A folder is used
both as a vault path and inside the vault-relative `cover` wikilink, which is
why it must be relative. An empty field is accepted while editing, because an
importer may be unused, and reported when that importer is started. Missing
folders are created on the first import.

**Token.** The long API read access token, sent as a bearer token. A
32-character hex value is rejected: it is the API key shown next to the token
in TMDB's account settings, easily copied instead, and does not work as a
bearer token. The token is stored in plain text in `data.json` and shown in a
masked field. Obsidian's `SecretStorage` would keep it out of `data.json` but
has to be entered on every device; the maintainer chose plain text so the
token syncs with the vault. The token is never shown or logged, error paths
included.

## Commands and interaction

Two commands: **Import book** (`import-book`) and **Import movie or series**
(`import-movie-or-series`). The command names name no input format, because
the sentence-case lint rule for Obsidian plugins rejects "ISBN".

A command first checks the settings its importer needs. A problem is shown as
a notice naming the setting, and no window opens.

Otherwise a window with one text field and an **Import** button opens. Enter
or the button imports one entry; the field is disabled while it runs. After
the entry:

| Outcome                     | Window                                       |
| --------------------------- | -------------------------------------------- |
| success                     | stays open, field cleared for the next entry |
| per-entry error             | stays open, input kept for correcting it     |
| configuration error (a 401) | closes                                       |

Every entry ends with a notice of ten seconds; result messages run to several
sentences. Closing the window ends the session.

## Processing one entry

Both importers follow the same order. It is deliberate:

1. Parse the input.
2. Fetch the metadata.
3. Compute the file name and check for a collision, **before** any image is
   requested, so a skipped entry costs as little as possible.
4. Fetch further text (book blurb, series IMDb id).
5. Provide the image: reuse an existing file of the target name, or download.
6. Write the note **last**, so a failed run never leaves a note without its
   image.

**Never overwrite a note, never append a counter.** If the target note exists,
the entry is skipped with a message. A name clash is usually real (a remake
with the same title and year, a book already imported) and the user decides.
The check asks the file system (`vault.adapter.exists`), not the vault index,
so a case-insensitive file system reports a clash the index would miss.

**Never re-download an existing image** of the target name. A user who
replaced a cover by hand keeps it, and re-importing an entry is cheap.

**Every note gets its own image file**, named like the note, even when two
notes use the same picture. Deleting one note must not break another's cover.

### Errors

| Kind           | Examples                                                                                | Effect                                      |
| -------------- | --------------------------------------------------------------------------------------- | ------------------------------------------- |
| Configuration  | folder not set or invalid, no token, API key instead of token, TMDB 401                 | import does not start, or the window closes |
| Per entry      | unparseable input, typo, nothing found, name clash, unsupported material, failed lookup | entry skipped, user continues               |
| Partial result | no blurb, no cover, no poster, translation fallback failed                              | note written without it, reason reported    |

When in doubt, a problem is per entry. A failure to write the note or to save
a downloaded image is per entry.

### Unicode

All external text is normalised to NFC as it is read, before sanitising and
before the `cover` link is built. Both sources sometimes deliver decomposed
forms (`ü` as `u` plus a combining mark), which Obsidian does not resolve
inside a wikilink.

## File names

The note and its image share a stem:

```
<title> (<year>)<suffix>
<title><suffix>             when the year is unknown
```

The suffix is empty except for e-books and audiobooks (see
[Book file names](#book-file-names)). The title is sanitised:

- remove `* " \ / < > : | ? # ^ [ ]`: the first set is rejected by file
  systems or Obsidian, the rest break wikilinks,
- collapse runs of whitespace into one space, trim,
- strip leading dots, because Obsidian ignores files starting with a dot.

A title that sanitises to nothing is a per-entry error. The unmodified title
goes into the `title` property.

Notes go to `<notes folder>/<stem>.md`, images to
`<image folder>/<stem>.<extension>`.

## Frontmatter

Built as a string, not with a YAML library, for exact control over key order,
over which values are numbers and over blank properties. The property order
is a golden format and fixed per importer (see the note formats below).

| Value           | Written as                                      |
| --------------- | ----------------------------------------------- |
| absent or empty | `key:` (a blank property, not left out)         |
| number          | unquoted, so Obsidian types it as a number      |
| string          | plain scalar, double-quoted only when necessary |
| list            | block sequence, one `  - item` per line         |
| empty list      | `key: []`                                       |

Blank properties keep every note's property set identical; `rating` and
`last_finished` are blank on purpose, as a reminder for the review pass.
`genres: []` and an empty `authors: []` are flow sequences so the property
type is unambiguous the first time Obsidian sees it.

**Numbers.** `year` and `series_index` are numbers. A quoted year would fix
the property as text for the whole vault, because Obsidian keeps one type per
property name, and break numeric comparisons in Bases.

**Quoting.** Every scalar is first made single-line: line breaks and the
whitespace around them become one space. It is then double-quoted, with `\`
and `"` escaped, when it

- contains `"`, `: `, ` #` or a tab,
- ends with `:`,
- has leading or trailing whitespace,
- starts with one of ``- ? : , [ ] { } & * ! | > ' " % @ ` #``,
- is, in any case, `true`, `false`, `null`, `yes`, `no`, `on`, `off`, `y`,
  `n` or `~`,
- looks like a number (integer, float, exponent, hex `0x`, octal `0o`,
  `.inf`, `.nan`),
- starts like a date (`2021-05-01`).

Each of these would otherwise be misread or invalid YAML. As consequences:
`template` and `cover` (`[[…]]`) are always quoted, and so is `isbn` (all
digits), which keeps that property text for the whole vault.

The body after the frontmatter is a blank line and an empty `## Notes`
heading.

## Network

All HTTP goes through Obsidian's `requestUrl`, never `fetch`: it is not
subject to CORS, and both APIs are called directly. Requests are sent one
after the other, never in parallel, and only while an entry is imported.

| Host                 | Used for                       | Sends                          |
| -------------------- | ------------------------------ | ------------------------------ |
| `services.dnb.de`    | catalogue lookup (SRU), blurbs | ISBN or record number          |
| `portal.dnb.de`      | book covers                    | ISBN                           |
| `api.themoviedb.org` | movie and series details       | TMDB id, the token             |
| `image.tmdb.org`     | posters                        | poster path, **not** the token |

There is no telemetry and no other network access.

**User-Agent for the DNB.** Every DNB request sends
`User-Agent: pinpoint-media-notes (Obsidian plugin)`. The cover host sits
behind a proof-of-work bot filter (Anubis) that challenges every User-Agent
containing `Mozilla`, which includes Obsidian's default, and lets clients that
name themselves through. A contract test watches this rule.

## Book import

### Input

After removing invisible format characters (Unicode category Cf) and
trimming:

| Input                                              | Read as                                                  |
| -------------------------------------------------- | -------------------------------------------------------- |
| `d-nb.info/<idn>` link, `http(s)://` optional      | record number; extra path, query or fragment are ignored |
| 13 digits                                          | ISBN-13                                                  |
| 10 characters, digits with optional final `X`      | ISBN-10 or record number, see below                      |
| 8 to 10 characters, digits with optional final `X` | record number                                            |

Before the ISBN rules apply, a leading `ISBN`, `ISBN-10` or `ISBN-13` (with
optional `:`, spaces allowed before it), spaces and hyphens are removed, and
letters are upper-cased.

Format characters are removed because copying from a web page brings them
along unseen: Amazon puts a left-to-right mark (U+200E) before the ISBN, and
a right-to-left and a left-to-right mark around the colon of its
`ISBN-13 : 978-…` line. Kept, they make a correct ISBN look
like a typo.
Links are matched before hyphens are removed. `d-nb.info/gnd/…` (authority
records) is rejected.

- An ISBN-13 must start with `978` or `979` and have a valid EAN-13 check
  digit.
- A wrong check digit is rejected as a typo before anything is looked up;
  otherwise a typo would come back as "not found" and look like a gap in the
  catalogue.
- **Ten characters are ambiguous.** Record numbers use the same check digit
  scheme as ISBN-10, so every real 10-digit record number also passes the
  ISBN-10 test and the check digit cannot decide. The input is looked up as
  ISBN (converted to ISBN-13) first and, if that finds nothing, as record
  number; the message says which reading was used. Ten characters with an
  invalid check digit are neither and rejected. A `d-nb.info` link avoids the
  guess.
- ISBN-10 to ISBN-13: drop the check digit, prefix `978`, compute the EAN-13
  check digit. The cover service accepts ISBN-13 only.

### Catalogue lookup

```
https://services.dnb.de/sru/dnb?version=1.1&operation=searchRetrieve
  &recordSchema=MARC21-xml&maximumRecords=10&query=NUM%3D<isbn>
```

`NUM=<isbn>` for an ISBN, `IDN=<idn>` for a record number. No key, no
account. An ISBN lookup avoids the catalogue's free-text search, which is
unreliable, and its forthcoming editions.

The response wraps each `marc:record` in an `srw:record`; both have the local
name `record`, so only elements with a direct `leader` child count as MARC
records. Every value is read NFC-normalised, with the non-sorting markers
`U+0098` and `U+009C` (also as `&#152;`/`&#156;`) removed and trimmed; the
markers surround a leading article, which itself is kept. XML is parsed with
the `DOMParser` Obsidian provides.

Per entry errors: HTTP status other than 200, network failure, invalid XML, an
SRU diagnostic (its message is shown), no record, a record without record
number (`001`) or title.

### Several records

Some publishers register one ISBN for both print and e-book, and the catalogue
then returns several records. The plugin never guesses: a window lists every
record with title, year, type, ISBN and `https://d-nb.info/<idn>`, unsupported
material included so the user sees what came back. **Import** picks one;
choosing unsupported material reports it as unsupported. Closing the window
skips the entry.

### Field mapping

| Property         | Source                                                                        |
| ---------------- | ----------------------------------------------------------------------------- |
| `type`           | `336 $a` and `338 $a`, see [Type](#type)                                      |
| `title`          | `245 $a`; the subtitle in `$b` is not used                                    |
| `original_title` | `240 $a` (uniform title, the original of a translation), else `title`         |
| `authors`        | `100 $a`, then `700 $a`, only fields whose `$4` contains `aut`; de-duplicated |
| `url`            | `https://d-nb.info/<idn>`, `<idn>` from `001`                                 |
| `isbn`           | see below                                                                     |
| `year`           | see below                                                                     |
| `series`         | `490 $a`, else `830 $a`                                                       |
| `series_index`   | first number in `490 $v`, else `830 $v`; a decimal comma becomes a dot        |
| `genres`         | always `[]`, filled in by hand                                                |
| `description`    | the blurb, see [Description](#description)                                    |
| `cover`          | see [Cover](#cover)                                                           |

Details:

- **Authors.** Translators (`trl`), narrators (`nrt`), editors and illustrators
  carry their own relator code in `$4`; an unfiltered read would credit them
  as co-authors. Names are kept in the catalogue's `Surname, Given name` form.
  A name in both `100` and `700` appears once. No author gives `authors: []`.
- **ISBN.** Across all `020 $a`, after removing spaces and hyphens: the first
  run of 13 digits starting with `978`/`979`. Records hold several `020`
  fields (ISBN-10, ISBN-13, with price or binding text appended), so it is the
  first matching run, not the field value. A record with only an ISBN-10 gets
  it converted. Digits only, no hyphens.
- **Year.** The first four-digit run in `$c` of: `264` with second indicator
  `1` (publication), then any other `264` (copyright and others), then `260`.
  Values arrive as `2020`, `[2024]`, `[2022?]`, `Mai 2020`, `© 2017` or
  `P 2006`. It is the year of this edition, not of the work.

### Type

| `336 $a` contains   | `338 $a` (first match) | `type`      |
| ------------------- | ---------------------- | ----------- |
| `gesprochenes Wort` | anything               | `audiobook` |
| `Text`              | `Band`                 | `book`      |
| `Text`              | `Online-Ressource`     | `ebook`     |

Any other combination (sheet music, maps, film, …) is unsupported material
and the entry is skipped, naming the catalogued content and carrier type.

### Description

The blurb comes from the DNB's blurb service. A record may carry several `856`
fields with `$3 Inhaltstext`, and publishers register their homepage under the
same label; only a `$u` on the host `services.dnb.de` (http or https) is used.
The neighbouring `Inhaltsverzeichnis` link is a scanned table of contents and
is never used. Without such a link, `description` stays empty.

The page is HTML. Script, style and head are dropped; block elements (`br`,
`p`, `div`, list items, headings, table cells, `blockquote`) separate words,
inline elements do not; entities are decoded; all whitespace collapses into
single spaces.

Truncation, because blurbs are long marketing copy: a text under 500
characters is kept whole. Otherwise whole sentences are kept while the result
stays under 500 characters; a sentence ends with `.`, `!`, `?` or `…`,
optionally followed by closing quotes or brackets, then whitespace or the
end. If even the first sentence is too long, the text is cut at the last space
before 500 characters, trailing punctuation removed, and `…` appended.

A failed blurb request (network, HTTP status other than 200) leaves
`description` empty and is reported; the note is still written.

### Cover

```
https://portal.dnb.de/opac/mvb/cover?isbn=<isbn13>&size=<s|m|l>
```

The DNB portal proxies the cover service of the MVB, the German book trade's
metadata agency.

**The `Content-Type` decides, not the HTTP status.** A request the bot filter
challenges gets HTTP 200 with an HTML page; a downloader that trusts the
status would save that page as a JPEG. Each response is one of:

| Response                                            | Result                                               |
| --------------------------------------------------- | ---------------------------------------------------- |
| `image/jpeg`, `pjpeg`, `png`, `gif`, `webp`, `avif` | cover, extension `jpg`, `png`, `gif`, `webp`, `avif` |
| other `image/*`                                     | missing (unsupported type), try next                 |
| HTTP 404                                            | missing, try next                                    |
| HTTP 200 with `text/html`                           | blocked: probably the bot check                      |
| any other status or type, network failure           | blocked                                              |

**Fallback to other editions.** About a third of editions, mostly e-books,
have no cover of their own, while another edition of the same work usually
has one. Candidates, each ISBN tried once, in this order:

1. the edition's own ISBN,
2. each `776 $z`, an ISBN of another edition, converted to ISBN-13 if needed,
3. each `776 $w` of the form `(DE-101)<idn>`: that record is looked up by
   record number and its ISBN tried. Other prefixes name other libraries'
   numbers and are ignored, as is a link back to the record itself. Linked
   records are looked up only when the earlier candidates are used up; a
   failed lookup skips the candidate and is named in the message if no cover
   is found.

The first image wins. **The chain stops at the first "blocked"**: asking for
other ISBNs would meet the same answer and only add load on a filtered host.
The message names the ISBN the cover came from and, for another edition, says
that its artwork may differ (audiobooks and illustrated editions often do).

**Existing file.** The extension is only known from the response, so before
any request the importer looks for `<stem>.<ext>` for each accepted extension
and keeps the first one found.

### Book file names

| `type`      | Stem                         |
| ----------- | ---------------------------- |
| `book`      | `<title> (<year>)`           |
| `ebook`     | `<title> (<year>) - E-Book`  |
| `audiobook` | `<title> (<year>) - Hörbuch` |

The suffix is unconditional, not a collision breaker: editions of one title
routinely share a year.

### Book note

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

`cover` is blank when no image was found.

## Movie and series import

### Input

A TMDB link: anything containing `themoviedb.org/movie/<id>` or
`themoviedb.org/tv/<id>`, case-insensitive, with or without slug, further path
(`/cast`, `/season/2`), query or fragment. Also a bare `movie/<id>` or
`tv/<id>`, optionally with a leading slash and the same tails. `movie` gives
`type: movie`, `tv` gives `type: series`.

A bare number is refused, because it does not say whether a movie or a series
is meant; the message suggests `movie/<n>` or `tv/<n>`.

### Requests

```
GET https://api.themoviedb.org/3/movie/<id>?language=<language>
GET https://api.themoviedb.org/3/tv/<id>?language=<language>
GET https://api.themoviedb.org/3/tv/<id>/external_ids      series only
Authorization: Bearer <token>
Accept: application/json
```

Every string in a response is NFC-normalised as it is parsed.

| Answer                           | Effect                                            |
| -------------------------------- | ------------------------------------------------- |
| HTTP 401                         | configuration error: no further entry can succeed |
| HTTP 404                         | per entry: TMDB has no such movie or series       |
| other non-200, network, bad JSON | per entry                                         |

The token is removed from any lower-level error message before it is shown;
the plugin's own messages never contain it.

**Translation fallback.** TMDB does not fall back to another language on its
own: an entry without a translation comes back without overview or poster.
When `overview` is empty or `poster_path` is null, the details are requested
again without `language`, and the result fills **every field that is empty**;
values already obtained in the configured language are kept. The message
names the fields taken from the default language. If the fallback request
fails, the note is written with the first answer and the failure is reported;
a 401 still stops.

A missing title, after the fallback, fails the entry.

The collision check comes after the details and the fallback, because the
file name may depend on the fallback, and before `external_ids` and the
poster.

**IMDb id of a series.** `/tv/<id>` does not carry `imdb_id`; it comes from
`external_ids`. A failure there fails the entry, unlike blurb and cover: the
IMDb id is identity data, and a retry is cheap.

### Field mapping

| Property         | Movie                                   | Series                               |
| ---------------- | --------------------------------------- | ------------------------------------ |
| `type`           | `movie`                                 | `series`                             |
| `title`          | `title`                                 | `name`                               |
| `original_title` | `original_title`                        | `original_name`                      |
| `url`            | `https://www.themoviedb.org/movie/<id>` | `https://www.themoviedb.org/tv/<id>` |
| `imdb_id`        | `imdb_id`                               | `external_ids.imdb_id`               |
| `year`           | year of `release_date`                  | year of `first_air_date`             |
| `genres`         | `genres[].name`, de-duplicated          | the same                             |
| `description`    | `overview`                              | `overview`                           |
| `cover`          | `poster_path`, see [Poster](#poster)    | the same                             |

`url` is rebuilt from the id, never copied from the input with its slug and
query. An empty or malformed date leaves `year` blank. Genre names come in
the configured language, as TMDB returns them.

### Poster

```
https://image.tmdb.org/t/p/<poster size><poster_path>
```

Requested without the token. The extension is that of `poster_path`,
lower-cased; a `poster_path` that is not a plain `/<name>.<ext>` is not
followed. An existing `<stem>.<ext>` is kept. The download counts only with
HTTP 200 and `image/*`; otherwise the note is written with `cover` blank and
the reason reported.

### Movie or series note

```
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

## Messages

A successful entry reports `Created "<note path>".`, followed by whatever is
noteworthy:

- how an ambiguous 10-character input was read,
- where the cover came from, and whether it belongs to another edition,
- that an existing image was kept,
- why there is no description, cover or poster,
- which fields came from TMDB's default language, or that the fallback failed.

Error messages name the input or the setting concerned. Anything that is
neither a configuration nor a per-entry error is shown as
`Unexpected error: …`.
