import { describe, expect, it } from "vitest";
import { fetchLocRecord, searchLoc } from "../../src/book/loc";
import { matchLocRecords } from "../../src/book/loc-record";
import { shapeMismatches } from "./loc-shape";
import { nodeHttp } from "./node-http";

// Live checks against id.loc.gov. They assert the shape of what comes back
// and which records list which ISBN, not catalogue text, which the LoC may
// revise.

/** Software engineering at Google: one hit, three authors. */
const GOOGLE = { isbn: "9781492082798", id: "22483650" };
/** Building a second brain: the e-book ISBN is listed by the print record too. */
const BRAIN = { ebook: "9781982167400", ebookId: "22339234", printId: "22338086" };
/** Leviathan wakes: a numbered series. */
const LEVIATHAN = { isbn: "9780316129084", id: "16523661" };
/** The Daily Show (the audiobook): spoken word on CD. */
const DAILY_SHOW = { isbn: "9781478936558", id: "19805382" };
/** Measuring the world: a translation from German. */
const KEHLMANN = { isbn: "9780375424465", id: "14268223" };
/** Think Like a Street Photographer, Laurence King: a British edition, not catalogued. */
const NOT_CATALOGUED = "9781399615310";

describe("LoC catalogue (id.loc.gov)", () => {
	it("finds a record by ISBN, with every field in shape", async () => {
		expect(await searchLoc(nodeHttp, GOOGLE.isbn)).toEqual([GOOGLE.id]);
		const book = await fetchLocRecord(nodeHttp, GOOGLE.id);
		expect(shapeMismatches(book)).toEqual([]);
		expect(book).toMatchObject({ isbn: GOOGLE.isbn, type: "book" });
		expect(book.url).toMatch(/^https:\/\/lccn\.loc\.gov\//);
		expect(book.authors).toHaveLength(3);
		expect(book.year).not.toBeNull();
	});

	it("finds both records for an e-book ISBN; only the e-book's counts", async () => {
		const ids = await searchLoc(nodeHttp, BRAIN.ebook);
		expect([...ids].sort()).toEqual([BRAIN.printId, BRAIN.ebookId].sort());
		const records = [];
		for (const id of ids) records.push(await fetchLocRecord(nodeHttp, id));
		for (const book of records) expect(shapeMismatches(book)).toEqual([]);
		const { matches, otherFormat } = matchLocRecords(records, BRAIN.ebook);
		expect(matches.map((book) => [book.id, book.type])).toEqual([[BRAIN.ebookId, "ebook"]]);
		expect(otherFormat.map((book) => book.id)).toEqual([BRAIN.printId]);
		expect(matches[0]?.description).not.toBeNull();
	});

	it("reads a series number", async () => {
		expect(await searchLoc(nodeHttp, LEVIATHAN.isbn)).toEqual([LEVIATHAN.id]);
		const book = await fetchLocRecord(nodeHttp, LEVIATHAN.id);
		expect(shapeMismatches(book)).toEqual([]);
		expect(book.series).not.toBeNull();
		expect(book.seriesIndex).toBe(1);
	});

	it("reads an audiobook", async () => {
		expect(await searchLoc(nodeHttp, DAILY_SHOW.isbn)).toEqual([DAILY_SHOW.id]);
		const book = await fetchLocRecord(nodeHttp, DAILY_SHOW.id);
		expect(shapeMismatches(book)).toEqual([]);
		expect(book.type).toBe("audiobook");
	});

	it("reads a translation's original title", async () => {
		expect(await searchLoc(nodeHttp, KEHLMANN.isbn)).toEqual([KEHLMANN.id]);
		const book = await fetchLocRecord(nodeHttp, KEHLMANN.id);
		expect(shapeMismatches(book)).toEqual([]);
		expect(book.originalTitle).not.toBe(book.title);
	});

	it("returns no hit for an ISBN it does not have", async () => {
		expect(await searchLoc(nodeHttp, NOT_CATALOGUED)).toEqual([]);
	});
});
