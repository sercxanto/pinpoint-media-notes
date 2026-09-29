import { buildNote } from "../core/frontmatter";
import { noteStem } from "../core/text";
import type { BookRecord, BookType } from "./record";

/** Always present, not a collision breaker: editions of one title often share a year. */
const TYPE_SUFFIX: Record<BookType, string> = {
	book: "",
	ebook: " - E-Book",
	audiobook: " - Hörbuch",
};

/** Base name of the note and its cover: `<title> (<year>)<suffix>`. */
export function bookStem(book: BookRecord, type: BookType): string {
	return noteStem(book.title, book.year, TYPE_SUFFIX[type]);
}

/**
 * The complete note. `cover` is the vault-relative image path, or null.
 * Property order is a golden format, see the spec.
 */
export function bookNote(
	book: BookRecord,
	type: BookType,
	description: string,
	cover: string | null,
): string {
	return buildNote([
		["template", "[[Book Template]]"],
		["type", type],
		["title", book.title],
		["original_title", book.originalTitle],
		["authors", book.authors],
		["url", `https://d-nb.info/${book.idn}`],
		["isbn", book.isbn],
		["year", book.year],
		["series", book.series],
		["series_index", book.seriesIndex],
		["genres", []],
		["description", description],
		["cover", cover === null ? null : `[[${cover}]]`],
		["rating", null],
		["last_finished", null],
		["shelf", "unsorted"],
		["tags", ["books"]],
	]);
}
