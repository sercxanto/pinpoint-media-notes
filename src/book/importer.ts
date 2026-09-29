import { EntryError } from "../core/errors";
import { requireVaultFolder } from "../core/paths";
import type { HttpGet } from "../io/http";
import type { VaultFiles } from "../io/vault";
import type { CoverSize, PinpointSettings } from "../settings";
import { COVER_EXTENSIONS, fetchBlurb, fetchCover, searchCatalogue } from "./dnb";
import { parseBookInput, type BookQuery } from "./input";
import type { MarcRecord } from "./marc";
import { bookNote, bookStem } from "./note";
import { describeRecord, readBookRecord, type BookRecord } from "./record";

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

/**
 * Stand-in for the record picker (phase 2b): lists the records with their
 * links, so the user can import the intended one by its link.
 */
export function refuseSeveralRecords(records: BookRecord[]): Promise<BookRecord | null> {
	const lines = records.map((book, i) => `${i + 1}. ${describeRecord(book)}`);
	return Promise.reject(
		new EntryError(
			`Several catalogue records match. Import the one you mean by its link:\n${lines.join("\n")}`,
		),
	);
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

/** Reuses an existing image of the target name, otherwise downloads the edition's own cover. */
async function provideCover(
	deps: BookImportDeps,
	book: BookRecord,
	stem: string,
): Promise<CoverOutcome> {
	const { http, files, config } = deps;

	for (const extension of COVER_EXTENSIONS) {
		const path = `${config.assetsDir}/${stem}.${extension}`;
		if (await files.exists(path))
			return { path, message: `Kept the existing cover "${path}".` };
	}

	if (book.isbn === null) return { path: null, message: "No cover: the record has no ISBN." };

	const cover = await fetchCover(http, book.isbn, config.coverSize);
	if (!cover.ok) return { path: null, message: `No cover: ${cover.reason}.` };

	const path = `${config.assetsDir}/${stem}.${cover.extension}`;
	try {
		await files.ensureFolder(config.assetsDir);
		await files.createBinary(path, cover.data);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new EntryError(`Could not save the cover "${path}": ${reason}`);
	}
	return { path, message: `Cover from ISBN ${book.isbn}.` };
}
