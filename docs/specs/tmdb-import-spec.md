# Specification: `tmdb-import`

A handover document for implementing the script. It is not the user documentation — the repository README is written as part of the work, see *Deliverables*.

## Purpose

A command line tool that creates an Obsidian note for a movie or a series from a TMDB URL, downloads the poster into the vault, and writes frontmatter matching a fixed schema.

It replaces the Media DB Obsidian plugin, which cannot set the TMDB API's `language` parameter and therefore returns English titles and English-language posters, and which cannot write constant fields the API does not supply.

## Context

- Repository: `obsidian-scripts`, holding several unrelated Obsidian helpers, packaged as the Python package `obsidian_scripts`. This one is the module `src/obsidian_scripts/tmdb_import.py`, with its tests in `tests/tmdb_import/`.
- Python 3.11 or later, standard library only at runtime. No third-party packages, and nothing imported from the sibling scripts. Invoked either directly as `python3 src/obsidian_scripts/tmdb_import.py`, or as the command `tmdb-import` after installing the package; both must work. Test-only packages are managed with uv.
- `tomllib` for configuration. Frontmatter is written directly, not via a YAML library.
- The user runs it from a terminal on the machine that holds the vault.

## Non-goals

Do not implement these. They were considered and deliberately rejected.

- Searching TMDB by title. The user picks the entry in a browser and pastes its URL; that is where poster, year and plot can be compared by eye.
- Updating an existing note from TMDB.
- Per-season notes for series. One note per series, seasons are not tracked.
- Prompting for `rating` or `shelf` during import. Those are filled later, in Obsidian.
- Anything resembling a package, an installer or a plugin.

## Command line behaviour

Interactive loop:

1. Prompt for a TMDB URL.
2. An empty line, `q`, EOF (Ctrl-D) or Ctrl-C ends the run cleanly with exit code 0.
3. Otherwise process the entry, print a one-line result, and prompt again.

Errors on a single entry — unparseable URL, HTTP failure, existing file — are reported and the loop continues. Only a configuration or authentication problem aborts, with exit code 1 and a message naming the config file path.

Print for each note the path written and whether a poster was saved.

## URL parsing

Accept anything containing `themoviedb.org/movie/<id>` or `themoviedb.org/tv/<id>`, with or without a slug, trailing path segments (`/cast`, `/images`), query strings or a fragment. Also accept a bare `movie/<id>` or `tv/<id>`.

`movie` maps to `type: movie`, `tv` to `type: series`.

Reject a bare number: it does not say whether a movie or a series is meant.

## TMDB API

Base URL `https://api.themoviedb.org/3`. Authenticate with the API Read Access Token as a bearer token:

```
Authorization: Bearer <token>
Accept: application/json
```

The token is the `API Read Access Token` from the TMDB account settings, not the `API Key` — both are shown there side by side.

Requests, with `language` from the configuration:

| Type     | Endpoint                        | Note                                    |
| -------- | ------------------------------- | --------------------------------------- |
| movie    | `/movie/{id}?language={lang}`   | response contains `imdb_id`             |
| series   | `/tv/{id}?language={lang}`      | response does **not** contain `imdb_id` |
| series   | `/tv/{id}/external_ids`         | second request, for `imdb_id`           |

Field mapping:

| Property         | Movie                         | Series                            |
| ---------------- | ----------------------------- | --------------------------------- |
| `title`          | `title`                       | `name`                            |
| `original_title` | `original_title`              | `original_name`                   |
| `year`           | year part of `release_date`   | year part of `first_air_date`     |
| `description`    | `overview`                    | `overview`                        |
| `genres`         | `genres[].name`               | `genres[].name`                   |
| `imdb_id`        | `imdb_id`                     | `external_ids.imdb_id`            |
| poster           | `poster_path`                 | `poster_path`                     |

`url` is rebuilt canonically as `https://www.themoviedb.org/movie/{id}` or `.../tv/{id}`, not copied from the pasted input, which may carry a slug and query parameters.

### Missing translations

TMDB does not reliably fall back to another language. When `overview` comes back empty or `poster_path` is null, repeat the request without the `language` parameter and use the result to fill **only** the fields that were empty. Localised values already obtained are kept.

Date fields may also be empty or absent; leave `year` empty rather than failing.

### Unicode normalisation

Normalise every string in every API response to NFC as it is read. TMDB appears to deliver NFC, but does not guarantee it, and the normalisation costs nothing.

Obsidian resolves links and file paths in NFC, so a `cover` link containing decomposed text does not resolve, whatever form the file name on disk has. Linux compares file names byte for byte, so an NFC and an NFD name are two different files there. And Bases groups by exact value, so a decomposed `authors` or `series` value splits from the same value typed by hand.

Normalisation happens before the file name is sanitised and before the `cover` link is built, so `title`, the note's file name, the poster's file name and the link are guaranteed to share one form.

## Output

### File name

`<title> (<year>).md` in the notes directory, using the localised `title`.

Remove the characters `* " \ / < > : | ? # ^ [ ]`, then collapse runs of whitespace and trim. The first set is what Obsidian rejects in file names, the rest break wikilinks. The unmodified title stays in the `title` property.

If the target file already exists, report it and move on to the next prompt. Never overwrite, never append a counter — a name collision is a real one (a remake released the same year) and the user decides.

### Poster

Download `https://image.tmdb.org/t/p/{size}{poster_path}` into the assets directory, named like the note with the extension taken from `poster_path`. If a file of that name exists, keep it and do not download again.

`cover` is then a wikilink of the form `[[<assets_dir>/<file name>]]`, with `assets_dir` relative to the vault root. If no poster is available, leave `cover` empty.

### Note

Exact shape, property order significant — identity and origin first, then TMDB data, then the user's own fields:

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

`rating` and `last_finished` are written empty on purpose: they are a reminder of what the user fills in during the review pass.

`shelf: unsorted` marks the note as not yet reviewed. The user replaces it with `backlog`, `active`, `done` or `dropped` in Obsidian; a Bases view filtered on `unsorted` is their to-do list.

### YAML quoting

Frontmatter is written by hand, so quoting is the implementer's responsibility.

- Quote a scalar and escape inner `"` when the value contains `"`, `:` followed by a space, a leading `#`, a leading or trailing space, or begins with a character that would make it a YAML indicator (`- ? : , [ ] { } & * ! | > % @ \``).
- Values that are or look like `true`, `false`, `null`, `yes`, `no`, `on`, `off` or a number must be quoted to stay text.
- `year` is written **unquoted**, so it is a number. A quoted year would fix the property as text for the whole vault and break numeric comparisons in Bases.
- `template` and `cover` contain `[[...]]` and are always quoted.
- `description` is a single line. Replace newlines with spaces rather than emitting a block scalar.

## Configuration

TOML, read from `$XDG_CONFIG_HOME/obsidian-scripts/tmdb-import.toml`, falling back to `~/.config/obsidian-scripts/tmdb-import.toml`. Create neither the file nor the directory; if it is missing, print the expected path and an example, and exit 1.

```toml
# API Read Access Token from https://www.themoviedb.org/settings/api
token = "..."

# Absolute path to the vault root
vault = "~/Notes"

# Both relative to the vault root
notes_dir = "Movies"
assets_dir = "assets"

# TMDB locale and poster size
language = "de-DE"
poster_size = "w500"
```

`notes_dir` and `assets_dir` must be vault-relative, because `cover` is a vault-relative wikilink while writing the file needs a filesystem path. Expand `~` in `vault`. Create `notes_dir` and `assets_dir` if absent.

The token may be overridden by the environment variable `TMDB_READ_ACCESS_TOKEN`, so it can be kept out of the file. Never log it.

Defaults: `assets_dir = "assets"`, `language = "en-US"`, `poster_size = "w500"`. `token`, `vault` and `notes_dir` are required.

## Deliverables

- `src/obsidian_scripts/tmdb_import.py`, with a `main()` that returns the exit code, registered as the `tmdb-import` entry point in `pyproject.toml`.
- Offline tests in `tests/tmdb_import/`, and a contract check against the live API that runs only when switched on.
- A `tmdb-import` section in the repository `README.md`: installation, the configuration file with its location and every key, how to run it, the field mapping table above, and the file naming rules. This is the machine-side documentation.
- An example configuration file, `examples/tmdb-import.example.toml`.

The meaning of the properties — what the `shelf` values stand for, why `url` is not called `tmdb`, why `original_title` is stored even when identical to `title` — lives in the vault, in a note named *Movie Template Conventions*. Do not duplicate it in the README; refer to it.
