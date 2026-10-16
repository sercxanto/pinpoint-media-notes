import { describe, expect, it } from "vitest";
import { JsonLdGraph } from "../../src/book/jsonld";
import {
	LOC_RECORD_SOURCES,
	matchLocRecords,
	readLocRecord,
	summaryText,
	type LocRecord,
} from "../../src/book/loc-record";
import { LOC_RECORD_SHAPE, shapeMismatches } from "../contract/loc-shape";
import { fixture } from "../helpers";

const BF = "http://id.loc.gov/ontologies/bibframe/";
const LABEL = "http://www.w3.org/2000/01/rdf-schema#label";
const VALUE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#value";
const MARC_KEY = "http://id.loc.gov/ontologies/bflc/marcKey";
const VOCAB = "http://id.loc.gov/vocabulary/";

function real(id: string): LocRecord {
	return readLocRecord(JsonLdGraph.parse(fixture(`loc/instance-${id}.cbd.json`))!, id);
}

const GOOGLE = "22483650";
const STANIER = "22953559";
const MECKLENBURG = "13978713";
const BRAIN_EBOOK = "22339234";
const BRAIN_PRINT = "22338086";
const LEVIATHAN = "16523661";
const KEHLMANN = "14268223";
const DAILY_SHOW = "19805382";
const ALL = [
	GOOGLE,
	STANIER,
	MECKLENBURG,
	BRAIN_EBOOK,
	BRAIN_PRINT,
	LEVIATHAN,
	KEHLMANN,
	DAILY_SHOW,
];

const BRAIN_DESCRIPTION =
	"Invented stand-in for publisher copy. A method for keeping notes so that ideas come back when they are needed";

// Full expected values: a new field on LocRecord breaks these until the
// fixtures' expectations cover it.
describe("readLocRecord on real catalogue records", () => {
	it("maps three authors, without summary", () => {
		expect(real(GOOGLE)).toEqual<LocRecord>({
			catalogue: "loc",
			url: "https://lccn.loc.gov/2021443590",
			id: GOOGLE,
			title: "Software engineering at Google",
			originalTitle: "Software engineering at Google",
			authors: ["Winters, Titus", "Manshreck, Tom", "Wright, Hyrum"],
			isbn: "9781492082798",
			isbns: ["9781492082798"],
			year: 2020,
			series: null,
			seriesIndex: null,
			type: "book",
			media: "text / volume",
			description: null,
			otherEditionIsbns: [],
		});
	});

	it("drops the editor, takes the publisher series, strips and truncates the summary", () => {
		expect(real(STANIER)).toEqual<LocRecord>({
			catalogue: "loc",
			url: "https://lccn.loc.gov/2022278819",
			id: STANIER,
			title: "Become an effective software engineering manager",
			originalTitle: "Become an effective software engineering manager",
			authors: ["Stanier, James"],
			isbn: "9781680507249",
			isbns: ["9781680507249"],
			year: 2020,
			series: "The pragmatic programmers",
			seriesIndex: null,
			type: "book",
			media: "text / volume",
			description:
				'Invented stand-in for publisher copy. A new manager learns to run a team of engineers. The book walks through the first weeks, the one-to-ones and the hiring rounds. What does "done" mean when nobody writes code any more? It answers that, and then some. Every chapter ends with a short list of things to try on Monday morning, so the advice does not stay on the page.',
			otherEditionIsbns: [],
		});
	});

	it("does not take a related work's name for an author (AACR2 record)", () => {
		expect(real(MECKLENBURG)).toEqual<LocRecord>({
			catalogue: "loc",
			url: "https://lccn.loc.gov/2005298162",
			id: MECKLENBURG,
			title: "Managing projects with GNU make",
			originalTitle: "Managing projects with GNU make",
			authors: ["Mecklenburg, Robert William"],
			isbn: "9780596006105",
			isbns: ["9780596006105"],
			year: 2005,
			series: null,
			seriesIndex: null,
			type: "book",
			media: "text / volume",
			description: null,
			otherEditionIsbns: [],
		});
	});

	it("maps the e-book and the print record of one work, each with the other's ISBNs", () => {
		expect(real(BRAIN_EBOOK)).toEqual<LocRecord>({
			catalogue: "loc",
			url: "https://lccn.loc.gov/2021057379",
			id: BRAIN_EBOOK,
			title: "Building a second brain",
			originalTitle: "Building a second brain",
			authors: ["Forte, Tiago"],
			isbn: "9781982167400",
			isbns: ["9781982167400"],
			year: 2022,
			series: null,
			seriesIndex: null,
			type: "ebook",
			media: "text / online resource",
			description: BRAIN_DESCRIPTION,
			otherEditionIsbns: ["9781982167387", "9781982167394"],
		});
		expect(real(BRAIN_PRINT)).toEqual<LocRecord>({
			catalogue: "loc",
			url: "https://lccn.loc.gov/2021057378",
			id: BRAIN_PRINT,
			title: "Building a second brain",
			originalTitle: "Building a second brain",
			authors: ["Forte, Tiago"],
			isbn: "9781982167387",
			isbns: ["9781982167387", "9781982167394"],
			year: 2022,
			series: null,
			seriesIndex: null,
			type: "book",
			media: "text / volume",
			description: BRAIN_DESCRIPTION,
			otherEditionIsbns: ["9781982167400"],
		});
	});

	it("reads the series number", () => {
		expect(real(LEVIATHAN)).toMatchObject({ series: "The expanse", seriesIndex: 1 });
	});

	it("drops life dates from names; a translation keeps its own title as original title", () => {
		expect(real(KEHLMANN)).toMatchObject({
			title: "Measuring the world",
			originalTitle: "Measuring the world",
			authors: ["Kehlmann, Daniel"],
		});
	});

	it("recognises an audiobook, without the writer of the foreword", () => {
		expect(real(DAILY_SHOW)).toMatchObject({
			title: "The Daily Show (the audiobook)",
			authors: ["Smith, Chris"],
			type: "audiobook",
			media: "spoken word, still image / audio disc, computer disc",
			year: 2016,
		});
	});
});

describe("matchLocRecords", () => {
	const both = () => [real(BRAIN_PRINT), real(BRAIN_EBOOK)];

	it("takes the record that lists the ISBN without status, not the other format's", () => {
		const { matches, otherFormat } = matchLocRecords(both(), "9781982167400");
		expect(matches.map((record) => record.id)).toEqual([BRAIN_EBOOK]);
		expect(otherFormat.map((record) => record.id)).toEqual([BRAIN_PRINT]);
	});

	it("sets isbn to the queried one, not the record's first", () => {
		const { matches } = matchLocRecords(both(), "9781982167394");
		expect(matches.map((record) => [record.id, record.isbn])).toEqual([
			[BRAIN_PRINT, "9781982167394"],
		]);
	});

	it("reports a record that lists the ISBN only as another format's", () => {
		const { matches, otherFormat } = matchLocRecords([real(BRAIN_PRINT)], "9781982167400");
		expect(matches).toEqual([]);
		expect(otherFormat.map((record) => record.id)).toEqual([BRAIN_PRINT]);
	});

	it("keeps several records that count", () => {
		const twin = { ...real(GOOGLE), id: "1", url: "https://lccn.loc.gov/1" };
		expect(matchLocRecords([real(GOOGLE), twin], "9781492082798").matches).toHaveLength(2);
	});
});

describe("summaryText", () => {
	it("removes quotes and the attribution, in both forms", () => {
		expect(summaryText('"A book."-- Provided by publisher.')).toBe("A book.");
		expect(summaryText('"A book." -- Publisher description.')).toBe("A book.");
	});

	it("keeps quotes inside the text", () => {
		expect(summaryText('"What does "it" mean?" -- Publisher description.')).toBe(
			'What does "it" mean?',
		);
	});

	it("keeps any other summary as it is, on one line", () => {
		expect(summaryText("A plain\n summary.")).toBe("A plain summary.");
		expect(summaryText('"Quoted." -- Kirkus Reviews.')).toBe('"Quoted." -- Kirkus Reviews.');
		expect(summaryText("A book. -- Provided by publisher.")).toBe(
			"A book. -- Provided by publisher.",
		);
	});
});

type Node = Record<string, unknown>;
const id = (target: string) => [{ "@id": target }];
const value = (text: string) => [{ "@value": text }];

/** A record document with instance `1` and work `1`, plus the given nodes. */
function document(instance: Node, work: Node | null, extra: Node[] = []): string {
	const nodes: Node[] = [
		{
			"@id": "http://id.loc.gov/resources/instances/1",
			"@type": [`${BF}Instance`],
			[`${BF}title`]: id("_:title"),
			...(work === null
				? {}
				: { [`${BF}instanceOf`]: id("http://id.loc.gov/resources/works/1") }),
			...instance,
		},
		{ "@id": "_:title", "@type": [`${BF}Title`], [`${BF}mainTitle`]: value("Title") },
		...extra,
	];
	if (work !== null) {
		nodes.push({
			"@id": "http://id.loc.gov/resources/works/1",
			"@type": [`${BF}Work`],
			...work,
		});
	}
	return JSON.stringify(nodes);
}

function readDocument(instance: Node, work: Node | null = {}, extra: Node[] = []): LocRecord {
	return readLocRecord(JsonLdGraph.parse(document(instance, work, extra))!, "1");
}

const isbnNode = (node: string, isbn: string, cancinv = false): Node => ({
	"@id": node,
	"@type": [`${BF}Isbn`],
	[VALUE]: value(isbn),
	...(cancinv ? { [`${BF}status`]: id(`${VOCAB}mstatus/cancinv`) } : {}),
});

describe("readLocRecord field rules", () => {
	it("rejects a document without the instance, or an instance without title", () => {
		const graph = JsonLdGraph.parse(document({}, {}))!;
		expect(() => readLocRecord(graph, "2")).toThrow("LoC record 2 holds no instance.");
		expect(() => readDocument({ [`${BF}title`]: [] })).toThrow("LoC record 1 has no title.");
	});

	it("skips variant titles", () => {
		const book = readDocument(
			{ [`${BF}title`]: [{ "@id": "_:variant" }, { "@id": "_:title" }] },
			{},
			[
				{
					"@id": "_:variant",
					"@type": [`${BF}VariantTitle`],
					[`${BF}mainTitle`]: value("Variant"),
				},
			],
		);
		expect(book.title).toBe("Title");
	});

	it("reads strings NFC-normalised and trimmed", () => {
		const book = readDocument({ [`${BF}title`]: id("_:t") }, {}, [
			{ "@id": "_:t", "@type": [`${BF}Title`], [`${BF}mainTitle`]: value("  México ") },
		]);
		expect(book.title).toBe("México");
	});

	it("links the LCCN with spaces removed, else the id.loc.gov record", () => {
		const lccn = (text: string) => [
			{ "@id": "_:lccn", "@type": [`${BF}Lccn`], [VALUE]: value(text) },
		];
		const withLccn = readDocument(
			{ [`${BF}identifiedBy`]: id("_:lccn") },
			{},
			lccn("a 34001394"),
		);
		expect(withLccn.url).toBe("https://lccn.loc.gov/a34001394");
		expect(readDocument({}).url).toBe("https://id.loc.gov/resources/instances/1");
	});

	it("converts ISBN-10s and sorts ISBNs by status", () => {
		const book = readDocument(
			{ [`${BF}identifiedBy`]: [{ "@id": "_:a" }, { "@id": "_:b" }, { "@id": "_:c" }] },
			{},
			[
				isbnNode("_:a", "0-596-00610-1"),
				isbnNode("_:b", "9780596006105"),
				isbnNode("_:c", "978-1-982-16740-0", true),
			],
		);
		expect(book.isbns).toEqual(["9780596006105"]);
		expect(book.isbn).toBe("9780596006105");
		expect(book.otherEditionIsbns).toEqual(["9781982167400"]);
	});

	it("takes authors by role URI or code, named by the heading's $a, else the label", () => {
		const contribution = (node: string, agent: string, role: string): Node => ({
			"@id": node,
			[`${BF}agent`]: id(agent),
			[`${BF}role`]: id(role),
		});
		const book = readDocument(
			{},
			{
				[`${BF}contribution`]: ["_:c1", "_:c2", "_:c3", "_:c4"].map((node) => ({
					"@id": node,
				})),
			},
			[
				contribution("_:c1", "_:a1", `${VOCAB}relators/aut`),
				contribution("_:c2", "_:a2", "_:role"),
				contribution("_:c3", "_:a3", `${VOCAB}relators/trl`),
				contribution("_:c4", "_:a1", `${VOCAB}relators/aut`),
				{
					"@id": "_:a1",
					[LABEL]: value("King, Martin Luther, Jr., 1929-1968"),
					[MARC_KEY]: value("1001 $aKing, Martin Luther,$cJr.,$d1929-1968"),
				},
				{ "@id": "_:a2", [LABEL]: value("Straub, Peter") },
				{ "@id": "_:a3", [LABEL]: value("Translator, A.") },
				{ "@id": "_:role", [`${BF}code`]: value("aut") },
			],
		);
		expect(book.authors).toEqual(["King, Martin Luther", "Straub, Peter"]);
	});

	it("takes the year from the publication only", () => {
		const activity = (node: string, type: string, date: string): Node => ({
			"@id": node,
			"@type": [`${BF}ProvisionActivity`, `${BF}${type}`],
			[`${BF}date`]: value(date),
		});
		const book = readDocument(
			{ [`${BF}provisionActivity`]: [{ "@id": "_:m" }, { "@id": "_:p" }] },
			{},
			[activity("_:m", "Manufacture", "2019"), activity("_:p", "Publication", "2021?")],
		);
		expect(book.year).toBe(2021);
	});

	it("takes the first series with a title, and a decimal comma in its number", () => {
		const relation = (node: string, series: string, number: string): Node => ({
			"@id": node,
			[`${BF}relationship`]: id(`${VOCAB}relationship/series`),
			[`${BF}associatedResource`]: id(series),
			[`${BF}seriesEnumeration`]: value(number),
		});
		const book = readDocument(
			{},
			{ [`${BF}relation`]: [{ "@id": "_:other" }, { "@id": "_:r1" }, { "@id": "_:r2" }] },
			[
				{
					"@id": "_:other",
					[`${BF}relationship`]: id(`${VOCAB}relationship/relatedwork`),
					[`${BF}associatedResource`]: id("_:s2"),
				},
				relation("_:r1", "_:s1", "v. 3"),
				relation("_:r2", "_:s2", "Band 2,5"),
				{ "@id": "_:s1" },
				{ "@id": "_:s2", [`${BF}title`]: id("_:st") },
				{ "@id": "_:st", [`${BF}mainTitle`]: value("A series") },
			],
		);
		expect([book.series, book.seriesIndex]).toEqual(["A series", 2.5]);
	});

	it("reads the type from the RDA code URIs, the media from their labels", () => {
		const book = readDocument(
			{ [`${BF}carrier`]: id(`${VOCAB}carriers/cr`) },
			{ [`${BF}content`]: id(`${VOCAB}contentTypes/txt`) },
			[{ "@id": `${VOCAB}contentTypes/txt`, [LABEL]: value("text") }],
		);
		expect([book.type, book.media]).toEqual(["ebook", "text / cr"]);
		expect(readDocument({}).media).toBe("no content type / no carrier type");
		expect(readDocument({}).type).toBeNull();
	});

	it("leaves the work's fields empty without a work", () => {
		expect(readDocument({}, null)).toMatchObject({
			authors: [],
			series: null,
			type: null,
			description: null,
		});
	});

	it("leaves the description empty when the summary is nothing but the attribution", () => {
		const book = readDocument({}, { [`${BF}summary`]: id("_:s") }, [
			{ "@id": "_:s", [LABEL]: value('"" -- Publisher description.') },
		]);
		expect(book.description).toBeNull();
	});
});

describe("JsonLdGraph", () => {
	it("rejects what is not an array of nodes", () => {
		expect(JsonLdGraph.parse("<html>")).toBeNull();
		expect(JsonLdGraph.parse("{}")).toBeNull();
		expect(JsonLdGraph.parse('[{"no": "id"}]')).toBeNull();
	});

	it("follows a link to a node the document does not hold", () => {
		const graph = JsonLdGraph.parse(`[{"@id": "a", "p": [{"@id": "b"}, {"@value": "x"}]}]`)!;
		const node = graph.node("a")!;
		expect(graph.links(node, "p").map((linked) => linked.id)).toEqual(["b"]);
		expect(node.values("p")).toEqual(["x"]);
	});
});

describe("field coverage", () => {
	it("has a documented source for exactly the fields the mapping returns", () => {
		expect(Object.keys(LOC_RECORD_SOURCES).sort()).toEqual(Object.keys(real(GOOGLE)).sort());
	});

	it("has a shape check in the contract test for every field", () => {
		expect(Object.keys(LOC_RECORD_SHAPE).sort()).toEqual(Object.keys(real(GOOGLE)).sort());
		for (const id of ALL) expect(shapeMismatches(real(id))).toEqual([]);
	});

	it("sees every field filled by at least one real catalogue record", () => {
		const records = ALL.map(real);
		const empty = Object.keys(LOC_RECORD_SOURCES).filter((key) =>
			records.every((record) => {
				const value = record[key as keyof LocRecord];
				return (
					value === null || value === "" || (Array.isArray(value) && value.length === 0)
				);
			}),
		);
		expect(empty).toEqual([]);
	});
});
