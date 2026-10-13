import type { DnbRecord } from "../../src/book/dnb-record";

const isString = (value: unknown): value is string => typeof value === "string";
const nonEmpty = (value: unknown) => isString(value) && value !== "";
const orNull = (check: (value: unknown) => boolean) => (value: unknown) =>
	value === null || check(value);
const stringList = (check: (value: string) => boolean) => (value: unknown) =>
	Array.isArray(value) && value.every((item) => isString(item) && check(item));
const isbn13 = (value: unknown) => isString(value) && /^97[89]\d{10}$/.test(value);
const idn = (value: string) => /^\d{7,9}[\dX]$/.test(value);

/**
 * The shape each mapped field must have on a live record. Typed against
 * {@link DnbRecord}, so a new field needs an entry; the offline
 * field-coverage test checks the keys as well.
 */
export const DNB_RECORD_SHAPE = {
	catalogue: (value) => value === "dnb",
	url: (value) => isString(value) && value.startsWith("https://d-nb.info/"),
	idn: (value) => isString(value) && idn(value),
	title: nonEmpty,
	originalTitle: nonEmpty,
	authors: stringList((name) => name !== ""),
	isbn: orNull(isbn13),
	year: orNull((value) => Number.isInteger(value) && (value as number) > 1400),
	series: orNull(nonEmpty),
	seriesIndex: orNull((value) => typeof value === "number" && Number.isFinite(value)),
	type: orNull((value) => value === "book" || value === "ebook" || value === "audiobook"),
	media: nonEmpty,
	blurbUrl: orNull((value) => isString(value) && value.startsWith("https://services.dnb.de/")),
	otherEditionIsbns: stringList(isbn13),
	otherEditionIdns: stringList(idn),
} as const satisfies Record<keyof DnbRecord, (value: unknown) => boolean>;

/** Names of the fields whose value does not have the expected shape. */
export function shapeMismatches(book: DnbRecord): string[] {
	return (Object.keys(DNB_RECORD_SHAPE) as (keyof DnbRecord)[]).filter(
		(key) => !DNB_RECORD_SHAPE[key](book[key]),
	);
}
