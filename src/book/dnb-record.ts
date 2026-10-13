import { EntryError } from "../core/errors";
import { isValidIsbn10, isbn10To13 } from "./input";
import {
	fields,
	firstSubfield,
	subfield,
	subfields,
	type MarcDataField,
	type MarcRecord,
} from "./marc";
import { rdaBookType, type BookRecord } from "./record";

/** A DNB record: the common fields, plus what only the DNB path reads. */
export interface DnbRecord extends BookRecord {
	catalogue: "dnb";
	/** DNB record number, from `001`. */
	idn: string;
	/** The DNB's own blurb page, if the record links one. */
	blurbUrl: string | null;
	/** DNB record numbers of other editions, from `776 $w`; cover fallback. */
	otherEditionIdns: string[];
}

/**
 * Where each field comes from. Typed against {@link DnbRecord}, so a new
 * field needs an entry here, and the field-coverage test checks every entry
 * against the fixtures.
 */
export const DNB_RECORD_SOURCES = {
	catalogue: "always dnb",
	url: "https://d-nb.info/<idn>",
	idn: "001",
	title: "245 $a",
	originalTitle: "240 $a, else title",
	authors: "100 $a, 700 $a, where $4 is aut",
	isbn: "020 $a (ISBN-13)",
	year: "264 $c, else 260 $c",
	series: "490 $a, else 830 $a",
	seriesIndex: "490 $v, else 830 $v",
	type: "336 $b + 338 $b (RDA codes), else the term in $a",
	media: "336 $a + 338 $a",
	blurbUrl: "856 $u where $3 is Inhaltstext, DNB host only",
	otherEditionIsbns: "776 $z",
	otherEditionIdns: "776 $w of the form (DE-101)<idn>",
} as const satisfies Record<keyof DnbRecord, string>;

/** The DNB's permalink for a record number. */
export function dnbRecordUrl(idn: string): string {
	return `https://d-nb.info/${idn}`;
}

/** Maps one MARC record. Throws an EntryError if it lacks an IDN or a title. */
export function readDnbRecord(marc: MarcRecord): DnbRecord {
	const idn = marc.control["001"] ?? "";
	if (idn === "") throw new EntryError("A catalogue record has no record number.");
	const title = firstSubfield(marc, "245", "a");
	if (title === null) throw new EntryError(`Catalogue record ${idn} has no title.`);

	const contents = fields(marc, "336");
	const carriers = fields(marc, "338");
	const contentTerms = contents.flatMap((field) => subfields(field, "a"));
	const carrierTerms = carriers.flatMap((field) => subfields(field, "a"));

	return {
		catalogue: "dnb",
		url: dnbRecordUrl(idn),
		idn,
		title,
		originalTitle: firstSubfield(marc, "240", "a") ?? title,
		authors: readAuthors(marc),
		isbn: recordIsbn(marc),
		year: readYear(marc),
		series: firstSubfield(marc, "490", "a") ?? firstSubfield(marc, "830", "a"),
		seriesIndex: readSeriesIndex(marc),
		type: rdaBookType(
			contents.flatMap((field) => rdaCodes(field, CONTENT_CODES)),
			carriers.flatMap((field) => rdaCodes(field, CARRIER_CODES)),
		),
		media: `${contentTerms.join(", ") || "no content type"} / ${carrierTerms.join(", ") || "no carrier type"}`,
		blurbUrl: readBlurbUrl(marc),
		otherEditionIsbns: readOtherEditionIsbns(marc),
		otherEditionIdns: readOtherEditionIdns(marc, idn),
	};
}

function readAuthors(marc: MarcRecord): string[] {
	const names = [...fields(marc, "100"), ...fields(marc, "700")]
		.filter((field) => subfields(field, "4").includes("aut"))
		.map((field) => subfield(field, "a"))
		.filter((name) => name !== null);
	return [...new Set(names)];
}

/**
 * The record's ISBN-13 from `020 $a`. Also used on records linked in `776 $w`,
 * which are only read for their ISBN.
 */
export function recordIsbn(marc: MarcRecord): string | null {
	return firstIsbn13(fields(marc, "020").flatMap((field) => subfields(field, "a")));
}

/** The first ISBN-13 among the values, else the first valid ISBN-10 converted. */
function firstIsbn13(raw: string[]): string | null {
	const values = raw.map((value) => value.replace(/[\s-]/g, "").toUpperCase());
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

/** One ISBN-13 per `776 $z`, in record order, without duplicates. */
function readOtherEditionIsbns(marc: MarcRecord): string[] {
	const isbns = fields(marc, "776")
		.flatMap((field) => subfields(field, "z"))
		.map((value) => firstIsbn13([value]))
		.filter((isbn) => isbn !== null);
	return [...new Set(isbns)];
}

/**
 * `776 $w` links carry the holding library's prefix; only `(DE-101)`, the
 * DNB's own, is a record number the catalogue can look up. A link back to
 * the record itself is dropped.
 */
function readOtherEditionIdns(marc: MarcRecord, idn: string): string[] {
	const idns = fields(marc, "776")
		.flatMap((field) => subfields(field, "w"))
		.map((value) => /^\(DE-101\)\s*(\d{7,9}[\dX])$/i.exec(value)?.[1]?.toUpperCase())
		.filter((linked): linked is string => linked !== undefined && linked !== idn);
	return [...new Set(idns)];
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

/**
 * RDA codes for the German terms the DNB catalogues in `$a`, only those
 * {@link rdaBookType} reads. Used for a field without a code in `$b`.
 */
const CONTENT_CODES: Partial<Record<string, string>> = {
	Text: "txt",
	"gesprochenes Wort": "spw",
};
const CARRIER_CODES: Partial<Record<string, string>> = {
	Band: "nc",
	"Online-Ressource": "cr",
};

/** The field's codes from `$b`; without any, its `$a` terms translated. */
function rdaCodes(field: MarcDataField, byTerm: Partial<Record<string, string>>): string[] {
	const codes = subfields(field, "b");
	if (codes.length > 0) return codes;
	return subfields(field, "a")
		.map((term) => byTerm[term])
		.filter((code) => code !== undefined);
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
