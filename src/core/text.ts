import { EntryError } from "./errors";

/**
 * Normalises external text to NFC. Both sources sometimes deliver decomposed
 * forms, which Obsidian does not resolve inside a wikilink.
 */
export function nfc(text: string): string {
	return text.normalize("NFC");
}

/** Rejected by the file system or Obsidian, or breaks a wikilink. */
const FILE_NAME_FORBIDDEN = /[*"\\/<>:|?#^[\]]/g;

/**
 * Turns a title into a file name stem: strips forbidden characters, collapses
 * whitespace, trims. Leading dots are stripped too, because Obsidian ignores
 * files whose name starts with a dot.
 */
export function sanitizeFileName(title: string): string {
	return title
		.replace(FILE_NAME_FORBIDDEN, "")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^[.\s]+/, "");
}

/**
 * The note's base name without extension: `<title> (<year>)<suffix>`, or
 * `<title><suffix>` when the year is unknown. The image uses the same stem.
 */
export function noteStem(title: string, year: number | null, suffix = ""): string {
	const name = sanitizeFileName(title);
	if (name === "") {
		throw new EntryError(`The title "${title}" leaves no usable file name.`);
	}
	return year === null ? `${name}${suffix}` : `${name} (${year})${suffix}`;
}
