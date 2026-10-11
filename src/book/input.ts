import { EntryError } from "../core/errors";

/**
 * What the user asked for. A 10-character input is ambiguous: every real
 * 10-digit IDN also passes the ISBN-10 check digit test, so it is looked up
 * as ISBN first and as IDN only if that finds nothing.
 */
export type BookQuery =
	| { kind: "isbn"; isbn: string }
	| { kind: "idn"; idn: string }
	| { kind: "isbn-or-idn"; isbn: string; idn: string };

const DNB_LINK = /^(?:https?:\/\/)?d-nb\.info\/([^/?#\s]+)(?:[/?#]\S*)?$/i;
const IDN = /^\d{7,9}[\dX]$/;
/**
 * Invisible format characters (Unicode category Cf). Copying from a web page
 * brings them along: Amazon puts a left-to-right mark before the ISBN.
 */
const FORMAT_CHARS = /\p{Cf}/gu;

/** Parses an ISBN-13, ISBN-10, DNB record number (IDN) or `d-nb.info` link. */
export function parseBookInput(raw: string): BookQuery {
	const input = raw.replace(FORMAT_CHARS, "").trim();
	if (input === "") throw new EntryError("Enter an ISBN or a DNB record number.");

	// Before stripping hyphens, which would break the host name.
	const link = DNB_LINK.exec(input);
	if (link) {
		const idn = (link[1] ?? "").toUpperCase();
		if (!IDN.test(idn)) throw new EntryError(`"${input}" is not a link to a DNB record.`);
		return { kind: "idn", idn };
	}

	const compact = input
		.replace(/^ISBN(?:-1[03])?\s*:?/i, "")
		.replace(/[\s-]/g, "")
		.toUpperCase();

	if (/^\d{13}$/.test(compact)) {
		if (!/^97[89]/.test(compact)) {
			throw new EntryError(`"${input}" has 13 digits but does not start with 978 or 979.`);
		}
		if (ean13CheckDigit(compact.slice(0, 12)) !== compact.slice(12)) {
			throw new EntryError(`"${input}" has a wrong check digit. Check for a typo.`);
		}
		return { kind: "isbn", isbn: compact };
	}

	if (/^\d{9}[\dX]$/.test(compact)) {
		if (!isValidIsbn10(compact)) {
			throw new EntryError(
				`"${input}" has a wrong check digit, as an ISBN-10 and as a DNB record number. Check for a typo.`,
			);
		}
		return { kind: "isbn-or-idn", isbn: isbn10To13(compact), idn: compact };
	}

	if (IDN.test(compact)) return { kind: "idn", idn: compact };

	throw new EntryError(`"${input}" is neither an ISBN nor a DNB record number.`);
}

/** EAN-13 check digit over 12 digits: weights 1, 3, 1, 3, … */
export function ean13CheckDigit(first12: string): string {
	let sum = 0;
	for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
	return String((10 - (sum % 10)) % 10);
}

/** ISBN-10 check: weights 10 down to 1, `X` stands for 10 in the last place. */
export function isValidIsbn10(isbn10: string): boolean {
	if (!/^\d{9}[\dX]$/.test(isbn10)) return false;
	let sum = 0;
	for (let i = 0; i < 10; i++) {
		const char = isbn10[i];
		sum += (char === "X" ? 10 : Number(char)) * (10 - i);
	}
	return sum % 11 === 0;
}

/** Drops the ISBN-10 check digit, prefixes 978, recomputes the EAN-13 check digit. */
export function isbn10To13(isbn10: string): string {
	const first12 = `978${isbn10.slice(0, 9)}`;
	return first12 + ean13CheckDigit(first12);
}
