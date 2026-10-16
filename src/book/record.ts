export type BookType = "book" | "ebook" | "audiobook";

/** The catalogue a record comes from, for messages. */
export type BookCatalogue = "dnb" | "loc";

/** What the importer reads from one catalogue record, whichever the catalogue. */
export interface BookRecord {
	catalogue: BookCatalogue;
	/** The record's own page; the note's `url` and the record picker's link. */
	url: string;
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
	/** ISBN-13s of other editions of the work; cover fallback. */
	otherEditionIsbns: string[];
}

/**
 * The type from RDA content codes (`txt`, `spw`, …) and carrier codes (`nc`,
 * `cr`, …), which both catalogues use. Carriers are matched in order.
 */
export function rdaBookType(contents: string[], carriers: string[]): BookType | null {
	if (contents.includes("spw")) return "audiobook";
	if (!contents.includes("txt")) return null;
	for (const carrier of carriers) {
		if (carrier === "nc") return "book";
		if (carrier === "cr") return "ebook";
	}
	return null;
}

/**
 * A record for the user to choose from: title and year, then what tells
 * editions apart (type, ISBN, link to the catalogue record).
 */
export function describeRecord(book: BookRecord): { name: string; details: string } {
	const year = book.year === null ? "no year" : String(book.year);
	const isbn = book.isbn === null ? "no ISBN" : `ISBN ${book.isbn}`;
	return {
		name: `${book.title} (${year})`,
		details: `${book.type ?? book.media}, ${isbn}, ${book.url}`,
	};
}
