# Pinpoint Media Notes

An Obsidian plugin that creates a note with a cover image from an exact
identifier, instead of a title search:

- a book's **ISBN**: printed book, e-book or audiobook, from the catalogue of
  the Deutsche Nationalbibliothek (DNB, the German National Library),
- a **TMDB link**: movie or series, in the language you configure.

Each note gets a fixed frontmatter schema and its own local copy of the cover
or poster.

There is no search by title, on purpose. You pick the exact movie on the TMDB
website, comparing poster, year and plot by eye, and paste its link; for a
book, the ISBN printed in the copy at hand names exactly one edition.

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Settings](#settings)
- [Importing a book](#importing-a-book)
- [Importing a movie or series](#importing-a-movie-or-series)
- [The notes](#the-notes)
- [Covers and posters](#covers-and-posters)
- [Messages](#messages)
- [Network use and privacy](#network-use-and-privacy)
- [Synced vaults and mobile](#synced-vaults-and-mobile)
- [Not included](#not-included)
- [Development](#development)

## Requirements

- Obsidian 1.13 or later, desktop or mobile.
- For movies and series: a free TMDB account and its **API read access
  token** (see [Settings](#settings)).
- Books need no account.

## Installation

### From the community plugin list

The plugin is not in the community plugin list yet. Once it is, install it
from **Settings → Community plugins → Browse** by searching for _Pinpoint
Media Notes_, then enable it.

### By hand

1. Build the plugin (needs Node, for example in the dev container):

   ```sh
   npm install
   npm run build
   ```

   Use `npm run build`, not `npm run dev`: the development build embeds a
   source map, which makes `main.js` much larger, and every synced device has
   to download that larger file.

2. Copy it into your vault. On the machine that holds the vault (no Node
   needed there), run:

   ```sh
   scripts/install-to-vault.sh <path to vault>
   ```

   It copies `main.js` and `manifest.json` to
   `<vault>/.obsidian/plugins/pinpoint-media-notes/`, creating the folder if
   needed, and leaves the plugin's settings (`data.json`) alone. It refuses a
   folder without `.obsidian` and a development build. To do it by hand, copy
   those two files into that folder; its name must be the plugin id.

3. In Obsidian, open **Settings → Community plugins**, turn off
   **Restricted mode** if it is on, reload the plugin list and enable
   **Pinpoint Media Notes**.

4. Fill in the [settings](#settings).

After a new build, run the script again, then turn the plugin off and on or
run **Reload app without saving**.

### Schema notes

The templates and conventions notes in [`docs/schema/`](docs/schema/) can be
copied into the vault the same way:

```sh
scripts/install-schema-to-vault.sh --diff <path to vault>
scripts/install-schema-to-vault.sh <path to vault>
```

Templates go to `Obsidian/Templates`, conventions notes to
`Obsidian/Conventions`; `--templates <dir>` and `--conventions <dir>` choose
other folders, relative to the vault. The script lists each note as `new`,
`changed` or `unchanged` and writes only those that are not unchanged; other
notes in those folders are left alone. A note changed in the vault is
overwritten, so run it with `--diff` first: that writes nothing and shows a
unified diff per changed note, `-` for the vault's version and `+` for the
repository's.

## Settings

All folders are relative to the vault root: `Books` or `Media/Books`, not an
absolute path, not the vault root itself, and without `..`. Missing folders
are created on the first import.

| Setting                       | Default  | Meaning                                                                                              |
| ----------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| Image folder                  | `assets` | Covers and posters of both importers.                                                                |
| Book notes folder             | (none)   | Book, e-book and audiobook notes. Required for the book import.                                      |
| Cover size                    | Large    | DNB cover size: small (90×122), medium (200×272) or large (442×599) pixels.                          |
| Movie and series notes folder | (none)   | Movie and series notes. Required for the movie and series import.                                    |
| TMDB read access token        | (none)   | Required for the movie and series import. See below.                                                 |
| Language                      | `en-US`  | TMDB locale for titles, descriptions and posters, for example `de-DE`.                               |
| Poster size                   | `w500`   | TMDB image size: `w92`, `w154`, `w185`, `w342`, `w500`, `w780` or `original` (the file as uploaded). |

An importer whose required settings are missing stops before asking for
input, with a message naming the setting. The other importer works without
them, so you can use just one.

**TMDB token:** in your TMDB account, open **Settings → API** and copy the
**API Read Access Token**, the long value (a JWT starting with `eyJ`). The
short **API Key** next to it does not work here, and the plugin says so if
you paste it. The token is stored in plain text in the plugin's
`data.json`, like every setting of every plugin, and syncs with it; the
field in the settings is masked. The plugin never shows the token in a
message, and sends it only to `api.themoviedb.org`.

## Importing a book

Run **Pinpoint Media Notes: Import book** from the command palette and enter
one of:

| Input                  | Example                                   |
| ---------------------- | ----------------------------------------- |
| ISBN-13                | `978-3-442-17858-2`, `ISBN 9783442178582` |
| ISBN-10                | `3-442-17858-4` (converted to ISBN-13)    |
| DNB record number      | `1198618736`                              |
| Link to the DNB record | `https://d-nb.info/1198618736`            |

Spaces, hyphens, a leading `ISBN`, `ISBN-10:` or `ISBN-13:`, and invisible
characters copied along from web pages (such as Amazon's) are ignored.
An ISBN with a wrong check digit is rejected as a typo before anything is
looked up.

A 10-character input can be an ISBN-10 or a DNB record number; both use the
same check digit, so the plugin cannot tell them apart. It looks the input up
as an ISBN first and, if the catalogue has nothing, as a record number, and
the message says which one it used. A `d-nb.info` link avoids the guess.

The record number is the number at the end of the record's permanent link on
[portal.dnb.de](https://portal.dnb.de) (_Link zu diesem Datensatz_).

**Several records:** some publishers use one ISBN for the print and the
e-book edition. Then a list opens with title, year, type, ISBN and catalogue
link of each record; choose one with **Import**, or close the list to skip
the entry.

**Supported material:** printed books, e-books and audiobooks. The catalogue
also holds sheet music, maps, films and more; those are reported and
skipped.

The window stays open after each import, so you can work through a stack of
books. After a success the field is cleared for the next entry; after an
error the input stays, so you can correct it. Close the window when you are
done.

## Importing a movie or series

Run **Pinpoint Media Notes: Import movie or series** and paste the link of
the movie or series page on [themoviedb.org](https://www.themoviedb.org).
All of these work:

```
https://www.themoviedb.org/movie/800815-official-competition
https://www.themoviedb.org/movie/800815/cast?language=de#top
https://www.themoviedb.org/tv/1396-breaking-bad/season/2
movie/800815
tv/1396
```

A bare number is refused, because it does not say whether a movie or a
series is meant.

Titles, description and poster come in the configured **Language**. TMDB
does not fall back to another language by itself: an entry without a
translation has no description, or no poster, in your language. In that
case the plugin asks again without a language and fills only the gaps, so a
note can have a translated title with an English description, never the
reverse. The message names the fields that were filled this way.

One note per series; seasons are not tracked separately. The window works as
for books; if TMDB rejects the token, it closes, since no further import
could succeed until the setting is fixed.

## The notes

### Book

File: `<title> (<year>)<suffix>.md` in the book notes folder, where the
suffix tells editions apart, which often share title and year:

| Type        | File name                             |
| ----------- | ------------------------------------- |
| `book`      | `Die 1 % Methode (2020).md`           |
| `ebook`     | `Die 1 % Methode (2020) - E-Book.md`  |
| `audiobook` | `Die 1 % Methode (2020) - Hörbuch.md` |

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

| Property         | Source (MARC21 field in the DNB record)                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `type`           | content type `336` and carrier type `338`: spoken word → `audiobook`; text in a volume → `book`; text online → `ebook` |
| `title`          | `245 $a`, without subtitle                                                                                             |
| `original_title` | `240 $a`, the original title of a translation; else the title                                                          |
| `authors`        | `100 $a` and `700 $a`, authors only: no translators, narrators, editors or illustrators. `[]` if there is none         |
| `url`            | `https://d-nb.info/<record number>`                                                                                    |
| `isbn`           | the ISBN-13 in `020 $a`; a record with only an ISBN-10 gets it converted                                               |
| `year`           | first four-digit year in `264 $c` (publication before copyright date), else `260 $c`                                   |
| `series`         | `490 $a`, else `830 $a`                                                                                                |
| `series_index`   | the number in `490 $v`, else `830 $v`: "Band 5" → `5`                                                                  |
| `genres`         | always `[]`, for you to fill in; the catalogue's subject headings do not map to genres                                 |
| `description`    | the DNB's blurb (`Inhaltstext`), as plain text, whole sentences up to 500 characters; empty if there is none           |
| `cover`          | see [Covers and posters](#covers-and-posters)                                                                          |

### Movie or series

File: `<title> (<year>).md` in the movie and series notes folder, with the
title in the configured language.

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

| Property         | Movie                                       | Series                                          |
| ---------------- | ------------------------------------------- | ----------------------------------------------- |
| `type`           | `movie`                                     | `series`                                        |
| `title`          | `title`                                     | `name`                                          |
| `original_title` | `original_title`                            | `original_name`                                 |
| `url`            | `https://www.themoviedb.org/movie/<id>`     | `https://www.themoviedb.org/tv/<id>`            |
| `imdb_id`        | `imdb_id`                                   | `imdb_id` from a second request, `external_ids` |
| `year`           | year of `release_date`                      | year of `first_air_date`                        |
| `genres`         | `genres[].name`, in the configured language | the same                                        |
| `description`    | `overview`                                  | `overview`                                      |
| `cover`          | `poster_path`                               | `poster_path`                                   |

`url` is always rebuilt from the id, never the pasted link with its slug and
query string.

### Both

- `rating` and `last_finished` are always empty and `shelf` is always
  `unsorted`: together they mark a note as not yet reviewed. You fill them in
  later; the plugin does not ask for them.
- `template` links to a note named _Book Template_ or _Movie Template_; the
  plugin does not create those notes. Both templates are in
  [`docs/schema/`](docs/schema/).
- What the properties mean, what the `shelf` values stand for and why a book
  note describes an edition rather than a work are documented in the
  conventions notes in [`docs/schema/`](docs/schema/). They are Obsidian
  notes, written to be copied into a vault as they are. The plugin only writes
  the schema.
- `year` and `series_index` are written as numbers, so Bases and Dataview
  can compare them; `isbn` is always quoted, so it stays text.
- `description` is always one line.
- An empty field is written as an empty property, not left out, so every note
  has the same properties.

### File names

The file name uses the title with `* " \ / < > : | ? # ^ [ ]` and leading
dots removed and whitespace collapsed; the `title` property keeps the title
as it is. Without a year, the file is named after the title alone (plus the
book suffix). Titles are normalised to Unicode NFC, because both sources
sometimes deliver characters such as `ü` in decomposed form, which breaks the
`cover` link.

**An existing note is never overwritten, and no counter is appended.** If
the target file exists, the entry is skipped with a message. A name clash is
usually worth a look: a remake with the same title and year, or a book you
already have. Rename the existing note by hand and import again. The check
comes before any image is downloaded.

## Covers and posters

The image is saved in the image folder under the same name as the note, for
example `assets/Die 1 % Methode (2020).jpg`, and linked in `cover`. Every
note gets its own copy of the file, even if two notes use the same picture,
so deleting one note never breaks another's cover.

If an image of that name already exists, it is kept and not downloaded
again. To replace a cover, put your own file under that name; importing the
same entry again after deleting the note will reuse it.

If there is no image, the note is still written, with `cover` empty, and the
message says why.

### Book covers

Covers come from the DNB's cover service in the configured size. About a
third of editions, mostly e-books, have no cover of their own. The plugin
then tries, in this order, until one is found:

1. the edition's own ISBN,
2. the ISBNs of other editions listed in the record,
3. the ISBNs of other editions' records linked from the record.

The message names the ISBN the cover came from, and says so when it belongs
to another edition: an audiobook or an illustrated edition may have
different artwork, which you may want to replace by hand.

**Caveat:** the cover server sits behind a bot filter. The plugin identifies
itself, which the filter currently lets through. If the filter starts
challenging it, every book is imported without cover and the message reads
"the cover server answered with text/html instead of an image, probably its
bot check". The notes are still correct; add the covers by hand, or import
again later (delete the note first).

### Posters

Posters come from TMDB's image server in the configured size, in the
configured language if TMDB has one, otherwise in TMDB's default language.
The file extension is that of TMDB's file.

## Messages

Every import ends with a notice of about ten seconds: the note created, and
anything noteworthy, such as where the cover came from, a missing blurb,
fields taken from TMDB's default language, or which reading of a
10-character input was used.

| Kind           | Examples                                                                   | What happens                                                      |
| -------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Settings       | folder not set, no token, API key instead of token, token rejected by TMDB | The import does not start, or the window closes. Fix the setting. |
| This entry     | typo, nothing found, name clash, unsupported material, a failed request    | The entry is skipped; the window stays open for the next.         |
| Partial result | no blurb, no cover, no poster                                              | The note is written without it; the message says why.             |

## Network use and privacy

The plugin sends requests only when you import an entry, and only to these
services:

| Host                 | For                                           |
| -------------------- | --------------------------------------------- |
| `services.dnb.de`    | catalogue lookup and blurbs (DNB, no account) |
| `portal.dnb.de`      | book covers (DNB)                             |
| `api.themoviedb.org` | movie and series details, with your token     |
| `image.tmdb.org`     | posters, without your token                   |

The DNB receives the ISBN or record number you enter, TMDB the id of the
movie or series. There is no telemetry and no other network access. DNB
requests carry the User-Agent `pinpoint-media-notes (Obsidian plugin)`.

This product uses the TMDB API but is not endorsed or certified by TMDB.
Catalogue data of the Deutsche Nationalbibliothek is available under CC0.

## Synced vaults and mobile

The plugin has no desktop-only dependencies and is meant to run on iOS and
Android as well; this has not been tested yet.

- **Obsidian Sync** transfers plugins only with **Installed community
  plugins** and **Active community plugin list** turned on in its settings.
  Other sync services (iCloud, Syncthing, …) copy the `.obsidian` folder
  along with the rest of the vault.
- On each device, **Restricted mode** must be off, and the plugin may need
  enabling there too.
- The settings, the TMDB token included, are stored in `data.json` in the
  plugin folder and sync with it. The folders are vault-relative, so they
  apply on every device.
- Importing the same entry on two devices before the sync has finished
  creates the note twice: each device only checks for files it already has.

## Not included

Left out on purpose:

- search by title,
- updating an existing note from the source,
- one note per season of a series,
- genres from the catalogue's subject headings,
- translator, narrator, publisher, page count or edition statement of a book,
- asking for `rating` or `shelf` during the import.

## Development

```sh
npm install
npm run check          # typecheck, lint, format check, tests, build
npm run dev            # watch build
npm run test:contract  # live checks against DNB and TMDB (TMDB needs TMDB_READ_ACCESS_TOKEN)
```

See [`docs/SPEC.md`](docs/SPEC.md) for the full behaviour,
[`AGENTS.md`](AGENTS.md) for architecture and working conventions,
[`docs/MANUAL_TEST.md`](docs/MANUAL_TEST.md) for the manual test in Obsidian.

## License

MIT
