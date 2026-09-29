import { EntryError } from "../core/errors";
import { nfc } from "../core/text";

// MARC21-XML as returned by the DNB's SRU interface, reduced to what the
// mapping needs. Uses the DOMParser Obsidian provides; tests run under jsdom.

export interface MarcSubfield {
	code: string;
	value: string;
}

export interface MarcDataField {
	tag: string;
	ind1: string;
	ind2: string;
	subfields: MarcSubfield[];
}

export interface MarcRecord {
	/** Control fields (`001`, `003`, …) by tag. */
	control: Record<string, string>;
	datafields: MarcDataField[];
}

/**
 * Non-sorting markers around a leading article (`U+0098 Die U+009C`), also
 * in their numeric entity form in case a record escapes them twice.
 */
const NON_SORTING = /\u0098|\u009c|&#152;|&#156;/g;

/** Every value is read through here: NFC, markers removed, trimmed. */
function clean(text: string | null): string {
	return nfc(text ?? "")
		.replace(NON_SORTING, "")
		.trim();
}

/**
 * Parses an SRU `searchRetrieveResponse`. The `srw:record` wrapper and the
 * `marc:record` inside it share the local name `record`, so only elements
 * with a direct `leader` child count as MARC records.
 */
export function parseSruResponse(xml: string): MarcRecord[] {
	const doc = new DOMParser().parseFromString(xml, "application/xml");
	if (doc.getElementsByTagName("parsererror").length > 0) {
		throw new EntryError("The catalogue answered with something that is not valid XML.");
	}

	const records = Array.from(doc.getElementsByTagNameNS("*", "record")).filter((element) =>
		Array.from(element.children).some((child) => child.localName === "leader"),
	);

	if (records.length === 0) {
		const diagnostic = doc.getElementsByTagNameNS("*", "diagnostic")[0];
		if (diagnostic) {
			const message =
				childText(diagnostic, "message") || childText(diagnostic, "details") || "unknown";
			throw new EntryError(`The catalogue reported an error: ${message}`);
		}
	}

	return records.map(readRecord);
}

function childText(element: Element, localName: string): string {
	const child = Array.from(element.children).find((c) => c.localName === localName);
	return clean(child?.textContent ?? null);
}

function readRecord(element: Element): MarcRecord {
	const record: MarcRecord = { control: {}, datafields: [] };
	for (const child of Array.from(element.children)) {
		const tag = child.getAttribute("tag") ?? "";
		if (child.localName === "controlfield") {
			record.control[tag] = clean(child.textContent);
		} else if (child.localName === "datafield") {
			record.datafields.push({
				tag,
				ind1: child.getAttribute("ind1") ?? " ",
				ind2: child.getAttribute("ind2") ?? " ",
				subfields: Array.from(child.children)
					.filter((sub) => sub.localName === "subfield")
					.map((sub) => ({
						code: sub.getAttribute("code") ?? "",
						value: clean(sub.textContent),
					})),
			});
		}
	}
	return record;
}

/** All data fields with the tag, in record order. */
export function fields(record: MarcRecord, tag: string): MarcDataField[] {
	return record.datafields.filter((field) => field.tag === tag);
}

/** All non-empty values of the subfield, in field order. */
export function subfields(field: MarcDataField, code: string): string[] {
	return field.subfields
		.filter((sub) => sub.code === code && sub.value !== "")
		.map((sub) => sub.value);
}

/** The first non-empty value of the subfield, or null. */
export function subfield(field: MarcDataField, code: string): string | null {
	return subfields(field, code)[0] ?? null;
}

/** The first non-empty `$code` across all fields with the tag, or null. */
export function firstSubfield(record: MarcRecord, tag: string, code: string): string | null {
	for (const field of fields(record, tag)) {
		const value = subfield(field, code);
		if (value !== null) return value;
	}
	return null;
}
