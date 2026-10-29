# Changelog

What changed for users of Pinpoint Media Notes, version by version. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions are the release tags. Each entry is one line, because GitHub shows every line break in the release notes.

## 0.1.0 - 2026-10-29

The first release.

### Added

- **Import book:** creates a note for a book, e-book or audiobook from an ISBN or a DNB record number, using the catalogue of the Deutsche Nationalbibliothek. An ISBN the DNB does not know comes from the Library of Congress, with title and cover from Open Library. Where an ISBN has several records, a picker lets you choose one.
- **Import movie or series:** creates a note from a TMDB link (or `movie/<id>`, `tv/<id>`), with title, genres and description in the configured language.
- A local copy of the cover or poster for every note, in a configurable image folder and size.
- A fixed property schema for books and for movies and series, described in the schema notes in `docs/schema/`.
- An existing note is never overwritten; a name clash is reported instead.
- Desktop and mobile.
