import { EntryError } from "../core/errors";
import { requireVaultFolder } from "../core/paths";
import type { HttpGet } from "../io/http";
import type { VaultFiles } from "../io/vault";
import type { CoverSize, PinpointSettings } from "../settings";
import { COVER_EXTENSIONS, fetchBlurb, fetchCover, searchCatalogue } from "./dnb";
import { parseBookInput, type BookQuery } from "./input";
import type { MarcRecord } from "./marc";
import { bookNote, bookStem } from "./note";
import { readBookRecord, recordIsbn, type BookRecord } from "./record";

export interface BookImportConfig {
	notesDir: string;
	assetsDir: string;
	coverSize: CoverSize;
}

/** Checks the settings before any work; throws a ConfigError naming the setting. */
export function bookImportConfig(settings: PinpointSettings): BookImportConfig {
	return {
		notesDir: requireVaultFolder("Book notes folder", settings.bookNotesDir),
		assetsDir: requireVaultFolder("Image folder", settings.assetsDir),
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
	chooseRecord(records: BookRecord[]): Promise<BookRecord | null>;
}

export interface BookImportResult {
	notePath: string;
	/** Vault path of the cover, or null if the note has none. */
	coverPath: string | null;
	/** One-line report for the user. */
	message: string;
}

/**
 * Imports one entry, in the fixed order: parse, look up, name and check for
 * a collision, fetch the blurb, get the cover (or reuse an existing file),
 * write the note last. Per-entry problems throw an EntryError.
 */
export async function importBook(input: string, deps: BookImportDeps): Promise<BookImportResult> {
	const { http, files, config } = deps;
	const report: string[] = [];

	const query = parseBookInput(input);
	const lookup = await lookUp(http, query);
	if (lookup.note) report.push(lookup.note);

	const books = lookup.records.map(readBookRecord);
	const book = books.length === 1 ? books[0] : await deps.chooseRecord(books);
	if (!book) throw new EntryError(`Skipped ${input.trim()}: no record chosen.`);
	if (book.type === null) {
		throw new EntryError(
			`Skipped "${book.title}": unsupported material (${book.media}). Only books, e-books and audiobooks are imported.`,
		);
	}
	const type = book.type;

	const stem = bookStem(book, type);
	const notePath = `${config.notesDir}/${stem}.md`;
	if (await files.exists(notePath)) {
		throw new EntryError(`Skipped: "${notePath}" already exists.`);
	}

	let description = "";
	if (book.blurbUrl !== null) {
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
		const reason = error instanceof Error ? error.message : String(error);
		throw new EntryError(`Could not create "${notePath}": ${reason}`);
	}

	return {
		notePath,
		coverPath: cover.path,
		message: [`Created "${notePath}".`, ...report].join(" "),
	};
}

interface Lookup {
	records: MarcRecord[];
	/** How an ambiguous input was read, for the report. */
	note?: string;
}

async function lookUp(http: HttpGet, query: BookQuery): Promise<Lookup> {
	switch (query.kind) {
		case "isbn": {
			const records = await searchCatalogue(http, "NUM", query.isbn);
			if (records.length === 0)
				throw new EntryError(`No catalogue record for ISBN ${query.isbn}.`);
			return { records };
		}
		case "idn": {
			const records = await searchCatalogue(http, "IDN", query.idn);
			if (records.length === 0) {
				throw new EntryError(`No catalogue record with record number ${query.idn}.`);
			}
			return { records };
		}
		case "isbn-or-idn": {
			const byIsbn = await searchCatalogue(http, "NUM", query.isbn);
			if (byIsbn.length > 0) {
				return { records: byIsbn, note: `Read ${query.idn} as ISBN ${query.isbn}.` };
			}
			const byIdn = await searchCatalogue(http, "IDN", query.idn);
			if (byIdn.length > 0) {
				return { records: byIdn, note: `Read ${query.idn} as a DNB record number.` };
			}
			throw new EntryError(
				`No catalogue record for ${query.idn}, neither as ISBN ${query.isbn} nor as a DNB record number.`,
			);
		}
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
	book: BookRecord,
	stem: string,
): Promise<CoverOutcome> {
	const { files, config } = deps;

	for (const extension of COVER_EXTENSIONS) {
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
		const reason = error instanceof Error ? error.message : String(error);
		throw new EntryError(`Could not save the cover "${path}": ${reason}`);
	}
	return { path, message: coverMessage(found.source) };
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
 * Tries the edition's own ISBN, then each `776 $z`, then the ISBN of each
 * record linked in `776 $w`, until one is an image. Stops early when the
 * server serves no covers at all (bot check, errors), because asking for
 * other ISBNs would meet the same answer.
 */
async function findCover(deps: BookImportDeps, book: BookRecord): Promise<FoundCover> {
	const { http, config } = deps;
	const tried: { isbn: string; reason: string }[] = [];
	const unresolved: string[] = [];

	for await (const source of coverCandidates(http, book, unresolved)) {
		const cover = await fetchCover(http, source.isbn, config.coverSize);
		if (cover.ok) return { ...cover, source };
		if (cover.failure === "blocked") return cover;
		tried.push({ isbn: source.isbn, reason: cover.reason });
	}

	const lookups = unresolved.map((idn) => `, https://d-nb.info/${idn} could not be looked up`);
	if (tried.length === 0) {
		const reason =
			book.otherEditionIsbns.length + book.otherEditionIdns.length === 0
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
 * Candidate ISBNs in fallback order, each once. Linked records are looked up
 * only when the earlier candidates are used up; a failed lookup is recorded
 * in `unresolved` and skipped.
 */
async function* coverCandidates(
	http: HttpGet,
	book: BookRecord,
	unresolved: string[],
): AsyncGenerator<CoverSource> {
	const seen = new Set<string>();
	const fresh = (isbn: string | null): isbn is string => {
		if (isbn === null || seen.has(isbn)) return false;
		seen.add(isbn);
		return true;
	};

	if (fresh(book.isbn)) yield { kind: "own", isbn: book.isbn };
	for (const isbn of book.otherEditionIsbns) {
		if (fresh(isbn)) yield { kind: "isbn", isbn };
	}
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
		if (fresh(isbn)) yield { kind: "record", isbn, idn };
	}
}

/** Names the source, and flags a cover taken from another edition. */
function coverMessage(source: CoverSource): string {
	switch (source.kind) {
		case "own":
			return `Cover from ISBN ${source.isbn}.`;
		case "isbn":
			return `Cover from ISBN ${source.isbn}, another edition; its artwork may differ.`;
		case "record":
			return `Cover from ISBN ${source.isbn}, another edition (https://d-nb.info/${source.idn}); its artwork may differ.`;
	}
}
