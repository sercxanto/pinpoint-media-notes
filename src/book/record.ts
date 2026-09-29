import { EntryError } from "../core/errors";
import { isValidIsbn10, isbn10To13 } from "./input";
import { fields, firstSubfield, subfield, subfields, type MarcRecord } from "./marc";

export type BookType = "book" | "ebook" | "audiobook";

/** What the importer reads from one catalogue record. */
export interface BookRecord {
	/** DNB record number, from `001`. */
	idn: string;
	title: string;
	originalTitle: string;
	/** `Surname, Given name`, authors only (no translators, narrators, …). */
	authors: string[];
	/** ISBN-13 without hyphens. */
	isbn: string | null;
	year: number | null;
	series: string | null;
	seriesIndex: number | null;
	/** Null for material the importer does not support (sheet music, maps, film, …). */
	type: BookType | null;
	/** Content and carrier type as catalogued, for messages. */
	media: string;
	/** The DNB's own blurb page, if the record links one. */
	blurbUrl: string | null;
}

/**
 * Where each field comes from. Typed against {@link BookRecord}, so a new
 * field needs an entry here, and the field-coverage test checks every entry
 * against the fixtures.
 */
export const BOOK_RECORD_SOURCES = {
	idn: "001",
	title: "245 $a",
	originalTitle: "240 $a, else title",
	authors: "100 $a, 700 $a, where $4 is aut",
	isbn: "020 $a (ISBN-13)",
	year: "264 $c, else 260 $c",
	series: "490 $a, else 830 $a",
	seriesIndex: "490 $v, else 830 $v",
	type: "336 $a + 338 $a",
	media: "336 $a + 338 $a",
	blurbUrl: "856 $u where $3 is Inhaltstext, DNB host only",
} as const satisfies Record<keyof BookRecord, string>;

/** Maps one MARC record. Throws an EntryError if it lacks an IDN or a title. */
export function readBookRecord(marc: MarcRecord): BookRecord {
	const idn = marc.control["001"] ?? "";
	if (idn === "") throw new EntryError("A catalogue record has no record number.");
	const title = firstSubfield(marc, "245", "a");
	if (title === null) throw new EntryError(`Catalogue record ${idn} has no title.`);

	const contents = fields(marc, "336").flatMap((field) => subfields(field, "a"));
	const carriers = fields(marc, "338").flatMap((field) => subfields(field, "a"));

	return {
		idn,
		title,
		originalTitle: firstSubfield(marc, "240", "a") ?? title,
		authors: readAuthors(marc),
		isbn: readIsbn(marc),
		year: readYear(marc),
		series: firstSubfield(marc, "490", "a") ?? firstSubfield(marc, "830", "a"),
		seriesIndex: readSeriesIndex(marc),
		type: bookType(contents, carriers),
		media: `${contents.join(", ") || "no content type"} / ${carriers.join(", ") || "no carrier type"}`,
		blurbUrl: readBlurbUrl(marc),
	};
}

function readAuthors(marc: MarcRecord): string[] {
	const names = [...fields(marc, "100"), ...fields(marc, "700")]
		.filter((field) => subfields(field, "4").includes("aut"))
		.map((field) => subfield(field, "a"))
		.filter((name) => name !== null);
	return [...new Set(names)];
}

function readIsbn(marc: MarcRecord): string | null {
	const values = fields(marc, "020")
		.flatMap((field) => subfields(field, "a"))
		.map((value) => value.replace(/[\s-]/g, "").toUpperCase());
	for (const value of values) {
		const isbn13 = /(?:^|\D)(97[89]\d{10})(?!\d)/.exec(value)?.[1];
		if (isbn13) return isbn13;
	}
	// Older records carry an ISBN-10 only; the cover service needs ISBN-13.
	for (const value of values) {
		const isbn10 = /(?:^|\D)(\d{9}[\dX])(?![\dX])/.exec(value)?.[1];
		if (isbn10 && isValidIsbn10(isbn10)) return isbn10To13(isbn10);
	}
	return null;
}

/** The first four-digit run, publication statement (264 ind2 1) preferred over copyright dates. */
function readYear(marc: MarcRecord): number | null {
	const statements = fields(marc, "264");
	const ordered = [
		...statements.filter((field) => field.ind2 === "1"),
		...statements.filter((field) => field.ind2 !== "1"),
		...fields(marc, "260"),
	];
	for (const field of ordered) {
		for (const value of subfields(field, "c")) {
			const year = /\d{4}/.exec(value)?.[0];
			if (year) return Number(year);
		}
	}
	return null;
}

/** "Band 5" → 5. A volume without a number gives null. */
function readSeriesIndex(marc: MarcRecord): number | null {
	for (const tag of ["490", "830"]) {
		for (const field of fields(marc, tag)) {
			for (const value of subfields(field, "v")) {
				const number = /\d+(?:[.,]\d+)?/.exec(value)?.[0];
				if (number) return Number(number.replace(",", "."));
			}
		}
	}
	return null;
}

function bookType(contents: string[], carriers: string[]): BookType | null {
	if (contents.includes("gesprochenes Wort")) return "audiobook";
	if (!contents.includes("Text")) return null;
	for (const carrier of carriers) {
		if (carrier === "Band") return "book";
		if (carrier === "Online-Ressource") return "ebook";
	}
	return null;
}

/**
 * Publishers register their homepage under the same `Inhaltstext` label, and
 * the neighbouring `Inhaltsverzeichnis` is a scanned PDF; only the DNB's own
 * blurb service is used.
 */
function readBlurbUrl(marc: MarcRecord): string | null {
	for (const field of fields(marc, "856")) {
		if (!subfields(field, "3").includes("Inhaltstext")) continue;
		for (const url of subfields(field, "u")) {
			if (isDnbBlurbUrl(url)) return url;
		}
	}
	return null;
}

export function isDnbBlurbUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return /^https?:$/.test(parsed.protocol) && parsed.hostname === "services.dnb.de";
	} catch {
		return false;
	}
}

/** One line per record, for the user to choose from. */
export function describeRecord(book: BookRecord): string {
	const year = book.year === null ? "no year" : String(book.year);
	const isbn = book.isbn === null ? "no ISBN" : `ISBN ${book.isbn}`;
	return `${book.title} (${year}), ${book.type ?? book.media}, ${isbn}, https://d-nb.info/${book.idn}`;
}
