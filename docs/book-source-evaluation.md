# Book source evaluation

Why the book importer reads from the Deutsche Nationalbibliothek rather than
from Google Books or Open Library. Tested on 2026-09-19 against a sample of
nine actually-read titles: four self-published German SF audiobooks, two
German non-fiction titles, two German translations of English non-fiction,
and one English computing classic.

The two criteria were coverage of what is actually on the shelf, and whether
the source can fill the schema in
[`Book Template Conventions`](schema/Book%20Template%20Conventions.md) without
guesswork.

## Result

|                               | Google Books | Open Library | DNB (SRU)                  |
| ----------------------------- | ------------ | ------------ | -------------------------- |
| Open, non-commercial          | no           | yes          | yes                        |
| Usable without registration   | **no**       | yes          | yes                        |
| German editions in the sample | untested     | 1 of 9       | 9 of 9                     |
| Separate records per edition  | no           | partly       | yes                        |
| Audiobooks                    | no           | no           | yes                        |
| Series and volume number      | no           | no           | yes                        |
| Blurb                         | yes          | partly       | yes                        |
| Cover by ISBN                 | yes          | 17 %         | 64 %, ~100 % with fallback |

## Google Books: ruled out

Google Books has a real, documented REST API. But an anonymous request now
answers:

```
"quota_limit_value": "0", "quota_limit": "defaultPerDayPerProject"
```

The keyless daily quota is zero. Using it requires a Google Cloud project and
an API key, which puts a registration and a revocable credential between the
vault and its own data. Given that a better-fitting source exists, it was not
tested further.

## Open Library: ruled out for German editions

Open Library is genuinely open, has no key requirement and is pleasant to
query. It simply does not have these books.

Of the nine titles, one German edition was found (_Fakten sind auch nur
Meinungen_). _Praxisbuch Streetfotografie_, _Freiheitsschock_ and _Die
Känguru-Rebellion_ returned nothing at all. _Die 1%-Methode_ and _4000
Wochen_ exist only folded into the English works _Atomic Habits_ and _Four
Thousand Weeks_, with the German edition visible as a language code and
nothing more. A search for _The Mythical Man-Month_ returned a 1975 issue of
_American Film_.

Two structural problems compound the coverage gap. The search returns works
rather than editions, so an edition year, a German ISBN and a format cannot
be read off a result. And results are polluted by AI-generated "Summary of…"
and "Zusammenfassung:…" listings, which outnumber the real record for
popular titles.

Lookup by ISBN (`/isbn/<isbn>.json`) avoids both problems and does have
English-language editions the DNB does not collect, such as
`9781680507249` (_Become an Effective Software Engineering Manager_,
Pragmatic Bookshelf). That makes it a candidate fallback for titles outside
the DNB's remit, not a replacement.

## DNB: chosen

Germany's legal deposit library, queried over SRU with MARC21-XML. No key, no
registration, CC0 data.

Its remit is publications from Germany, German-language publications from
abroad and translations from German. An English original from a foreign
publisher is outside it and not found, however well-known.

It found every title in the sample, including the self-published Brandon Q.
Morris novels and their audiobook editions: roughly 190 records under that
author, with audiobooks explicitly marked _(Ungekürzte Lesung)_.

Decisively, it models exactly the distinction the schema is built on. A
single query for _Die Känguru-Rebellion_ returns four separate records:

| Edition                   | ISBN          | MARC 336 / 338                       | `type`      |
| ------------------------- | ------------- | ------------------------------------ | ----------- |
| Ullstein, 280 p.          | 9783548074108 | Text / Band                          | `book`      |
| Ullstein Ebooks           | 9783843737876 | Text / Online-Ressource              | `ebook`     |
| Hörbuch Hamburg, 6 CDs    | 9783957133373 | gesprochenes Wort / Audiodisk        | `audiobook` |
| Hörbuch Hamburg, download | 9783844944549 | gesprochenes Wort / Online-Ressource | `audiobook` |

Each carries its own ISBN and its own year, and all four carry
`Die Känguru-Werke / 5` in MARC 490: series name and volume number, which
neither other source had for anything.

Blurbs come from an undocumented but unauthenticated endpoint referenced in
each record's MARC 856 field:

```
https://services.dnb.de/plus/idn/<idn>/blurb/
```

It returns the publisher's German blurb. It sends no CORS header, which does
not matter to the plugin: `requestUrl` is not subject to CORS.

### What it costs

**Free-text search is unreliable.** `WOE=1%-Methode` returns 191 records;
`WOE=Methode Clear` returns none. Multi-word queries behave as phrases in ways
that are hard to predict, and a query containing a bare `.` errors out. An
ISBN lookup (`NUM=<isbn>`) sidesteps all of it and usually returns exactly one
record, which is why the import is ISBN-driven.

**Forthcoming editions.** The catalogue carries the Neuerscheinungsdienst, so
a title search can return editions dated a year or two ahead:
_Freiheitsschock_ currently leads with a 2027 paperback. Looking up the ISBN
from the copy in hand avoids this entirely.

**MARC artefacts.** Leading articles are wrapped in non-sorting markers
(`&#152;Das&#156; Tor`) and years appear as `[2024]`, `[2022?]` or
`Oktober 2024`. Both are mechanical to clean up.

## Covers

The DNB record page does show a cover. It is not the DNB's own: the portal
proxies the cover service of the MVB, the German book trade's metadata
agency, at

```
https://portal.dnb.de/opac/mvb/cover?isbn=<isbn13>&size=l
```

Unhyphenated ISBN-13 works, so no ISBN range table is needed. Sizes are `s`
(90×122), `m` (200×272) and `l` (442×599, also the default). An ISBN with no
cover on file answers with a clean 404. ISBN-10 is not supported.

This is by far the best source for German editions. Measured over the 29
ISBNs from the sample:

|                      | printed | e-book | audiobook | total    |
| -------------------- | ------- | ------ | --------- | -------- |
| MVB via DNB portal   | ~80 %   | 50 %   | 60 %      | **64 %** |
| Open Library by ISBN | 29 %    | 10 %   | 0 %       | 17 %     |

In **every** case in the sample where an edition's own ISBN had no cover,
another edition of the same work did: the Känguru-Rebellion e-book 404s
while its hardback answers, _4000 Wochen_ likewise. Falling back to the
sibling editions' ISBNs takes effective coverage on this sample to
essentially complete. The artwork is usually identical across formats; where
it is not (an audiobook or an illustrated edition), the fallback is still a
reasonable default that can be overridden by hand.

### Bot protection

`portal.dnb.de` sits behind Anubis, a proof-of-work bot filter. A request
that has not passed the challenge gets

```
HTTP 200  Content-Type: text/html   → "Dein Browser wird geprüft!"
```

Note the status: **200, not 403**. A downloader that only checks the status
code silently writes a 4.5 KB HTML challenge page into the vault as a JPEG.
Any cover fetch must therefore verify `Content-Type: image/*`, not just the
status.

`services.dnb.de`, which serves both SRU and the blurbs, is not behind it.

The filter challenges User-Agents that look like a browser (containing
`Mozilla`) and lets clients that name themselves through. Obsidian's default
User-Agent is browser-like, which is why the plugin sends its own name. That
is a policy, not a guarantee, so the `Content-Type` check stays: a change in
the filter becomes a visible message rather than a vault full of HTML files
named `.jpg`.

### Finding a sibling edition

The fallback does not need a title search. Each record links its other
manifestations in MARC 776: `$z` carries a sibling's ISBN, `$w` a sibling's
record number in the form `(DE-101)<idn>`. The record for _Die 1 % Methode_
points at both the audiobook and the online edition this way. Walking that
field is exact and cheap.

## Consequence for the workflow

This inverts the film workflow. There, an entry is picked by eye in the
browser because poster, year and plot are visible side by side. Here the ISBN
off the back of the book, the e-book's detail page or the audiobook's imprint
is both more precise and less work, and picking by eye would risk landing on
a forthcoming edition, of which the catalogue holds many.
