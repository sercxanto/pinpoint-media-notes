import { EntryError } from "../core/errors";
import { truncateBlurb } from "./blurb";
import { toIsbn13 } from "./input";
import type { JsonLdGraph, JsonLdNode } from "./jsonld";
import { rdaBookType, seriesNumber, type BookRecord } from "./record";

/** An LoC record: the common fields, plus what only the LoC path reads. */
export interface LocRecord extends BookRecord {
	catalogue: "loc";
	/** LoC record number, the search hit's token. */
	id: string;
	/** ISBN-13s the instance lists without status; the record counts for these. */
	isbns: string[];
	/** The summary, attribution removed, one line, truncated. */
	description: string | null;
}

/**
 * Where each field comes from. Typed against {@link LocRecord}, so a new
 * field needs an entry here, and the field-coverage test checks every entry
 * against the fixtures.
 */
export const LOC_RECORD_SOURCES = {
	catalogue: "always loc",
	url: "https://lccn.loc.gov/<lccn> from instance Lccn, else the id.loc.gov instance",
	id: "the search hit's token",
	title: "instance title → mainTitle",
	originalTitle: "work expressionOf → hub marcKey $t (130: $a), $n, $p, if it has $l; else title",
	authors: "work contribution with role aut → agent → marcKey $a, else rdfs:label",
	isbn: "the queried ISBN once matched, else the first of isbns",
	isbns: "instance identifiedBy → Isbn without status, as ISBN-13",
	year: "instance provisionActivity (Publication) → date",
	series: "first work relation with relationship series → associatedResource → title",
	seriesIndex: "that relation's seriesEnumeration",
	type: "work content + instance carrier (RDA code URIs)",
	media: "work content + instance carrier, rdfs:label",
	description: "work summary → rdfs:label",
	otherEditionIsbns: "instance identifiedBy → Isbn with status cancinv, as ISBN-13",
} as const satisfies Record<keyof LocRecord, string>;

const BF = "http://id.loc.gov/ontologies/bibframe/";
const BFLC = "http://id.loc.gov/ontologies/bflc/";
const RDF_VALUE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#value";
const RDFS_LABEL = "http://www.w3.org/2000/01/rdf-schema#label";
const VOCABULARY = "http://id.loc.gov/vocabulary/";
const CANCINV = `${VOCABULARY}mstatus/cancinv`;

/** The instance's own page on `id.loc.gov`; the record's `url` without an LCCN. */
export function locInstanceUrl(id: string): string {
	return `https://id.loc.gov/resources/instances/${id}`;
}

/**
 * Maps one record document (`<id>.cbd.json`). The document also holds
 * related works and instances; only the instance `<id>` and its work are read.
 * Throws an EntryError if the instance or its title is missing.
 */
export function readLocRecord(graph: JsonLdGraph, id: string): LocRecord {
	const instance = graph.node(`http://id.loc.gov/resources/instances/${id}`);
	if (instance === undefined) throw new EntryError(`LoC record ${id} holds no instance.`);
	const title = readTitle(graph, instance);
	if (title === null) throw new EntryError(`LoC record ${id} has no title.`);
	const work = graph.links(instance, `${BF}instanceOf`)[0];

	const contents = work === undefined ? [] : graph.links(work, `${BF}content`);
	const carriers = graph.links(instance, `${BF}carrier`);
	const isbns = readIsbns(graph, instance);
	const series = work === undefined ? null : readSeries(graph, work);

	return {
		catalogue: "loc",
		url: readUrl(graph, instance, id),
		id,
		title,
		originalTitle: (work === undefined ? null : readOriginalTitle(graph, work)) ?? title,
		authors: work === undefined ? [] : readAuthors(graph, work),
		isbn: isbns.listed[0] ?? null,
		isbns: isbns.listed,
		year: readYear(graph, instance),
		series: series?.title ?? null,
		seriesIndex: series?.index ?? null,
		type: rdaBookType(
			contents.map((node) => vocabularyCode(node, "contentTypes")).filter(isString),
			carriers.map((node) => vocabularyCode(node, "carriers")).filter(isString),
		),
		media: `${labels(contents) || "no content type"} / ${labels(carriers) || "no carrier type"}`,
		description: work === undefined ? null : readDescription(graph, work),
		otherEditionIsbns: isbns.otherFormats,
	};
}

/**
 * The records that count for an ISBN: those whose instance lists it without
 * status, with `isbn` set to it. `otherFormat` are those listing it only as
 * another format's (`cancinv`); they describe a different edition.
 */
export function matchLocRecords(
	records: LocRecord[],
	isbn13: string,
): { matches: LocRecord[]; otherFormat: LocRecord[] } {
	return {
		matches: records
			.filter((record) => record.isbns.includes(isbn13))
			.map((record) => ({ ...record, isbn: isbn13 })),
		otherFormat: records.filter(
			(record) => !record.isbns.includes(isbn13) && record.otherEditionIsbns.includes(isbn13),
		),
	};
}

const isString = (value: string | null): value is string => value !== null;

/** The instance's title proper; variant and parallel titles have a type of their own. */
function readTitle(graph: JsonLdGraph, instance: JsonLdNode): string | null {
	for (const title of graph.links(instance, `${BF}title`)) {
		if (!title.hasType(`${BF}Title`)) continue;
		const main = title.values(`${BF}mainTitle`)[0];
		if (main !== undefined) return main;
	}
	return null;
}

/** The first LCCN without status; LCCNs carry leading spaces, older ones a prefix. */
function readUrl(graph: JsonLdGraph, instance: JsonLdNode, id: string): string {
	for (const identifier of graph.links(instance, `${BF}identifiedBy`)) {
		if (!identifier.hasType(`${BF}Lccn`) || hasStatus(identifier)) continue;
		const lccn = identifier.values(RDF_VALUE)[0]?.replace(/\s+/g, "");
		if (lccn) return `https://lccn.loc.gov/${encodeURIComponent(lccn)}`;
	}
	return locInstanceUrl(id);
}

/** ISBN-13s without status, and those with `cancinv`; ISBN-10s converted. */
function readIsbns(
	graph: JsonLdGraph,
	instance: JsonLdNode,
): { listed: string[]; otherFormats: string[] } {
	const listed = new Set<string>();
	const otherFormats = new Set<string>();
	for (const identifier of graph.links(instance, `${BF}identifiedBy`)) {
		if (!identifier.hasType(`${BF}Isbn`)) continue;
		const isbn = toIsbn13(identifier.values(RDF_VALUE)[0] ?? "");
		if (isbn === null) continue;
		const cancinv = identifier
			.objects(`${BF}status`)
			.some((status) => status["@id"] === CANCINV);
		(cancinv ? otherFormats : listed).add(isbn);
	}
	return {
		listed: [...listed],
		otherFormats: [...otherFormats].filter((isbn) => !listed.has(isbn)),
	};
}

function hasStatus(node: JsonLdNode): boolean {
	return node.objects(`${BF}status`).length > 0;
}

/** Contributions whose role is `aut`; editors, translators and others are dropped. */
function readAuthors(graph: JsonLdGraph, work: JsonLdNode): string[] {
	const names: string[] = [];
	for (const contribution of graph.links(work, `${BF}contribution`)) {
		const roles = graph.links(contribution, `${BF}role`);
		const isAuthor = roles.some(
			(role) =>
				role.id === `${VOCABULARY}relators/aut` || role.values(`${BF}code`).includes("aut"),
		);
		if (!isAuthor) continue;
		for (const agent of graph.links(contribution, `${BF}agent`)) {
			const name = agentName(agent);
			if (name !== null) names.push(name);
		}
	}
	return [...new Set(names)];
}

/**
 * The label appends life dates (`Kehlmann, Daniel, 1975-`), so the name is
 * taken from `$a` of the MARC heading the agent carries, as for the DNB.
 */
function agentName(agent: JsonLdNode): string | null {
	for (const key of agent.values(`${BFLC}marcKey`)) {
		const name = /\$a([^$]*)/.exec(key)?.[1]?.replace(/[\s,]+$/, "");
		if (name) return name;
	}
	return agent.values(RDFS_LABEL)[0] ?? null;
}

/**
 * A translation's original title, from the hub the work is an expression of
 * (`1001 $aKehlmann, Daniel,$d1975-$tVermessung der Welt.$lEnglish`). Only a
 * heading with a language (`$l`) names a translation; an original may have a
 * hub too, without one. The title is `$t` with its parts (`$n`, `$p`), or
 * `$a` of a uniform title without author (`130`, _Beowulf_), in the form the
 * LoC catalogues it: initial articles dropped, non-Latin scripts romanised.
 */
function readOriginalTitle(graph: JsonLdGraph, work: JsonLdNode): string | null {
	for (const hub of graph.links(work, `${BF}expressionOf`)) {
		for (const key of hub.values(`${BFLC}marcKey`)) {
			const subfields = [...key.matchAll(/\$([a-z0-9])([^$]*)/g)].map(
				([, code, value]) => [code, value?.trim().replace(/[\s.,]+$/, "")] as const,
			);
			if (!subfields.some(([code]) => code === "l")) continue;
			const title = key.startsWith("130") ? ["a", "n", "p"] : ["t", "n", "p"];
			const parts = subfields
				.filter(([code, value]) => title.includes(code ?? "") && value)
				.map(([, value]) => value);
			if (parts.length > 0) return parts.join(". ");
		}
	}
	return null;
}

/** The first four-digit run in the date of a publication; EDTF, so usually just the year. */
function readYear(graph: JsonLdGraph, instance: JsonLdNode): number | null {
	for (const activity of graph.links(instance, `${BF}provisionActivity`)) {
		if (!activity.hasType(`${BF}Publication`)) continue;
		for (const date of activity.values(`${BF}date`)) {
			const year = /\d{4}/.exec(date)?.[0];
			if (year) return Number(year);
		}
	}
	return null;
}

/**
 * The first series relation with a title. A series often comes twice, as
 * transcribed and as the controlled heading; the transcribed one is first.
 */
function readSeries(
	graph: JsonLdGraph,
	work: JsonLdNode,
): { title: string; index: number | null } | null {
	for (const relation of graph.links(work, `${BF}relation`)) {
		const relationships = graph.links(relation, `${BF}relationship`);
		if (!relationships.some((node) => node.id === `${VOCABULARY}relationship/series`)) continue;
		for (const series of graph.links(relation, `${BF}associatedResource`)) {
			for (const title of graph.links(series, `${BF}title`)) {
				const main = title.values(`${BF}mainTitle`)[0];
				if (main === undefined) continue;
				return {
					title: main,
					index: seriesNumber(relation.values(`${BF}seriesEnumeration`)),
				};
			}
		}
	}
	return null;
}

/** The RDA code at the end of a vocabulary URI (`…/contentTypes/txt` → `txt`). */
function vocabularyCode(node: JsonLdNode, vocabulary: string): string | null {
	const prefix = `${VOCABULARY}${vocabulary}/`;
	return node.id.startsWith(prefix) ? node.id.slice(prefix.length) : null;
}

function labels(nodes: JsonLdNode[]): string {
	return nodes
		.map((node) => node.values(RDFS_LABEL)[0] ?? node.id.split("/").pop() ?? "")
		.join(", ");
}

function readDescription(graph: JsonLdGraph, work: JsonLdNode): string | null {
	for (const summary of graph.links(work, `${BF}summary`)) {
		const text = summaryText(summary.values(RDFS_LABEL)[0] ?? "");
		if (text !== "") return truncateBlurb(text);
	}
	return null;
}

/**
 * Publisher copy comes quoted with an attribution:
 * `"…"-- Provided by publisher.` or `"…" -- Publisher description.`.
 */
const ATTRIBUTED = /^"(.*)"\s*--\s*(?:Provided by publisher|Publisher description)\.?$/s;

/** Quotes and attribution removed when the summary has exactly that form; one line. */
export function summaryText(summary: string): string {
	const text = summary.replace(/\s+/g, " ").trim();
	return ATTRIBUTED.exec(text)?.[1]?.trim() ?? text;
}
