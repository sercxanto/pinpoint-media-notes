import { describe, expect, it } from "vitest";
import { parseSruResponse } from "../../src/book/marc";
import {
	DNB_RECORD_SOURCES,
	isDnbBlurbUrl,
	readDnbRecord,
	type DnbRecord,
} from "../../src/book/dnb-record";
import { DNB_RECORD_SHAPE, shapeMismatches } from "../contract/dnb-shape";
import { fixture, marcRecord, sruResponse, type TestField } from "../helpers";

function readOne(fields: TestField[]): DnbRecord {
	const [record] = parseSruResponse(sruResponse([marcRecord("1234567890", fields)]));
	return readDnbRecord(record!);
}

const TEXT_BAND: TestField[] = [
	["245", [["a", "Titel"]]],
	["336", [["a", "Text"]]],
	["338", [["a", "Band"]]],
];

const methode = (): DnbRecord =>
	readDnbRecord(parseSruResponse(fixture("book/sru-1-prozent-methode.xml"))[0]!);
const kaenguru = (): DnbRecord[] =>
	parseSruResponse(fixture("book/sru-kaenguru-rebellion.xml")).map(readDnbRecord);

// Full expected values: a new field on DnbRecord breaks these until the
// fixtures' expectations cover it.
describe("readDnbRecord on real catalogue records", () => {
	it("maps a translated paperback, without the translator", () => {
		expect(methode()).toEqual<DnbRecord>({
			catalogue: "dnb",
			url: "https://d-nb.info/1198618736",
			idn: "1198618736",
			title: "Die 1 % Methode",
			originalTitle: "Atomic habits",
			authors: ["Clear, James"],
			isbn: "9783442178582",
			year: 2020,
			series: null,
			seriesIndex: null,
			type: "book",
			media: "Text / Band",
			blurbUrl: "https://services.dnb.de/plus/idn/1198618736/blurb/",
			otherEditionIsbns: ["9783844538458"],
			otherEditionIdns: ["1208614460"],
		});
	});

	it("maps the editions of one work: audio CD, paperback, e-book, audio download, illustrated", () => {
		const [cd, paperback, ebook, download, illustrated] = kaenguru();
		expect(cd).toEqual<DnbRecord>({
			catalogue: "dnb",
			url: "https://d-nb.info/1379107830",
			idn: "1379107830",
			title: "Die Känguru-Rebellion",
			originalTitle: "Die Känguru-Rebellion",
			authors: ["Kling, Marc-Uwe"],
			isbn: "9783957133373",
			year: 2026,
			series: null,
			seriesIndex: null,
			type: "audiobook",
			media: "gesprochenes Wort / Audiodisk",
			blurbUrl: "https://services.dnb.de/plus/idn/1379107830/blurb/",
			otherEditionIsbns: ["9783844944549"],
			otherEditionIdns: [],
		});
		expect(paperback).toMatchObject({
			idn: "1379188067",
			type: "book",
			year: 2026,
			otherEditionIsbns: [],
			otherEditionIdns: ["139261385X"],
		});
		expect(ebook).toEqual<DnbRecord>({
			catalogue: "dnb",
			url: "https://d-nb.info/139261385X",
			idn: "139261385X",
			title: "Die Känguru-Rebellion",
			originalTitle: "Die Känguru-Rebellion",
			authors: ["Kling, Marc-Uwe"],
			isbn: "9783843737876",
			year: 2026,
			series: "Die Känguru-Werke",
			seriesIndex: 5,
			type: "ebook",
			media: "Text / Online-Ressource",
			blurbUrl: null,
			otherEditionIsbns: [],
			otherEditionIdns: ["1379188067"],
		});
		// 100 carries the reading artist ($4 art), the author is in 700,
		// the narrator in another 700 ($4 nrt).
		expect(download).toMatchObject({
			idn: "1392644321",
			authors: ["Kling, Marc-Uwe"],
			type: "audiobook",
			year: 2026,
		});
		// The illustrator ($4 ill) is not an author.
		expect(illustrated).toMatchObject({
			idn: "1395073848",
			authors: ["Kling, Marc-Uwe"],
			otherEditionIsbns: ["9783548074108", "9783843737876"],
		});
	});

	it("ignores publisher homepages labelled Inhaltstext", () => {
		// The CD record lists the publisher's homepage after the DNB link.
		expect(kaenguru()[0]?.blurbUrl).toMatch(/^https:\/\/services\.dnb\.de\//);
	});
});

describe("readDnbRecord field rules", () => {
	it("derives the type from the RDA codes in $b", () => {
		const typed = (content: TestField[1], carrier: TestField[1]) =>
			readOne([
				["245", [["a", "T"]]],
				["336", content],
				["338", carrier],
			]).type;
		expect(typed([["b", "txt"]], [["b", "nc"]])).toBe("book");
		expect(typed([["b", "txt"]], [["b", "cr"]])).toBe("ebook");
		expect(typed([["b", "spw"]], [["b", "sd"]])).toBe("audiobook");
		// The code wins over the term.
		expect(
			typed(
				[
					["a", "Noten"],
					["b", "txt"],
				],
				[
					["a", "Mikrofiche"],
					["b", "nc"],
				],
			),
		).toBe("book");
		expect(
			typed(
				[
					["a", "Text"],
					["b", "ntm"],
				],
				[
					["a", "Band"],
					["b", "nc"],
				],
			),
		).toBeNull();
	});

	it("reads the German term in $a when a field has no code", () => {
		const typed = (content: string, carrier: string) =>
			readOne([
				["245", [["a", "T"]]],
				["336", [["a", content]]],
				["338", [["a", carrier]]],
			]).type;
		expect(typed("Text", "Band")).toBe("book");
		expect(typed("Text", "Online-Ressource")).toBe("ebook");
		expect(typed("gesprochenes Wort", "Audiodisk")).toBe("audiobook");
		expect(typed("gesprochenes Wort", "Online-Ressource")).toBe("audiobook");
		expect(typed("Noten", "Band")).toBeNull();
		expect(typed("kartografisches Bild", "Blatt")).toBeNull();
		expect(typed("Text", "Mikrofiche")).toBeNull();
	});

	it("describes unsupported media", () => {
		expect(readOne([["245", [["a", "T"]]]]).media).toBe("no content type / no carrier type");
		expect(
			readOne([
				["245", [["a", "T"]]],
				["336", [["a", "zweidimensionales bewegtes Bild"]]],
				["338", [["a", "Videodisk"]]],
			]).media,
		).toBe("zweidimensionales bewegtes Bild / Videodisk");
	});

	it("takes authors from 100 and 700 only where $4 is aut", () => {
		const book = readOne([
			...TEXT_BAND,
			[
				"100",
				[
					["a", "Eins, Autorin"],
					["4", "aut"],
				],
			],
			[
				"700",
				[
					["a", "Zwei, Autor"],
					["4", "aut"],
				],
			],
			[
				"700",
				[
					["a", "Über, Setzerin"],
					["4", "trl"],
				],
			],
			[
				"700",
				[
					["a", "Sprech, Er"],
					["4", "nrt"],
				],
			],
			[
				"700",
				[
					["a", "Heraus, Geber"],
					["4", "edt"],
				],
			],
			["700", [["a", "Ohne, Rolle"]]],
		]);
		expect(book.authors).toEqual(["Eins, Autorin", "Zwei, Autor"]);
	});

	it("writes no authors when the record names none", () => {
		expect(readOne(TEXT_BAND).authors).toEqual([]);
	});

	it("falls back to the title for original_title", () => {
		expect(readOne(TEXT_BAND).originalTitle).toBe("Titel");
	});

	it("prefers the ISBN-13 and converts an ISBN-10-only record", () => {
		expect(
			readOne([
				...TEXT_BAND,
				["020", [["a", "3442178584"]]],
				["020", [["a", "9783442178582"]]],
			]).isbn,
		).toBe("9783442178582");
		expect(readOne([...TEXT_BAND, ["020", [["a", "3-442-17858-4"]]]]).isbn).toBe(
			"9783442178582",
		);
		expect(readOne(TEXT_BAND).isbn).toBeNull();
	});

	it("reads other editions from 776: ISBNs from $z, DNB record numbers from $w", () => {
		const book = readOne([
			...TEXT_BAND,
			["776", [["z", "978-3-442-17858-2"]]],
			[
				"776",
				[
					["w", "(DE-101)1208614460"],
					["w", "(DE-600)2345678-9"],
				],
			],
			["776", [["z", "3442178584"]]],
			["776", [["z", "kein ISBN"]]],
			["776", [["w", "(DE-101)1234567890"]]],
			["776", [["w", "(DE-101)139261385x"]]],
		]);
		// Duplicates, other libraries' numbers, the record itself and junk are dropped.
		expect(book.otherEditionIsbns).toEqual(["9783442178582"]);
		expect(book.otherEditionIdns).toEqual(["1208614460", "139261385X"]);
	});

	it("prefers the publication statement for the year, then 260", () => {
		expect(
			readOne([
				...TEXT_BAND,
				["264", [["c", "© 2019"]], "4"],
				[
					"264",
					[
						["a", "Berlin"],
						["c", "[2021]"],
					],
					"1",
				],
			]).year,
		).toBe(2021);
		expect(readOne([...TEXT_BAND, ["264", [["c", "© 2019"]], "4"]]).year).toBe(2019);
		expect(readOne([...TEXT_BAND, ["260", [["c", "c1998"]]]]).year).toBe(1998);
		expect(readOne([...TEXT_BAND, ["264", [["c", "o.J."]], "1"]]).year).toBeNull();
	});

	it("reads the series from 490, else 830, with the number only", () => {
		expect(
			readOne([
				...TEXT_BAND,
				[
					"490",
					[
						["a", "Reihe"],
						["v", "Band 5"],
					],
				],
			]),
		).toMatchObject({
			series: "Reihe",
			seriesIndex: 5,
		});
		expect(
			readOne([
				...TEXT_BAND,
				[
					"830",
					[
						["a", "Werke"],
						["v", "vol. 12"],
					],
				],
			]),
		).toMatchObject({
			series: "Werke",
			seriesIndex: 12,
		});
		expect(
			readOne([
				...TEXT_BAND,
				[
					"490",
					[
						["a", "Reihe"],
						["v", "2,5"],
					],
				],
			]).seriesIndex,
		).toBe(2.5);
		expect(
			readOne([
				...TEXT_BAND,
				[
					"490",
					[
						["a", "Reihe"],
						["v", "Sonderband"],
					],
				],
			]),
		).toMatchObject({ series: "Reihe", seriesIndex: null });
	});

	it("follows only the DNB's own Inhaltstext link", () => {
		const blurb = (links: [string, string][]) =>
			readOne([
				...TEXT_BAND,
				...links.map(([label, url]): TestField => [
					"856",
					[
						["u", url],
						["3", label],
					],
				]),
			]).blurbUrl;
		expect(blurb([["Inhaltstext", "https://www.verlag.de/"]])).toBeNull();
		expect(blurb([["Inhaltsverzeichnis", "https://d-nb.info/1234567890/04"]])).toBeNull();
		expect(
			blurb([
				["Inhaltstext", "https://www.verlag.de/"],
				["Inhaltstext", "https://services.dnb.de/plus/idn/1234567890/blurb/"],
			]),
		).toBe("https://services.dnb.de/plus/idn/1234567890/blurb/");
	});

	it("recognises DNB blurb hosts", () => {
		expect(isDnbBlurbUrl("https://services.dnb.de/plus/idn/1/blurb/")).toBe(true);
		expect(isDnbBlurbUrl("https://services.dnb.de.evil.example/")).toBe(false);
		expect(isDnbBlurbUrl("not a url")).toBe(false);
	});

	it("rejects a record without a title", () => {
		expect(() => readOne([["336", [["a", "Text"]]]])).toThrow("has no title");
	});
});

describe("field coverage", () => {
	it("has a documented source for exactly the fields the mapping returns", () => {
		expect(Object.keys(DNB_RECORD_SOURCES).sort()).toEqual(Object.keys(methode()).sort());
	});

	it("has a shape check in the contract test for every field", () => {
		expect(Object.keys(DNB_RECORD_SHAPE).sort()).toEqual(Object.keys(methode()).sort());
		for (const book of [methode(), ...kaenguru()]) expect(shapeMismatches(book)).toEqual([]);
	});

	it("sees every field filled by at least one real catalogue record", () => {
		const records = [methode(), ...kaenguru()];
		const empty = Object.keys(DNB_RECORD_SOURCES).filter((key) =>
			records.every((record) => {
				const value = record[key as keyof DnbRecord];
				return (
					value === null || value === "" || (Array.isArray(value) && value.length === 0)
				);
			}),
		);
		expect(empty).toEqual([]);
	});
});
