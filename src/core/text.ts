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
 * Control characters, which Windows rejects in file names, and the
 * bidirectional controls, which make a name display as something it is not.
 */
const FILE_NAME_INVISIBLE = /[\p{Cc}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;

/**
 * Device names Windows reserves, also when an extension follows: `NUL.md`
 * and `Aux. Tales.md` both name a device.
 */
const WINDOWS_DEVICE = /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])$/i;

/**
 * Turns a title into a file name stem: strips forbidden and invisible
 * characters, collapses whitespace, trims. Leading dots are stripped too,
 * because Obsidian ignores files whose name starts with a dot.
 */
export function sanitizeFileName(title: string): string {
	return title
		.replace(FILE_NAME_FORBIDDEN, "")
		.replace(/\s/g, " ")
		.replace(FILE_NAME_INVISIBLE, "")
		.replace(/ +/g, " ")
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
	const stem = year === null ? `${name}${suffix}` : `${name} (${year})${suffix}`;
	if (WINDOWS_DEVICE.test(stem.split(".")[0]?.trimEnd() ?? "")) {
		throw new EntryError(
			`The title "${title}" gives the file name "${stem}", which Windows reserves for a device.`,
		);
	}
	return stem;
}
