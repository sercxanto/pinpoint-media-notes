import { describe, expect, it } from "vitest";
import { coverUrl, fetchBlurb, fetchCover, searchCatalogue } from "../../src/book/dnb";
import { importBook } from "../../src/book/importer";
import { readDnbRecord, recordIsbn, type DnbRecord } from "../../src/book/dnb-record";
import { fakeFiles } from "../helpers";
import { shapeMismatches } from "./dnb-shape";
import { nodeHttp } from "./node-http";

// Live checks against the DNB. They assert the shape of what comes back and
// which records link which, not catalogue text, which the DNB may revise.

/** Die 1 % Methode, paperback: blurb, cover, links in 776 $z and $w. */
const METHODE = { isbn: "9783442178582", idn: "1198618736" };
/** Die Känguru-Rebellion, e-book: series, linked to the paperback by 776 $w. */
const KAENGURU_EBOOK = "139261385X";
/** Die Känguru-Rebellion, audio CD: linked to another edition by 776 $z. */
const KAENGURU_CD = "1379107830";
/** Valid check digit, not a real book: the cover service answers 404. */
const NO_SUCH_ISBN = "9780000000002";

async function lookUpOne(index: "NUM" | "IDN", value: string): Promise<DnbRecord> {
	const records = await searchCatalogue(nodeHttp, index, value);
	expect(records).toHaveLength(1);
	return readDnbRecord(records[0]!);
}

describe("DNB catalogue (SRU)", () => {
	it("finds a book by ISBN, with every field in shape", async () => {
		const book = await lookUpOne("NUM", METHODE.isbn);
		expect(shapeMismatches(book)).toEqual([]);
		expect(book).toMatchObject({ idn: METHODE.idn, isbn: METHODE.isbn, type: "book" });
		expect(book.authors.length).toBeGreaterThan(0);
		expect(book.year).not.toBeNull();
		expect(book.blurbUrl).not.toBeNull();
		expect(book.otherEditionIsbns.length + book.otherEditionIdns.length).toBeGreaterThan(0);
	});

	it("finds a record by record number, with series and 776 $w", async () => {
		const book = await lookUpOne("IDN", KAENGURU_EBOOK);
		expect(shapeMismatches(book)).toEqual([]);
		expect(book.type).toBe("ebook");
		expect(book.series).not.toBeNull();
		expect(book.seriesIndex).not.toBeNull();
		expect(book.otherEditionIdns.length).toBeGreaterThan(0);
	});

	it("resolves a 776 $w link to a record with an ISBN", async () => {
		const book = await lookUpOne("IDN", KAENGURU_EBOOK);
		const [linked] = await searchCatalogue(nodeHttp, "IDN", book.otherEditionIdns[0]!);
		expect(linked).toBeDefined();
		expect(recordIsbn(linked!)).toMatch(/^97[89]\d{10}$/);
	});

	it("reads an audiobook with a 776 $z link", async () => {
		const book = await lookUpOne("IDN", KAENGURU_CD);
		expect(shapeMismatches(book)).toEqual([]);
		expect(book.type).toBe("audiobook");
		expect(book.otherEditionIsbns.length).toBeGreaterThan(0);
	});

	it("returns no record for an unknown ISBN", async () => {
		expect(await searchCatalogue(nodeHttp, "NUM", NO_SUCH_ISBN)).toEqual([]);
	});
});

describe("DNB blurb and cover services", () => {
	it("serves the blurb as HTML that yields text", async () => {
		const book = await lookUpOne("NUM", METHODE.isbn);
		const blurb = await fetchBlurb(nodeHttp, book.blurbUrl!);
		expect(blurb).toMatchObject({ ok: true });
		if (blurb.ok) {
			expect(blurb.text.length).toBeGreaterThan(0);
			expect(blurb.text.length).toBeLessThan(500);
		}
	});

	// Fails with the reason when the bot filter starts challenging requests.
	it("serves a cover as image/*", async () => {
		const cover = await fetchCover(nodeHttp, METHODE.isbn, "l");
		expect(cover.ok ? "image" : cover.reason).toBe("image");
	});

	// Documents why DNB_HEADERS exists: if this starts failing, the filter
	// changed and the User-Agent may no longer be needed (or enough).
	it("challenges a browser-like User-Agent with an HTML page", async () => {
		const response = await nodeHttp(coverUrl(METHODE.isbn, "l"), {
			"User-Agent": "Mozilla/5.0 obsidian/1.13.1 Electron",
		});
		expect(response.status).toBe(200);
		expect(response.header("Content-Type")).toMatch(/^text\/html/);
	});

	it("answers 404 for an ISBN without cover", async () => {
		expect(await fetchCover(nodeHttp, NO_SUCH_ISBN, "s")).toMatchObject({
			ok: false,
			failure: "missing",
		});
	});
});

describe("importBook against the live services", () => {
	it("writes the note and its cover", async () => {
		const files = fakeFiles();
		const result = await importBook(METHODE.isbn, {
			http: nodeHttp,
			files: files.vault,
			config: { notesDir: "Books", assetsDir: "assets", coverSize: "m" },
			chooseRecord: () => Promise.reject(new Error("unexpected record choice")),
		});
		expect(result.coverPath).toMatch(/^assets\/.+\.(jpg|png|gif|webp|avif)$/);
		expect(result.message).toContain(`Cover from ISBN ${METHODE.isbn}.`);
		const note = files.files.get(result.notePath);
		expect(note).toMatch(/^---\ntemplate: "\[\[Book Template\]\]"\ntype: book\n/);
	});
});
