# Movie Template Conventions

The schema for movies and series. Notes are created by the Pinpoint Media Notes plugin, or by hand from [[Movie Template]] with the Templates core plugin for anything TMDB does not know.

It does not describe a work completely; it is deliberately kept short so that it fits my purposes. Cast and director, for example, are not recorded, because they are not important to me.

The property naming rules, the file name conventions and the reasoning behind them are vault-wide and documented in [[Obsidian Bases Conventions]]. This note covers only what is specific to movies and series.

## Note granularity

- One note per movie.
- One note per series. Seasons are not tracked separately — a rating and a watch date refer to the series as a whole.
- File names: `<Title> (<Year>)`, using the localised title. Characters Obsidian cannot store in a file name are dropped; the full title stays in `title`.

## Property template

Name: `template`, Type: Text

An internal link to [[Movie Template]]. It records which schema a note follows, not which tool produced it — the plugin sets the same value as the template does.

## Property type

Name: `type`, Type: Text

Valid values:

- `movie`
- `series`

`tags` already separates this collection from books or games, so `type` only has to tell a movie from a series. It is a generic name, but its meaning stays the same anywhere else it might be used.

## Property title

Name: `title`, Type: Text

The title in the language the collection is kept in, as TMDB returns it for that locale — the title I would search for. Without the year, which belongs to `year`.

## Property original_title

Name: `original_title`, Type: Text

The title in the work's original language. This is what makes an entry findable outside TMDB: localised titles differ from catalogue to catalogue, the original title does not. It is written even when it is identical to `title`, so that the column is never half empty.

## Property url

Name: `url`, Type: Text

A link to the TMDB record. The name is deliberately provider-neutral: writing `tmdb` would bake the source into the schema and break as soon as something is imported from another API.

The TMDB id is contained in this URL and is not stored a second time.

## Property imdb_id

Name: `imdb_id`, Type: Text

The IMDb id, in the form `tt0133093`.

This is the identifier that survives the loss of any single service. IMDb itself has no freely usable API, which is why the data comes from TMDB — but almost every other catalogue references IMDb ids, Wikidata included, so an entry can be matched elsewhere exactly rather than heuristically. Matching on title and year is guesswork by comparison.

## Property year

Name: `year`, Type: Number

Year of publication. For a series, the year it first aired.

## Property genres

Name: `genres`, Type: List of Text

The genre names as TMDB returns them for the configured locale, so the vocabulary stays stable. With a German locale these are German names.

## Property description

Name: `description`, Type: Text

Two or three sentences about what it is about, taken from TMDB. This is not my own verdict — my notes go into the body of the page.

## Property cover

Name: `cover`, Type: Text

An internal link to the poster image downloaded into the vault. A copy rather than a remote URL, so the note stays complete if TMDB disappears.

## Property rating

Name: `rating`, Type: Number

My own rating, from 1 (poor) to 5 (best). Whole numbers only.

## Property last_finished

Name: `last_finished`, Type: Date

When it was last watched to the end. The property is overwritten on every rewatch; earlier dates are not kept. The name is deliberately neutral so that books and games can reuse it later.

## Property shelf

Name: `shelf`, Type: Text

Valid values:

- `unsorted`: freshly imported, not reviewed yet
- `backlog`: planned, not started yet
- `active`: currently being watched
- `done`: watched to the end
- `dropped`: started, but abandoned

`unsorted` is what the plugin writes. Reviewing a batch of imports means replacing it with one of the other values, which is also when `rating`, `last_finished` and any notes are filled in. A Bases view filtered on `shelf == "unsorted"` is the to-do list, and it is empty when the batch is done.

Using the value itself as the marker means the state cannot be forgotten: as long as it is there, the note is visibly incomplete. A separate tag would have to be removed by hand and would silently stay behind.

## Property tags

This is the system property `tags`. Both the template and the plugin set:

```
tags:
  - movies
```

## Page body

My own verdict and notes go below a `## Notes` heading as regular Markdown text.

## Empty properties

The plugin writes `rating` and `last_finished` as empty properties even though an empty and a missing property are the same thing to Bases. They are a reminder of what is still to be filled in during the review pass. [[Movie Template]] carries the same set for the same reason.

## Schema changes

- *(no changes yet)*

## Import

Notes are created by the Pinpoint Media Notes plugin, which takes a TMDB link pasted from the browser and writes the note and the poster. The field mapping and the plugin's behaviour are specified in the plugin's repository; this note stays the authority on what the properties mean.

Picking the entry in the browser rather than from a list in Obsidian is deliberate: poster, year and plot are visible side by side, so the one step a program could get wrong is decided by eye.
