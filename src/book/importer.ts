import { EntryError, reasonOf } from "../core/errors";
import { IMAGE_EXTENSIONS } from "../core/images";
import { requireVaultFolder } from "../core/paths";
import type { HttpGet } from "../io/http";
import type { VaultFiles } from "../io/vault";
import { SETTING_NAMES, type CoverSize, type PinpointSettings } from "../settings";
import type { CoverResult } from "./cover";
import { fetchBlurb, fetchCover, searchCatalogue } from "./dnb";
import { dnbRecordUrl, readDnbRecord, recordIsbn, type DnbRecord } from "./dnb-record";
import { parseBookInput, type BookQuery } from "./input";
import { fetchLocRecord, searchLoc } from "./loc";
import { matchLocRecords, type LocRecord } from "./loc-record";
import { bookNote, bookStem } from "./note";
import { fetchOpenLibraryCover, fetchOpenLibraryTitle } from "./openlibrary";
import type { BookRecord } from "./record";

export interface BookImportConfig {
	notesDir: string;
	assetsDir: string;
	coverSize: CoverSize;
}

/** Checks the settings before any work; throws a ConfigError naming the setting. */
export function bookImportConfig(settings: PinpointSettings): BookImportConfig {
	return {
		notesDir: requireVaultFolder(SETTING_NAMES.bookNotesDir, settings.bookNotesDir),
		assetsDir: requireVaultFolder(SETTING_NAMES.assetsDir, settings.assetsDir),
		coverSize: settings.coverSize,
	};
}

export interface BookImportDeps {
	http: HttpGet;
	files: VaultFiles;
	config: BookImportConfig;
	/**
	 * Called when a lookup returns several records: resolves to the chosen
	 * one, or null to skip the entry.
	 */
	chooseRecord<T extends BookRecord>(records: T[]): Promise<T | null>;
}

export interface BookImportResult {
	notePath: string;
	/** Vault path of the cover, or null if the note has none. */
	coverPath: string | null;
	/** One-line report for the user. */
	message: string;
}

/**
 * Imports one entry, in the fixed order: parse, look up (DNB, then the LoC
 * for an ISBN the DNB has no record for), the Open Library title of an LoC
 * record, name and check for a collision, fetch the blurb, get the cover (or
 * reuse an existing file), write the note last. Per-entry problems throw an
 * EntryError.
 */
export async function importBook(input: string, deps: BookImportDeps): Promise<BookImportResult> {
	const { http, files, config } = deps;
	const report: string[] = [];

	const query = parseBookInput(input);
	const lookup = await lookUp(http, query);
	if (lookup.note) report.push(lookup.note);

	const chosen =
		lookup.records.length === 1 ? lookup.records[0] : await chooseRecord(deps, lookup);
	if (!chosen) throw new EntryError(`Skipped ${input.trim()}: no record chosen.`);
	if (chosen.type === null) {
		throw new EntryError(
			`Skipped "${chosen.title}": unsupported material (${chosen.media}). Only books, e-books and audiobooks are imported.`,
		);
	}
	const type = chosen.type;

	let book: DnbRecord | LocRecord = chosen;
	if (book.catalogue === "loc") {
		const titled = await withOpenLibraryTitle(http, book);
		book = titled.book;
		report.push(titled.message);
	}

	const stem = bookStem(book, type);
	const notePath = `${config.notesDir}/${stem}.md`;
	if (await files.exists(notePath)) {
		throw new EntryError(`Skipped: "${notePath}" already exists.`);
	}

	let description = "";
	if (book.catalogue === "loc") {
		description = book.description ?? "";
	} else if (book.blurbUrl !== null) {
		const blurb = await fetchBlurb(http, book.blurbUrl);
		if (blurb.ok) description = blurb.text;
		else report.push(`No description: ${blurb.reason}.`);
	}

	const cover = await provideCover(deps, book, stem);
	report.push(cover.message);

	try {
		await files.ensureFolder(config.notesDir);
		await files.createNote(notePath, bookNote(book, type, description, cover.path));
	} catch (error) {
		const reason = reasonOf(error);
		throw new EntryError(`Could not create "${notePath}": ${reason}`);
	}

	return {
		notePath,
		coverPath: cover.path,
		message: [`Created "${notePath}".`, ...report].join(" "),
	};
}

type Lookup = (
	{ catalogue: "dnb"; records: DnbRecord[] } | { catalogue: "loc"; records: LocRecord[] }
) & {
	/** How the input was read and where the record comes from, for the report. */
	note?: string;
};

/** The picker is typed per catalogue, so the chosen record keeps its own fields. */
function chooseRecord(deps: BookImportDeps, lookup: Lookup): Promise<DnbRecord | LocRecord | null> {
	return lookup.catalogue === "dnb"
		? deps.chooseRecord(lookup.records)
		: deps.chooseRecord(lookup.records);
}

const FROM_LOC = "Not in the DNB; record from the Library of Congress";

/**
 * DNB by ISBN, LoC by ISBN, and for ten characters DNB by record number
 * last. Only a DNB miss goes on to the next step; a failed lookup throws.
 */
async function lookUp(http: HttpGet, query: BookQuery): Promise<Lookup> {
	switch (query.kind) {
		case "isbn": {
			const dnb = await searchCatalogue(http, "NUM", query.isbn);
			if (dnb.length > 0) return { catalogue: "dnb", records: dnb.map(readDnbRecord) };
			const loc = await lookUpLoc(http, query.isbn);
			if (loc.matches.length > 0) {
				return { catalogue: "loc", records: loc.matches, note: `${FROM_LOC}.` };
			}
			throw new EntryError(
				`No catalogue record for ISBN ${query.isbn}, neither at the DNB nor at the Library of Congress.` +
					otherFormatNote(loc.otherFormat),
			);
		}
		case "idn": {
			const records = await searchCatalogue(http, "IDN", query.idn);
			if (records.length === 0) {
				throw new EntryError(`No catalogue record with record number ${query.idn}.`);
			}
			return { catalogue: "dnb", records: records.map(readDnbRecord) };
		}
		case "isbn-or-idn": {
			const asIsbn = `Read ${query.idn} as ISBN ${query.isbn}.`;
			const byIsbn = await searchCatalogue(http, "NUM", query.isbn);
			if (byIsbn.length > 0) {
				return { catalogue: "dnb", records: byIsbn.map(readDnbRecord), note: asIsbn };
			}
			const loc = await lookUpLoc(http, query.isbn);
			if (loc.matches.length > 0) {
				return { catalogue: "loc", records: loc.matches, note: `${asIsbn} ${FROM_LOC}.` };
			}
			const byIdn = await searchCatalogue(http, "IDN", query.idn);
			if (byIdn.length > 0) {
				return {
					catalogue: "dnb",
					records: byIdn.map(readDnbRecord),
					note: `Read ${query.idn} as a DNB record number.`,
				};
			}
			throw new EntryError(
				`No catalogue record for ${query.idn}, neither as ISBN ${query.isbn} (DNB, Library of Congress) nor as a DNB record number.` +
					otherFormatNote(loc.otherFormat),
			);
		}
	}
}

/** Every search hit fetched, then matched against the ISBN (the `cancinv` rule). */
async function lookUpLoc(
	http: HttpGet,
	isbn13: string,
): Promise<{ matches: LocRecord[]; otherFormat: LocRecord[] }> {
	const records: LocRecord[] = [];
	for (const id of await searchLoc(http, isbn13)) {
		records.push(await fetchLocRecord(http, id));
	}
	return matchLocRecords(records, isbn13);
}

/** Names the LoC records that list the ISBN only as another format's. */
function otherFormatNote(records: LocRecord[]): string {
	if (records.length === 0) return "";
	const urls = records.map((record) => record.url).join(", ");
	return records.length === 1
		? ` The LoC record ${urls} lists it only as another format's ISBN; it describes a different edition.`
		: ` The LoC records ${urls} list it only as another format's ISBN; they describe different editions.`;
}

/**
 * The Open Library edition's title replaces the LoC title, and the original
 * title too where that is the LoC title (no translation). A miss keeps the
 * LoC title; a failure keeps it and is reported.
 */
async function withOpenLibraryTitle(
	http: HttpGet,
	book: LocRecord,
): Promise<{ book: LocRecord; message: string }> {
	const result =
		book.isbn === null
			? ({ kind: "none" } as const)
			: await fetchOpenLibraryTitle(http, book.isbn);
	switch (result.kind) {
		case "title":
			return {
				book: {
					...book,
					title: result.title,
					originalTitle:
						book.originalTitle === book.title ? result.title : book.originalTitle,
				},
				message: "Title from Open Library.",
			};
		case "none":
			return { book, message: "Title from the Library of Congress." };
		case "failed":
			return {
				book,
				message: `Title from the Library of Congress: ${result.reason}.`,
			};
	}
}

interface CoverOutcome {
	path: string | null;
	message: string;
}

/**
 * Reuses an existing image of the target name; otherwise downloads the first
 * cover along the fallback chain, stored under the note's own name.
 */
async function provideCover(
	deps: BookImportDeps,
	book: DnbRecord | LocRecord,
	stem: string,
): Promise<CoverOutcome> {
	const { files, config } = deps;

	// The extension comes from the response, so an existing file is looked
	// for under each accepted one before any download.
	for (const extension of IMAGE_EXTENSIONS) {
		const path = `${config.assetsDir}/${stem}.${extension}`;
		if (await files.exists(path))
			return { path, message: `Kept the existing cover "${path}".` };
	}

	const found = await findCover(deps, book);
	if (!found.ok) return { path: null, message: `No cover: ${found.reason}.` };

	const path = `${config.assetsDir}/${stem}.${found.extension}`;
	try {
		await files.ensureFolder(config.assetsDir);
		await files.createBinary(path, found.data);
	} catch (error) {
		const reason = reasonOf(error);
		throw new EntryError(`Could not save the cover "${path}": ${reason}`);
	}
	return { path, message: coverMessage(book.catalogue, found.source) };
}

/** Where a candidate ISBN came from. */
type CoverSource =
	| { kind: "own"; isbn: string }
	| { kind: "isbn"; isbn: string }
	| { kind: "record"; isbn: string; idn: string };

type FoundCover =
	| { ok: true; data: ArrayBuffer; extension: string; source: CoverSource }
	| { ok: false; reason: string };

/**
 * Tries the candidates in order until one is an image: for a DNB record from
 * the MVB, for an LoC record from Open Library. Stops early when the server
 * serves no covers at all (bot check, errors), because asking for other
 * ISBNs would meet the same answer.
 */
async function findCover(deps: BookImportDeps, book: DnbRecord | LocRecord): Promise<FoundCover> {
	const { http, config } = deps;
	const tried: { isbn: string; reason: string }[] = [];
	const unresolved: string[] = [];

	const [candidates, fetch]: [
		AsyncIterable<CoverSource> | Iterable<CoverSource>,
		(isbn13: string) => Promise<CoverResult>,
	] =
		book.catalogue === "dnb"
			? [
					dnbCoverCandidates(http, book, unresolved),
					(isbn13) => fetchCover(http, isbn13, config.coverSize),
				]
			: [
					isbnCandidates(book),
					(isbn13) => fetchOpenLibraryCover(http, isbn13, config.coverSize),
				];

	for await (const source of candidates) {
		const cover = await fetch(source.isbn);
		if (cover.ok) return { ...cover, source };
		if (cover.failure === "blocked") return cover;
		tried.push({ isbn: source.isbn, reason: cover.reason });
	}

	const lookups = unresolved.map((idn) => `, ${dnbRecordUrl(idn)} could not be looked up`);
	if (tried.length === 0) {
		const links =
			book.otherEditionIsbns.length +
			(book.catalogue === "dnb" ? book.otherEditionIdns.length : 0);
		const reason =
			links === 0
				? "the record has no ISBN"
				: "neither the record nor its other editions have an ISBN";
		return { ok: false, reason: reason + lookups.join("") };
	}
	if (tried.length === 1 && tried[0]) {
		return { ok: false, reason: tried[0].reason + lookups.join("") };
	}
	const isbns = tried.map((attempt) => attempt.isbn).join(", ");
	return {
		ok: false,
		reason: `the cover server has no usable cover for ISBN ${isbns}${lookups.join("")}`,
	};
}

/**
 * The record's own ISBN, then the other editions' it lists, each once: the
 * whole chain for an LoC record (its `cancinv` ISBNs), the start of it for a
 * DNB record (`776 $z`).
 */
function* isbnCandidates(book: BookRecord, seen = new Set<string>()): Generator<CoverSource> {
	if (book.isbn !== null && !seen.has(book.isbn)) {
		seen.add(book.isbn);
		yield { kind: "own", isbn: book.isbn };
	}
	for (const isbn of book.otherEditionIsbns) {
		if (seen.has(isbn)) continue;
		seen.add(isbn);
		yield { kind: "isbn", isbn };
	}
}

/**
 * The DNB chain: {@link isbnCandidates}, then the ISBN of each record linked
 * in `776 $w`. Linked records are looked up only when the earlier candidates
 * are used up; a failed lookup is recorded in `unresolved` and skipped.
 */
async function* dnbCoverCandidates(
	http: HttpGet,
	book: DnbRecord,
	unresolved: string[],
): AsyncGenerator<CoverSource> {
	const seen = new Set<string>();
	yield* isbnCandidates(book, seen);
	for (const idn of book.otherEditionIdns) {
		let isbn: string | null;
		try {
			const [linked] = await searchCatalogue(http, "IDN", idn);
			isbn = linked ? recordIsbn(linked) : null;
		} catch (error) {
			if (!(error instanceof EntryError)) throw error;
			unresolved.push(idn);
			continue;
		}
		if (isbn === null || seen.has(isbn)) continue;
		seen.add(isbn);
		yield { kind: "record", isbn, idn };
	}
}

/**
 * Names the source, and flags a cover taken from another edition. Open
 * Library is named; the MVB, the DNB's cover source, is the default.
 */
function coverMessage(catalogue: BookRecord["catalogue"], source: CoverSource): string {
	const from = catalogue === "loc" ? `Cover from Open Library, ISBN` : `Cover from ISBN`;
	switch (source.kind) {
		case "own":
			return `${from} ${source.isbn}.`;
		case "isbn":
			return `${from} ${source.isbn}, another edition; its artwork may differ.`;
		case "record":
			return `${from} ${source.isbn}, another edition (${dnbRecordUrl(source.idn)}); its artwork may differ.`;
	}
}
