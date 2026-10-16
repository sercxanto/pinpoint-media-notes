import type { LocRecord } from "../../src/book/loc-record";

const isString = (value: unknown): value is string => typeof value === "string";
const nonEmpty = (value: unknown) => isString(value) && value !== "";
const orNull = (check: (value: unknown) => boolean) => (value: unknown) =>
	value === null || check(value);
const stringList = (check: (value: string) => boolean) => (value: unknown) =>
	Array.isArray(value) && value.every((item) => isString(item) && check(item));
const isbn13 = (value: unknown) => isString(value) && /^97[89]\d{10}$/.test(value);
const recordNumber = (value: string) => /^[a-z]*\d+(?:-\d+)?$/.test(value);

/**
 * The shape each mapped field must have on a live record. Typed against
 * {@link LocRecord}, so a new field needs an entry; the offline
 * field-coverage test checks the keys as well.
 */
export const LOC_RECORD_SHAPE = {
	catalogue: (value) => value === "loc",
	url: (value) =>
		isString(value) &&
		/^https:\/\/(?:lccn\.loc\.gov\/[a-z]*\d+|id\.loc\.gov\/resources\/instances\/\S+)$/.test(
			value,
		),
	id: (value) => isString(value) && recordNumber(value),
	title: nonEmpty,
	originalTitle: nonEmpty,
	// No life dates: the name comes from the heading's $a, not the label.
	authors: stringList((name) => name !== "" && !/,\s*\d{4}-/.test(name)),
	isbn: orNull(isbn13),
	isbns: stringList(isbn13),
	year: orNull((value) => Number.isInteger(value) && (value as number) > 1400),
	series: orNull(nonEmpty),
	seriesIndex: orNull((value) => typeof value === "number" && Number.isFinite(value)),
	type: orNull((value) => value === "book" || value === "ebook" || value === "audiobook"),
	media: nonEmpty,
	// Attribution removed, one line, truncated.
	description: orNull(
		(value) =>
			isString(value) &&
			value !== "" &&
			value.length < 500 &&
			!/\n|--\s*(?:Provided by publisher|Publisher description)\.?$/.test(value),
	),
	otherEditionIsbns: stringList(isbn13),
} as const satisfies Record<keyof LocRecord, (value: unknown) => boolean>;

/** Names of the fields whose value does not have the expected shape. */
export function shapeMismatches(book: LocRecord): string[] {
	return (Object.keys(LOC_RECORD_SHAPE) as (keyof LocRecord)[]).filter(
		(key) => !LOC_RECORD_SHAPE[key](book[key]),
	);
}
