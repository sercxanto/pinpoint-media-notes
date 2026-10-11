# Obsidian Bases Conventions

Conventions that apply to every template and every Bases view in this vault. The conventions note of an individual template documents only what is specific to it and links here for the rest.

## Property names

All property names are English, short, and carry no prefix. Prefixing them with the collection they belong to (`movie_rating`) is unnecessary noise.

The binding constraint is that **Obsidian stores one type per property name for the whole vault**, in `.obsidian/types.json`. A name reused in a second template must therefore keep the same type. `rating` cannot be a number in one place and text in another.

From that follows the actual rule: the same name means the same thing everywhere. Where a name would have to mean something different in another context, pick one that is scoped to the subject instead of a generic word. `status` is a bad property name for a media collection, because project or task notes will want the same word for something unrelated; `shelf` will only ever describe a piece of media and cannot collide.

A generic name is fine when the meaning genuinely stays the same across the vault. `type`, in the sense of "what kind of note is this", is such a case — it will always be text, and the values are exact matches in Bases, so nothing breaks when several collections share it.

Use a plural name for list properties and a singular name for everything else, matching Obsidian's own system properties (`tags`, `aliases`, `cssclasses`).

## Property values

Where collections are meant to be viewed together, keep the vocabulary neutral rather than domain-specific. A progress value of `backlog` / `active` / `done` / `dropped` reads a little plainer than `watchlist` / `watching` / `watched`, but the domain-specific wording forces books and games into their own terms and makes a combined Bases view impossible. The same reasoning applies to property names such as `last_finished` over `last_watched`.

## Properties or page body

Properties hold short values that Bases can sort, filter and group on. Prose belongs in the body of the note.

Obsidian shows text properties in a single-line field, which becomes unpleasant to edit beyond two or three sentences. A short synopsis is acceptable as a property; personal notes and verdicts are not.

## Avoid redundant properties

Do not store a value that can be derived from others. An id that is already contained in a stored URL does not need a field of its own, and a label assembled from two other properties is a Bases formula, not a third property that can drift out of sync.

Where two records differ in kind, give them an explicit discriminator property rather than testing another property for emptiness. Filtering on `type == "movie"` is clearer and more robust than asking whether some other field happens to be filled.

## File names and titles

A file name is a handle, not a value. Obsidian forbids `* " \ / < > : | ?` in file names, and `#`, `^`, `[`, `]` break wikilinks — all of which occur in real titles. File names also carry disambiguation suffixes such as a year, which are not part of the title either.

Anything that needs to be displayed or matched exactly therefore belongs in a property, typically `title`, and Bases views should show that rather than `file.name`.

Zero-pad numbers only where sorting is textual, which means file names: `10` sorts before `2` otherwise. A numeric property sorts correctly on its own and needs no padding — YAML would read `02` back as `2` in any case.

## Recording the template

Obsidian does not know object types like Anytype. After creating a note from a template, the note has no relation to the template it came from.

Every template therefore sets a `template` property holding an internal link to itself, so that a note can be traced back to the schema it follows.

## Note granularity

The conventions note of each template states what exactly one note represents. This is not obvious as soon as a collection has any hierarchy — a note per season rather than per series changes what a rating or a date refers to.

## Schema changes

No template carries a version property. Existing notes carry the shape of the schema they were created with, so a migration can detect what needs changing from the properties themselves — a note holding `genre` predates the rename to `genres`. A version number would have to be maintained by hand, would be identical in every note after a one-off migration, and would silently go stale the first time a note is edited manually.

Encoding the version in the template's file name is worse still: it invalidates the `template` link in every existing note on each bump, forcing a rewrite of the whole collection even when nothing about those notes changed.

Instead, each template keeps a list of schema changes in its conventions note recording the transformation, not merely the fact that something changed — that is what is needed to write a migration. Together with the vault's git history this covers everything a version number would have provided.

## Surviving the source

A collection outlives the service it was imported from. Two things keep it usable afterwards.

Copy rather than reference: text and images that matter belong in the vault, not behind a URL. What is lost when the source disappears is then only the ability to refresh an entry, not the content.

Store an identifier that others recognise. A provider's own id is worthless once that provider is gone; an identifier the wider ecosystem cross-references — an IMDb id, an ISBN — lets an entry be matched automatically against whatever comes next. Such an identifier outlives its issuer, because catalogues keep referring to it. Where no shared identifier exists, the closest substitute is the untranslated name plus a date.

## Known pitfalls

A template file sets the same tags as the notes created from it and therefore appears in its own Bases views. Exclude the templates folder in the view, for example with `!file.inFolder("Templates")`.

The Templates core plugin inserts at the cursor position. This only produces valid frontmatter on an otherwise empty note.

An importer that is not under your own control will rarely produce the full schema. Import plugins generally append their template to the *end* of a note they create, so a template containing frontmatter cannot be reused for imports, and field mappings can usually only rename or drop what an API returns, never add a constant. An importer that writes the note itself avoids the problem entirely and is worth the detour as soon as the gap needs closing by hand after every import.
