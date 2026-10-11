# Plan: Library of Congress fallback

When the DNB has no record for an ISBN, look the ISBN up at the Library of
Congress (LoC), take the title and the cover from Open Library, and import
the note from that. The evaluation behind it, with every field and the
decisions taken, is the section _English-language editions: fallback
sources_ in `docs/book-source-evaluation.md`. Read that section before any
phase; this plan does not repeat it.

One session per phase. Each phase ends with `npm run check` passing, this
file updated (status, notes), `AGENTS.md`, `docs/SPEC.md`, `README.md` and
`docs/MANUAL_TEST.md` updated where the phase affects them, and a report to
the maintainer, who reviews the uncommitted diff and asks for the commit.
When all phases are done, this file is removed and what stays relevant moves
to `AGENTS.md`.

Status values: `open`, `in progress`, `review` (done, waiting for the
maintainer), `done` (committed).

| Phase | Content                                                         | Status |
| ----- | --------------------------------------------------------------- | ------ |
| 1     | Spec: the fallback's behaviour, open decisions settled          | done   |
| 2     | Refactor, no behaviour change: source-neutral record, RDA codes | open   |
| 3     | LoC client and mapping over `id.loc.gov`                        | open   |
| 4     | Open Library: title and cover                                   | open   |
| 5     | Wiring into the importer; README, manual test                   | open   |

## Settled (2026-10-11)

- Order: DNB, then LoC, then nothing. A miss in both is reported as now.
- LoC through `id.loc.gov` over HTTPS, not the SRU server
  (`lx2.loc.gov:210`, plain HTTP only). Search
  `/resources/instances/suggest2?q=<isbn13>&searchtype=keyword`, then
  `/resources/instances/<id>.cbd.json` per hit. Not `<id>.bibframe.json`:
  it lacks the work, the names and the summary.
- `title` from the Open Library edition if it exists, else the LoC
  `mainTitle`. LoC titles are in sentence case by cataloguing rule.
- Publisher series (`The pragmatic programmers`) are written to `series`.
- The LoC fallback takes an ISBN only, no link.
- New hosts: `id.loc.gov`, `openlibrary.org`, `covers.openlibrary.org`.

Settled in phase 1 (2026-10-11), written into `docs/SPEC.md`:

- Ten characters: DNB by ISBN, then LoC by ISBN, then DNB by record number.
  Only a clean DNB miss falls back; a failed lookup (DNB or LoC) fails the
  entry.
- An ISBN that a record lists only as `cancinv` is a miss; the message names
  that record. Several records that count go to the record picker.
- Open Library covers for DNB records: no.
- One User-Agent for all five book hosts, the DNB included:
  `pinpoint-media-notes (Obsidian plugin; +https://github.com/sercxanto/pinpoint-media-notes)`.
- Cover size `s`/`m`/`l` maps to Open Library's `S`/`M`/`L`.

## Phase 1: spec

Write the fallback into `docs/SPEC.md` (book import) before any code, so the
maintainer can settle the behaviour on paper. Present the open points below
to the maintainer with a recommendation each; record the answers in the
spec, with the reason where it is not obvious.

Open points:

- **Which inputs fall back.** An ISBN, surely. A 10-character input that is
  read as ISBN first and as DNB record number second: is the LoC asked
  before or after the record-number reading, or not at all?
- **Report.** The message should say the record came from the LoC, so a
  user knows why the title or the description is English.
- **Several LoC records.** Rule from the evaluation: take the record that
  lists the queried ISBN without the `cancinv` status. If that leaves more
  than one, the record picker as for the DNB; its `d-nb.info` link becomes
  the record's own URL.
- **Description.** The LoC summary is quoted publisher copy with an
  attribution, either `"…"-- Provided by publisher.` or
  `"…" -- Publisher description.` Strip both, then the existing one-line
  and truncation rules.
- **Covers for DNB records.** Should Open Library also become the last
  cover fallback for DNB records, after the MVB chain? Not part of the
  evaluation; ask.
- **User-Agent.** Send `pinpoint-media-notes (Obsidian plugin)` to the new
  hosts too? Open Library asks API clients to identify themselves.
- **Network table** in the spec and the README, with what each new host
  receives (the ISBN; for `id.loc.gov` also the record number).

## Phase 2: refactor

No behaviour change; the existing tests must pass unchanged, except where a
test names an internal that is renamed.

- **`BookRecord` source-neutral.** Today it carries DNB specifics: `idn`,
  `blurbUrl`, `otherEditionIdns`, and `describeRecord` builds a `d-nb.info`
  link. Introduce what both sources need (a record URL, sibling ISBNs, a
  source tag for messages) and keep the DNB-only parts where only the DNB
  path reads them. Keep `BOOK_RECORD_SOURCES` and the field-coverage test
  meaningful; a second source table for the LoC follows in phase 3.
- **`type` from RDA codes.** Map content type `336 $b` (`txt`, `spw`) and
  carrier type `338 $b` (`nc`, `cr`, …) instead of the German terms in `$a`.
  The DNB fixtures carry the codes (`Text`/`txt`, `Band`/`nc`); the LoC uses
  the same codes. Check every DNB fixture, including the five Känguru
  editions, before switching; keep `$a` for the `media` text in messages.
  Decide with the maintainer whether `$a` stays as a fallback when `$b` is
  missing.

## Phase 3: LoC client and mapping

- `src/book/loc.ts` (or similar): search and record fetch over `HttpGet`.
  The search response is JSON (`application/x-suggestions+json`); its
  `hits[].token` is the record number.
- A JSON-LD reader for the `cbd.json` document: a flat array of nodes linked
  by `@id`, blank nodes included. Mapping per the evaluation's table:
  instance `title` → `mainTitle`; work `contribution` with role `aut` →
  agent `rdfs:label`; publication `date`; instance ISBNs and their `cancinv`
  status; work `relation` of relationship `series`; work `content`, instance
  `carrier`; work `summary`; instance `Lccn` (leading spaces) for
  `https://lccn.loc.gov/<lccn>`.
- Pure functions, no `obsidian` import, tested against fixtures.
- **Fixtures** in `tests/fixtures/loc/`: fetch fresh `cbd.json` documents and
  search responses. LoC data is public domain, so real records may go in,
  but **replace every summary with invented text** (AGENTS.md: no real
  copyrighted text). Good picks from the evaluation:
  - `22483650` _Software engineering at Google_: three authors, no summary.
  - `22953559` Stanier: an editor to drop, a publisher series, a summary.
  - `13978713` Mecklenburg 2005: AACR2, a `relatedwork` that is no author.
  - `22339234` and `22338086` _Building a second brain_: the e-book ISBN
    hits both; the `cancinv` rule picks the e-book record.
  - a search response with no hits (e.g. `9781399615310`).
- **Contract test** for the shape of both responses, typed like
  `tests/contract/book-shape.ts`, opt-in as the others.
- Not covered by the sample, so test what the fixtures cannot: a series
  number (`seriesEnumeration`), an audiobook (`spw`), a translation's
  original title. Look for a real LoC record of each before inventing one.

## Phase 4: Open Library

- Edition by ISBN: `https://openlibrary.org/isbn/<isbn>.json`. A hit is a
  302 to `/books/<id>.json` (check that `requestUrl` follows it); a miss is
  a 404 with an HTML body, not JSON.
- Only `title` is read. Not `subtitle`, not the authors, dates or format:
  the evaluation found them weaker than the LoC's.
- Cover: `https://covers.openlibrary.org/b/isbn/<isbn>-L.jpg?default=false`,
  then the same for each sibling ISBN (`cancinv` ISBNs of the LoC record).
  A miss is a clean 404. Keep the `Content-Type: image/*` check. Decide in
  phase 1 how the cover size setting maps (`-S`, `-M`, `-L`).
- Fixtures: edition JSON is CC0 data, but drop any `description` and
  `notes` text before committing.

## Phase 5: wiring and documentation

- Importer: after a DNB miss for an ISBN, the LoC path, in the per-entry
  order the spec defines (collision check before any download).
- Messages as settled in phase 1.
- README: input, field mapping table for LoC records, covers, messages,
  network table, the English-language limitation (British-only editions and
  very new releases are found nowhere).
- `docs/MANUAL_TEST.md`: an LoC import with cover, one from the sibling
  cover, one found nowhere, on desktop and if possible mobile.
- `AGENTS.md`: architecture (`loc.ts`, Open Library module, fixtures),
  decisions worth keeping. Then remove this file.

## Notes

**Phase 1.** The spec describes the target; the LoC section and the
User-Agent paragraph carry a "not yet implemented" note pointing here.
Remove both notes in phase 5. The User-Agent change for the DNB hosts
belongs to phase 3 (one shared header constant, e.g. in `io/http.ts`); keep
the DNB contract test for the bot filter green with the new value, and
update the README's network section in phase 5. The TMDB hosts keep
Obsidian's default User-Agent (settled 2026-10-11).
Proposals written into the spec without a separate question, open for the
maintainer's review of the diff: no LoC fallback after a failed DNB lookup;
at most ten LoC hits fetched; `url` falls back to the `id.loc.gov` record
when there is no LCCN; `original_title` is the `title` value (Open Library
title where there is one); the summary's quotes and attribution are removed
only when it has exactly that form; an Open Library 404 is silent, other
failures are reported.
