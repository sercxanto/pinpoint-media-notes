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
the DNB's remit, not a replacement. The later test of English-language
editions narrows that to covers; see
[English-language editions](#english-language-editions-fallback-sources).

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

## English-language editions: fallback sources

What to ask when the DNB does not find an ISBN. No fallback is implemented
yet; this section is the basis for one. Tested on 2026-10-11 against seven
English-language ISBNs from the shelf, two of which the DNB does have, with
raw responses from the Library of Congress (LoC) and Open Library.

- LoC: SRU, MARC21-XML,
  `http://lx2.loc.gov:210/lcdb?version=1.1&operation=searchRetrieve&query=bath.isbn=<isbn>&recordSchema=marcxml`
- LoC: `id.loc.gov`, BIBFRAME over HTTPS, the same records
- Open Library: `https://openlibrary.org/isbn/<isbn>.json`, plus the work
  and author records it points to
- Open Library covers:
  `https://covers.openlibrary.org/b/isbn/<isbn>-L.jpg?default=false`

### Coverage

| ISBN          | Title, edition                                          | DNB | LoC       | Open Library        | OL cover        |
| ------------- | ------------------------------------------------------- | --- | --------- | ------------------- | --------------- |
| 9781680507249 | _Become an Effective Software Engineering Manager_, pb. | –   | 1         | yes                 | yes             |
| 9781492082798 | _Software Engineering at Google_, pb.                   | –   | 1         | yes                 | yes             |
| 9781399615310 | _Think Like a Street Photographer_, Laurence King, 2023 | –   | 0         | –                   | –               |
| 9780596006105 | _Managing Projects with GNU Make_, 3rd ed.              | yes | 1         | yes, ISBN-10 record | yes             |
| 9781982167400 | _Building a Second Brain_, e-book                       | –   | 2 records | yes, no format      | no; sibling yes |
| 9780135957059 | _The Pragmatic Programmer_, 20th anniversary, hb.       | yes | 1         | yes, no authors     | yes             |
| 9781668233108 | _Other Worlds Than These_, e-book, 2026                 | –   | 0         | –                   | –               |

LoC and Open Library found the same five titles. Neither has one the other
lacks, so on this sample Open Library adds nothing as a record source, only
covers. The two titles neither has are explained below.

### Library of Congress

No key, no registration; LoC bibliographic data is in the public domain.
The same catalogue is reachable two ways, and both were tested:

- **SRU** at `lx2.loc.gov:210`, MARC21-XML, the DNB's protocol and format,
  so `book/marc.ts` would read it unchanged. About half a second per lookup.
  It answers **only over plain HTTP on port 210**; HTTPS on that port fails,
  and `https://lx2.loc.gov/lcdb` is a 404. Port 210 is the registered port
  of Z39.50, SRU's predecessor; the server is the LoC's Z39.50 gateway with
  an SRU front end.
- **`id.loc.gov`** over HTTPS, the LoC's linked-data service, in BIBFRAME.
  Chosen; see [Access over HTTPS](#access-over-https-idlocgov) below.

The fields below were first read from the SRU's MARC. They show what the
LoC catalogues; BIBFRAME carries the same cataloguing, already partly
cleaned up.

A lookup by an e-book ISBN returned **two records** for _Building a Second
Brain_: the e-book record, and the print record, which lists the e-book ISBN
in `020 $z`. `bath.isbn` matches `$z` as well as `$a`. The record to take is
the one whose `020 $a` holds the queried ISBN; that resolves it without the
record picker. The print record also carries two `020 $a` (hardcover and
paperback), so the note's `isbn` should be the queried ISBN when it is among
them, not the first one.

Field by field, against
[`Book Template Conventions`](schema/Book%20Template%20Conventions.md):

| Property         | LoC field                  | Found in | What it looks like                                                                                        |
| ---------------- | -------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `title`          | `245 $a`                   | 6 of 6   | `Software engineering at Google :`. ISBD punctuation at the end, **sentence case**                        |
| `original_title` | `240 $a`                   | 0 of 6   | absent on English originals, so the title, as with the DNB                                                |
| `authors`        | `100`, `700` with `$e`     | 6 of 6   | `Thomas, David,` `$e author.`; relator as English text in `$e`, never a code in `$4`                      |
| `year`           | `264 _1 $c`, else `260 $c` | 6 of 6   | `2019.`, `[2022]`, `c2005.`; the existing four-digit rule handles all                                     |
| `isbn`           | `020 $a`                   | 6 of 6   | `$q` qualifies (`(hardcover)`, `paperback`); other formats' ISBNs in `020 $z`                             |
| `series`         | `490 $a`, `830 $a`         | 1 of 6   | `The pragmatic programmers`, a publisher series                                                           |
| `series_index`   | `490 $v`, `830 $v`         | 0 of 6   | not in the sample                                                                                         |
| `type`           | `336`, `338`               | 6 of 6   | `text`/`txt`, `volume`/`nc`, `online resource`/`cr`                                                       |
| `description`    | `520 $a`                   | 4 of 6   | publisher copy in quotes, ending `"--` with `$c Provided by publisher.`, or `" -- Publisher description.` |
| `cover`          | none                       | –        | the LoC has no cover service                                                                              |
| `url`            | `010 $a` (LCCN)            | 6 of 6   | `https://lccn.loc.gov/<lccn>`, a permalink redirecting to the catalogue                                   |
| sibling editions | `776 $z`, `020 $z`         | 3 of 6   | the e-book record points at the hardcover's ISBN, as the DNB's 776 does                                   |

The differences from the DNB, each mechanical except the first:

**Titles are in sentence case**, not lower case: the first word and proper
names are capitalised, everything else follows normal English prose.
`Building a second brain`, `The pragmatic programmer, 20th anniversary
edition`, `Managing projects with GNU make`, `Software engineering at
Google`. That is the cataloguing rule (AACR2 and RDA alike: capitalise as
the language does in running text), not an error. The DNB follows the same
rule, which is invisible in German because nouns are capitalised anyway. It
cannot be undone without guessing: `Google` and `GNU` keep their capitals,
`make` does not. The title on the cover is in title case. Note also that
the anniversary edition statement sits in `245 $a`, not in `250`.

**ISBD punctuation.** `245 $a` ends with ` :` before a subtitle, ` /` before a
statement of responsibility, or `.`; names end with `,` or `.`. The DNB's
MARC omits this punctuation, the LoC's keeps it. A trailing-punctuation strip
handles it; a name ending in an initial (`Smith, John A.`) needs the period
kept.

**Leading articles** are marked by the second indicator of `245` (`4` for
`The `), not by the DNB's non-sorting characters. The schema keeps the
article in the title either way.

**Author roles** are English relator terms in `$e` (`author.`, `editor.`),
where the DNB uses codes in `$4` (`aut`). The 2005 record, catalogued under
AACR2, has no relator on any name, and its only `700` is a name-title entry
(`Oram, Andrew. $t Managing projects with Make.`) for the earlier edition,
not a co-author. A rule that fits all six records: take `100` and `700`
where `$e` starts with `author` or `$4` is `aut`, ignore `700` with a `$t`,
and where no name carries a relator, take `100` alone. That drops the editor
of the Stanier book and keeps both Pragmatic Programmer authors.

**Content and carrier type** are English terms in `$a`, but the codes in
`$b` (`txt`, `spw`; `nc`, `cr`) are the RDA codes, and **the DNB records
carry the same codes** (`Text`/`txt`, `Band`/`nc`). Mapping `type` on `$b`
works for both catalogues with one table. Even the 2005 AACR2 record has
336–338, added by an LoC batch update in 2025 (`955`); that is not
guaranteed for every older record.

**Descriptions** are quoted publisher copy with an attribution to strip. The
2005 record has no `520` but links a "Publisher description" page in `856`
under `loc.gov/catdir/enhancements/`; that page is a 404 now, so it is no
substitute for the DNB blurb endpoint.

**Series** from `490`/`830` are publisher series here, `The pragmatic
programmers`, without a volume number. They are written to `series` with an
empty `series_index`, as the importer already does for the DNB. No fiction
series was in the sample to test `$v`.

### Access over HTTPS: id.loc.gov

Two requests: a keyword search that returns record numbers, then one
document per record that bundles the instance (the edition), its work, the
names and the summary:

```
https://id.loc.gov/resources/instances/suggest2?q=<isbn13>&searchtype=keyword
https://id.loc.gov/resources/instances/<id>.cbd.json
```

The record numbers are the SRU's `001`. The search found the same five
ISBNs and missed the same two, including the hardcover of _Other Worlds Than
These_. Like the SRU, it also finds an ISBN that a record lists as another
format's: the _Building a Second Brain_ e-book gives two hits. The hits
carry no ISBN, so both documents must be fetched; the one to take lists the
queried ISBN without the `cancinv` status, which is how BIBFRAME carries
MARC `020 $z`. A document took 0.2 to 1.2 seconds. The plain
`<id>.bibframe.json` is smaller but holds only the instance: names, content
type and summary sit on the work, and names only as authority links, which
would mean a request per author. The HTML pages on this host sit behind a
Cloudflare challenge; the JSON endpoints answered every request without one.

The document is JSON-LD: a flat array of nodes linked by `@id`, which the
importer has to follow. What it holds, for all six records:

| Property         | BIBFRAME                                                                    | What it looks like                                                                   |
| ---------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `title`          | instance `title` → `mainTitle`                                              | `Software engineering at Google`; no ISBD punctuation, subtitle apart, sentence case |
| `authors`        | work `contribution` → `agent` label, where `role` is `aut`                  | `Thomas, David`, `Hunt, Andrew`; no trailing punctuation                             |
| `year`           | instance `provisionActivity` (`Publication`) → `date`                       | `2019`, `2005` as EDTF; `bflc:simpleDate` keeps `[2020]`, `c2005`                    |
| `isbn`           | instance `identifiedBy` → `Isbn` without status                             | ISBN-13 and ISBN-10 side by side; other formats' ISBNs carry `cancinv`               |
| `series`         | work `relation` with relationship `series` → `associatedResource` → `title` | `The pragmatic programmers`, twice: once as transcribed, once controlled             |
| `type`           | work `content`, instance `carrier`                                          | `txt`; `nc`, `cr`: the RDA codes as URIs                                             |
| `description`    | work `summary` → label                                                      | the `520` text, quotes and attribution included                                      |
| `url`            | instance `identifiedBy` → `Lccn`                                            | `  2019944178`, leading spaces kept                                                  |
| sibling editions | `cancinv` ISBNs; work `relation` `otherphysicalformat`                      | the e-book lists the hardcover's ISBN, as MARC `020 $z` did                          |

BIBFRAME settles three of the MARC problems on its own. Titles and names
come without ISBD punctuation. Roles are codes, and the conversion has
assigned `aut` even in the 2005 AACR2 record, which had no relator at all;
its name-title entry for the earlier edition is a separate `relatedwork`,
not a contribution. Years come as a clean EDTF date. Sentence case remains:
it is the cataloguing, not the format.

Not seen in the sample: a series number (`seriesEnumeration`), an audiobook,
and `original_title` for a translation; a record in BIBFRAME carries the
uniform title as a work title, untested.

### Open Library

As a record source it is weaker than the LoC on every field the LoC has:

- **authors**: the edition points to author records, one request each, which
  give `Titus Winters`, not `Winters, Titus`. Inverting names is guesswork
  (`Robert William Mecklenburg`). The Pragmatic Programmer edition has **no
  authors at all**; they are only on the work, another request.
- **year**: `publish_date` is free text (`09/15/2019`, `Mar 17, 2020`, `2021`)
  and can be wrong: the Stanier book is `2021` in Open Library, `[2020]` and
  `©2020` in the LoC record and on the imprint.
- **type**: `physical_format` is free text (`Hardcover`, `paperback`) and
  missing on three of five editions, including the _Building a Second Brain_
  e-book. An e-book cannot be recognised.
- **series**: none on any edition.
- **description**: on one edition of five. Work records have more, but a
  work description can belong to another edition: the Pragmatic Programmer
  work describes an audiobook ("one of those rare tech audiobooks").
- **title**: split into `title` and `subtitle`, in title case where the
  record came from a retailer feed (`source_records` `amazon:`, `bwb:`), in
  sentence case where it came from LoC MARC (`Managing projects with GNU
make`).

A lookup by ISBN-13 finds a record that carries only an ISBN-10. A miss is
an HTTP 404 with an HTML page, not JSON; a hit is a 302 to
`/books/<id>.json`.

**Covers** are where it earns its place. By ISBN with `default=false`, four
of the five editions it has answered with a JPEG of about 380×500; a missing
cover is a clean 404. The fifth, the _Building a Second Brain_ e-book, has
none, but the hardcover ISBN that the LoC record names in `776 $z` does:
the same sibling fallback as with the DNB takes coverage to five of five.

### The two titles nobody has

**9781668233108** is the EPUB of _Other Worlds Than These: A Talisman
Novel_ by Stephen King and Peter Straub, Scribner, published on 2026-10-06,
five days before the test. Not an audiobook. Neither the LoC nor Open
Library has the e-book ISBN; the LoC does not have the hardcover
(9781668233092) either, by ISBN or by title. Open Library has a work with the
hardcover and a Portuguese edition, user-entered, without the e-book. The
LoC does catalogue Simon & Schuster e-books before publication: the
_Building a Second Brain_ e-book record (Atria, also Simon & Schuster) came
from the pre-publication programme (`906 $e ecip`) two months ahead. So this
is most likely a matter of time, but that cannot be confirmed from here; the
lookup is worth repeating in a few weeks.

**9781399615310** is _Think Like a Street Photographer_ by Matt Stuart, with
a foreword by Derren Brown, Laurence King, London, 2023. The author is Stuart
alone; Brown is not an author for `authors`. The LoC has it neither by ISBN
nor by title, and does not have the earlier Laurence King ISBN
(9781786277282) either. The British Library has it, through legal deposit.

Yes, a British edition is outside the LoC in principle, in the same way an
English original is outside the DNB. The LoC's pre-publication cataloguing
is for US publishers; foreign books it acquires selectively. Every LoC hit
in this sample is a US publisher or a US arm (O'Reilly lists `Beijing ;
Boston`). A British-only edition would need the British Library, whose
catalogue was not tested as an API.

### Recommendation

**Order:** DNB, then the LoC through `id.loc.gov`, then nothing. A miss in both is reported as now,
and the note is made by hand from
[`Book Template`](schema/Book%20Template.md). Open Library supplies the
title and the cover, nothing else: on this sample it found no edition the
LoC did not, and it is worse on authors, year, type and series.

**Fields:**

| Property         | From                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| `title`          | Open Library edition `title` if the edition exists, else LoC instance `mainTitle`                      |
| `original_title` | the title; a translation's uniform title is untested                                                   |
| `authors`        | LoC contributions with role `aut`, agent label as catalogued                                           |
| `year`           | LoC publication `date`, first four digits                                                              |
| `isbn`           | the queried ISBN, as found among the instance's ISBNs without status                                   |
| `series`         | LoC `series` relation, first title                                                                     |
| `series_index`   | LoC `seriesEnumeration`, untested                                                                      |
| `type`           | LoC content and carrier codes (`txt`, `spw`; `nc`, `cr`), one table shared with the DNB's 336/338 `$b` |
| `description`    | LoC `summary`, quotes and attribution removed; no second source                                        |
| `cover`          | Open Library by ISBN, then by the instance's `cancinv` ISBNs                                           |
| `url`            | `https://lccn.loc.gov/<lccn>`, trimmed                                                                 |

The Open Library title is in title case wherever the record came from a
retailer feed, and in all five it carried neither subtitle nor edition
statement, which is what the schema wants: `The Pragmatic Programmer`, not `The
pragmatic programmer, 20th anniversary edition`. Where Open Library took its
record from LoC MARC, its title is in sentence case as well (Mecklenburg);
that is no worse than the LoC alone. Taking the title costs one more request
per book, to the edition lookup the cover does not need.

Covers keep the `Content-Type: image/*` check; Open Library sits behind no
bot filter in this test, but the rule costs nothing.

**New hosts** for the README's network table: `id.loc.gov` for the record,
`openlibrary.org` for the title and `covers.openlibrary.org` for covers. All
three over HTTPS.

**Decided** (2026-10-11): HTTPS through `id.loc.gov` rather than plain HTTP
to the SRU server, at the cost of a second request and a BIBFRAME mapping
of its own; the title from Open Library; publisher series written to
`series`.

### Input: ISBN only

For the DNB, the import also takes a `d-nb.info` link, so that an edition
can be picked by eye in the web catalogue. The LoC fallback takes **no
link**; English-language editions are imported by ISBN alone. Decided on
2026-10-11.

The LoC's web catalogue at `search.catalog.loc.gov` is EBSCO Locate, a
single-page app; the older `catalog.loc.gov` answers automated requests
with a Cloudflare challenge. Its record pages live at `/instances/<id>`.
Whether `<id>` is the LoC record number could not be checked: the page is
built in the browser, and the API behind it does not answer without
credentials. If it is the system's internal id, a link could not be
resolved without that API.

Picking by eye also buys little here. It exists for the DNB because one
work there has separate records for print, e-book and audiobook, and the
catalogue includes forthcoming editions. In this sample the LoC had one
record per title, with only a single e-book record of its own and no
audiobook. Where English-language editions fail, they fail by not being
catalogued at all, which no link fixes. The ISBN on the copy names exactly
one edition.

Should a link be wanted later, the cheap form is the LCCN permalink,
`https://lccn.loc.gov/<lccn>`, and the catalogue's LCCN search
`search.catalog.loc.gov/search?option=lccn&query=<lccn>`. The `id.loc.gov`
keyword search finds a record by its LCCN as it does by ISBN
(`2021443590` gives `22483650`), so neither a new host nor a new request
would be needed.
