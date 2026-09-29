# Pinpoint Media Notes

An Obsidian plugin that creates a note with a cover image from an exact
identifier, instead of a title search:

- a book's **ISBN**: printed book, e-book or audiobook, from the catalogue of
  the Deutsche Nationalbibliothek (DNB),
- a **TMDB URL**: movie or series, in the language you configure.

Each note gets a fixed frontmatter schema and a local copy of the cover or
poster.

> **Status:** in development, not yet usable. The full documentation follows
> once both importers work.

## Development

```sh
npm install
npm run check   # typecheck, lint, format check, tests, build
npm run dev     # watch build
```

See `AGENTS.md` for architecture and conventions.

## License

MIT
