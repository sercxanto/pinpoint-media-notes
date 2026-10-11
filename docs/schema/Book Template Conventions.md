# Book Template Conventions

The schema for books, e-books and audiobooks. Notes are created by the Pinpoint Media Notes plugin, or by hand from [[Book Template]] for anything the import source does not have.

Like [[Movie Template Conventions]], this does not describe a work completely. Publisher, translator, narrator and page count are deliberately absent; they are not what I search or filter by.

The property naming rules, the file name conventions and the reasoning behind them are vault-wide and documented in [[Obsidian Bases Conventions]]. This note covers only what is specific to books.

## Note granularity

One note per **edition I actually own or consumed** — not per work.

- The paperback and the e-book of the same title are two notes.
- A work read on paper and later heard is two notes.
- One note per volume, not per series. A book series is recorded through `series` and `series_index`.

This follows from `type` and `year` describing an edition rather than a work: `rating` and `last_finished` then refer to the thing that was actually read or heard, and `type` answers the question the collection exists to answer — *where do I look for this if I want it now*.

The last point deliberately diverges from [[Movie Template Conventions]], where a whole TV series is a single note. The two cases are not alike: television seasons are consumed as one continuous thing and released under one title, whereas the volumes of a book series are separate published works, appear years apart, carry their own ISBNs and are finished and rated one at a time.

### Finding the editions of one work

The notes for one work are not linked to each other, and there is no `work` property. Grouping a Bases view on `original_title` brings them together, disambiguated by `authors` where a title is generic.

`year` cannot help with this, because it is edition-specific — see below. This is the one thing the edition-based model costs, and it is the reason `original_title` is mandatory even when it equals `title`.

## File names

- Printed book: `<Title> (<Year>)`
- E-book: `<Title> (<Year>) - E-Book`
- Audiobook: `<Title> (<Year>) - Hörbuch`

using the localised title and the edition year.

The suffix is not optional and not conditional. Editions of one title frequently appear in the same year — the 2026 Känguru-Rebellion exists as hardback, e-book, audio CD and audio download, all carrying that year — so the year alone does not disambiguate and the printed book is the only form that goes without a suffix.

The suffixes are in the language of the vault, like the titles themselves. Square brackets are not used for them, because they break wikilinks.

Characters Obsidian cannot store in a file name are dropped; the full title stays in `title`.

## Property template

Name: `template`, Type: Text

An internal link to [[Book Template]]. It records which schema a note follows, not which tool produced it.

## Property type

Name: `type`, Type: Text

Valid values:

- `book` — a printed book on a shelf
- `ebook` — a file on a reader or in a reading app
- `audiobook` — spoken word, on disc or as a download

This is a *where do I find it* property as much as a *what is it* property, which is why the printed book and the e-book are separated at all: they are the same text, but not in the same place.

`tags` already separates this collection from movies or games, so `type` only has to tell the three forms apart. It is the same generic property as in the movie schema, with the same meaning, and that is what makes a combined Bases view over all media possible — `type` is the discriminator that tells a row apart from a film.

Fiction and non-fiction are **not** recorded here. See `genres`.

The values map onto MARC content and carrier type, which is how the plugin derives them without guessing:

| MARC 336 content | MARC 338 media | `type` |
| --- | --- | --- |
| Text | Band | `book` |
| Text | Online-Ressource | `ebook` |
| gesprochenes Wort | any | `audiobook` |

## Property title

Name: `title`, Type: Text

The title in the language the collection is kept in — the title I would search for. Without the year, which belongs to `year`, and without the format suffix, which belongs to the file name.

Subtitles are not included. `Freiheitsschock`, not `Freiheitsschock. Eine andere Geschichte Ostdeutschlands von 1989 bis heute`.

## Property original_title

Name: `original_title`, Type: Text

The title in the work's original language. This is what makes an entry findable outside the source catalogue, and it is what matches the editions of one work against each other.

Written even when identical to `title`, because it is the grouping key — an empty value would drop that note out of the grouping entirely.

Worth knowing: the title I remember is not always the one catalogues use. The Eismond novels are catalogued as *Enceladus*, and searching for *Encelados* returns nothing anywhere.

## Property authors

Name: `authors`, Type: List of Text

A list, because co-authors are normal — three of the books in the first batch have two. Plural, matching the naming rule for list properties.

Plain text, not internal links. Links would spawn an author note for every entry, and a collection of empty author pages is maintenance without a payoff — Bases groups on a list of text just as well.

Unlike the movie schema, which records no people at all, the author is kept: it is a browse axis for books in a way a director is not for films.

Recorded in the catalogue's `Nachname, Vorname` form, because that is what sorts usefully in a grouped view.

The translator is not recorded, and neither is the narrator of an audiobook.

## Property url

Name: `url`, Type: Text

A link to the record in whatever catalogue the entry came from. The name is provider-neutral on purpose: baking `dnb` into the schema would break the moment something is imported from elsewhere.

## Property isbn

Name: `isbn`, Type: Text

The ISBN-13 of **this edition**, digits only, without hyphens.

This is the identifier the wider ecosystem cross-references, in the role `imdb_id` plays for films — and because a note now describes one edition rather than a work, the edition-level nature of an ISBN is no longer a mismatch. It is exactly the right granularity: the printed book, the e-book and the audiobook each carry their own, and that is precisely the distinction the notes make.

It is also the practical import key. Catalogue free-text search is unreliable in ways that are hard to predict — a DNB query for `Methode Clear` returns nothing while `1%-Methode` returns 191 records — whereas an ISBN lookup returns exactly one record.

It may be empty. Older works predate the ISBN, and some vendor-exclusive audiobooks carry only a proprietary id, which is worthless once that vendor is gone and is therefore not stored. In those cases `original_title` plus `authors` is the fallback, per [[Obsidian Bases Conventions]].

## Property year

Name: `year`, Type: Number

Year of **this edition** — the printing, the e-book release or the recording in hand. Not the first publication of the work.

This is what makes the year useful for finding the thing again: it matches what is printed in the copy on the shelf and what the catalogue record says. The import source supplies it directly, so it needs no correction during the review pass.

The cost is that the year no longer says when a work was written. *Vom Mythos des Mann-Monats* in the 2003 German edition carries `year: 2003`, although the book is from 1975 and is thought of as a 1975 book. If that becomes annoying, the fix is a separate `first_published` property rather than overloading this one — but it is not worth adding before it has actually been missed.

Catalogue records give the year in forms such as `[2024]`, `[2022?]` or `Oktober 2024`. The plugin reduces these to a plain four-digit number.

## Property series

Name: `series`, Type: Text

The name of the series a volume belongs to, empty for a standalone book.

The name collides with nothing: `type: series` is a *value* in the movie schema, this is a property name, and it will only ever mean "the series this volume is part of".

## Property series_index

Name: `series_index`, Type: Number

Position within the series, empty for a standalone book.

A number, so it sorts correctly without zero-padding — padding is only needed where sorting is textual, which means file names.

Both properties come from the same catalogue field, so they are imported together or not at all.

## Property genres

Name: `genres`, Type: List of Text

Maintained by hand against the fixed vocabulary below, not imported. This is the one property that does not carry over from the movie schema, where TMDB supplies a small stable list. Book catalogues do not: the record for *Die 1 % Methode* alone offers four GND headings, a VLB code, a BISAC code and free keywords including *Rauchen* and *Abnehmen*.

Every note carries **exactly one form value**:

- `Fiktion`
- `Sachbuch`

plus any number of topical values.

The pair is deliberately not `Roman` / `Sachbuch`. `Roman` would claim a genre as well as a form, and would be a small lie on a book of short stories, a volume of poetry, a play or a comic — the Känguru books are episodic sketches rather than novels. `Fiktion` names only what the distinction is actually about: invented or not. It is not symmetrical with `Sachbuch`, which is a kind of book rather than a property of the content; `Sachliteratur` would be the matching term, but `Sachbuch` is the word in actual use and reads better as a group heading.

`Roman` is not part of the vocabulary. Where nearly all fiction on the shelf is novels, tagging them as such filters nothing. A value for the literary form is worth adding the day a second one appears — an `Erzählungen` or a `Lyrik` — and then all of them are added at once.

Writing the form value first is a readability habit, not semantics — Bases groups over a list without regard to order. What the filters depend on is that exactly one is present, which is what makes `genres.contains("Sachbuch")` trustworthy: with a value missing, a `Fiktion` view and a `Sachbuch` view no longer add up to the collection, and nothing says which notes fell through. The `Lücken` view in `Books.base` checks for all three failures — none, both, or neither.

The distinction lives here rather than in a property of its own because it is one value in a list that is being kept anyway, and because a boolean named `fiction` could not later grow a third case — a book that is neither, such as a cookbook of invented recipes or an artist's book.

### Shared with the movie collection

Written **exactly** as TMDB returns them for the German locale, so that a view spanning both collections groups them as one value:

`Abenteuer` · `Fantasy` · `Historie` · `Horror` · `Komödie` · `Krimi` · `Mystery` · `Science Fiction` · `Thriller` · `Western`

Note `Science Fiction` — a space, not a hyphen. TMDB's full list also holds `Action`, `Animation`, `Dokumentarfilm`, `Drama`, `Familie`, `Kriegsfilm`, `Liebesfilm`, `Musik` and `TV-Film`, which are available should a book call for one.

### Book-only

`Fotografie` · `Geschichte` · `Informatik` · `Philosophie` · `Politik` · `Psychologie` · `Satire` · `Wissenschaft`

Kept deliberately broad. A collection this size is better served by a handful of wide values than by a long tail where every book invents its own; splitting `Informatik` into `Softwareentwicklung` and its neighbours is a change to make when the shelf actually demands it.

### Two values that need care

**`Drama` is not used for books.** In TMDB it is the broad genre for serious material; in a book context the word names a literary form, the stage play. Leaving it to the films avoids a view in which *Freiheitsschock* sits beside Schiller.

**`Historie` and `Geschichte` coexist on purpose.** `Historie` is TMDB's value and goes on historical fiction, where it joins the historical films; `Geschichte` is the subject and goes on non-fiction about the past. A historical novel therefore takes `Historie`, a history book takes `Geschichte`.

New values are added to the lists above when they are first used, so the vocabulary stays visible in one place.

## Property description

Name: `description`, Type: Text

Two or three sentences about what it is about, from the source catalogue. Not my own verdict — that goes into the body of the page.

Publisher blurbs arrive long, in several paragraphs, and sometimes with dialogue excerpts. The plugin reduces them to a single line of plain text and truncates at a sentence boundary.

## Property cover

Name: `cover`, Type: Text

An internal link to the cover image downloaded into the vault. A copy rather than a remote URL, so the note stays complete if the source disappears.

Each edition points at its own cover. Where an edition has no cover of its own, it points at the cover of another edition of the same work — usually the printed one, whose artwork the e-book normally shares. Where the artwork genuinely differs, as with an audiobook or an illustrated edition, two notes may reasonably point at the same file rather than leave one empty.

## Property rating

Name: `rating`, Type: Number

My own rating, from 1 (poor) to 5 (best). Whole numbers only.

Because format is a note rather than a property, a mediocre reading of a good book gets its own rating without dragging the book's down.

## Property last_finished

Name: `last_finished`, Type: Date

When it was last finished. Overwritten on every reread; earlier dates are not kept. The name was chosen neutrally in the movie schema precisely so that books could reuse it.

Reading progress within a book is not tracked. `shelf: active` says it is in progress, which is all a view needs.

## Property shelf

Name: `shelf`, Type: Text

Valid values:

- `unsorted`: freshly imported, not reviewed yet
- `backlog`: planned, not started yet
- `active`: currently being read or heard
- `done`: finished
- `dropped`: started, but abandoned

Same values and same meaning as in the movie schema, which is what makes a combined view across media possible.

Note that `shelf` is about progress, not about location, despite the name — where a copy physically is, is what `type` answers.

`unsorted` is what the plugin writes. Reviewing a batch means replacing it with one of the other values, which is also when `rating`, `last_finished`, `genres` and any notes are filled in. A Bases view filtered on `shelf == "unsorted"` is the to-do list, and it is empty when the batch is done.

## Property tags

This is the system property `tags`. Both the template and the plugin set:

```
tags:
  - books
```

E-books and audiobooks are not tagged separately — `type` already distinguishes them, and a second tag would be a redundant property by another name.

## Page body

My own verdict and notes go below a `## Notes` heading as regular Markdown text.

## Empty properties

`rating` and `last_finished` are written as empty properties even though an empty and a missing property are the same thing to Bases. They are a reminder of what is still to be filled in during the review pass.

`series` and `series_index` are empty for a different reason — they genuinely do not apply to a standalone book — and need no action.

## Schema changes

- **Fiction form value renamed from `Roman` to `Fiktion`.** Migration: in every note whose `genres` holds `Roman`, replace that value with `Fiktion`. Do not add `Roman` back as a topical value — it is no longer part of the vocabulary. Notes holding `Sachbuch` are unaffected.

## Import

Notes are created by the Pinpoint Media Notes plugin from an ISBN, which removes the ambiguity that makes free-text catalogue search unreliable. The field mapping and the plugin's behaviour, covers included, are specified in the plugin's repository, together with the evaluation of possible sources; this note stays the authority on what the properties mean.

The source is the **Deutsche Nationalbibliothek**. It is the only tested source that has the German editions at all, and the only one that models print, e-book and audiobook as separate records the way this schema does.

What the source supplies directly: `title`, `original_title`, `authors`, `isbn`, `year`, `series`, `series_index`, `type`, `description`, `url`, and usually a cover — where an edition has none of its own, the plugin takes the cover of another edition of the same work and says so.

`genres` is the only property not imported at all; it is filled in during the review pass.

Look the ISBN up from the copy in hand rather than searching by title: the catalogue includes forthcoming editions, so a title can turn up records dated a year or two ahead.
