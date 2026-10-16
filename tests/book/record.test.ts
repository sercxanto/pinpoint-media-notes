import { describe, expect, it } from "vitest";
import { describeRecord, rdaBookType, type BookRecord } from "../../src/book/record";

const BOOK: BookRecord = {
	catalogue: "dnb",
	url: "https://d-nb.info/139261385X",
	title: "Die Känguru-Rebellion",
	originalTitle: "Die Känguru-Rebellion",
	authors: ["Kling, Marc-Uwe"],
	isbn: "9783843737876",
	year: 2026,
	series: null,
	seriesIndex: null,
	type: "ebook",
	media: "Text / Online-Ressource",
	otherEditionIsbns: [],
};

describe("rdaBookType", () => {
	it("maps content and carrier codes", () => {
		expect(rdaBookType(["txt"], ["nc"])).toBe("book");
		expect(rdaBookType(["txt"], ["cr"])).toBe("ebook");
		expect(rdaBookType(["spw"], ["sd"])).toBe("audiobook");
		expect(rdaBookType(["spw"], ["cr"])).toBe("audiobook");
		expect(rdaBookType(["spw"], [])).toBe("audiobook");
	});

	it("takes the first matching carrier", () => {
		expect(rdaBookType(["txt"], ["he", "cr", "nc"])).toBe("ebook");
	});

	it("rejects other material", () => {
		expect(rdaBookType(["ntm"], ["nc"])).toBeNull();
		expect(rdaBookType(["cri"], ["nb"])).toBeNull();
		expect(rdaBookType(["txt"], ["he"])).toBeNull();
		expect(rdaBookType(["txt"], [])).toBeNull();
		expect(rdaBookType([], ["nc"])).toBeNull();
	});
});

describe("describeRecord", () => {
	it("gives title, year, type, ISBN and the record's link", () => {
		expect(describeRecord(BOOK)).toEqual({
			name: "Die Känguru-Rebellion (2026)",
			details: "ebook, ISBN 9783843737876, https://d-nb.info/139261385X",
		});
	});

	it("names unsupported material by its catalogued media", () => {
		expect(
			describeRecord({
				...BOOK,
				url: "https://lccn.loc.gov/2019000001",
				title: "Karte",
				year: null,
				isbn: null,
				type: null,
				media: "no content type / no carrier type",
			}),
		).toEqual({
			name: "Karte (no year)",
			details: "no content type / no carrier type, no ISBN, https://lccn.loc.gov/2019000001",
		});
	});
});
