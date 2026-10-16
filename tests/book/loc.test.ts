import { describe, expect, it } from "vitest";
import {
	fetchLocRecord,
	locDocumentUrl,
	locSearchUrl,
	LOC_MAX_RECORDS,
	searchLoc,
} from "../../src/book/loc";
import { BOOK_HOST_HEADERS } from "../../src/io/http";
import { fakeHttp, fixture } from "../helpers";

const ISBN = "9781492082798";
const SEARCH = locSearchUrl(ISBN);

describe("LoC URLs", () => {
	it("builds the search and document URLs from the spec", () => {
		expect(SEARCH).toBe(
			"https://id.loc.gov/resources/instances/suggest2?q=9781492082798&searchtype=keyword",
		);
		expect(locDocumentUrl("22483650")).toBe(
			"https://id.loc.gov/resources/instances/22483650.cbd.json",
		);
	});
});

describe("searchLoc", () => {
	it("returns the hits' record numbers", async () => {
		const http = fakeHttp({ [SEARCH]: { body: fixture("loc/search-9781492082798.json") } });
		expect(await searchLoc(http.get, ISBN)).toEqual(["22483650"]);
		expect(http.headers).toEqual([BOOK_HOST_HEADERS]);
	});

	it("returns both records that list an e-book ISBN", async () => {
		const isbn = "9781982167400";
		const http = fakeHttp({
			[locSearchUrl(isbn)]: { body: fixture("loc/search-9781982167400.json") },
		});
		expect(await searchLoc(http.get, isbn)).toEqual(["22338086", "22339234"]);
	});

	it("returns nothing for no hit", async () => {
		const isbn = "9781399615310";
		const http = fakeHttp({
			[locSearchUrl(isbn)]: { body: fixture("loc/search-9781399615310.json") },
		});
		expect(await searchLoc(http.get, isbn)).toEqual([]);
	});

	it(`keeps the first ${LOC_MAX_RECORDS} hits, each once`, async () => {
		const tokens = ["1", "1", ...Array.from({ length: 12 }, (_, index) => String(index + 2))];
		const body = JSON.stringify({ hits: tokens.map((token) => ({ token })) });
		const http = fakeHttp({ [SEARCH]: { body } });
		expect(await searchLoc(http.get, ISBN)).toEqual(
			Array.from({ length: LOC_MAX_RECORDS }, (_, index) => String(index + 1)),
		);
	});

	it("fails the entry on network failure, HTTP status and unreadable answers", async () => {
		const cases: [Parameters<typeof fakeHttp>[0][string], string][] = [
			[new Error("offline"), "Could not reach the LoC catalogue: offline"],
			[{ status: 503 }, "The LoC catalogue answered with HTTP 503."],
			[{ body: "<html>" }, "The LoC catalogue sent a search result that is not JSON."],
			[{ body: "{}" }, "The LoC catalogue sent a search result without hits."],
		];
		for (const [route, message] of cases) {
			const http = fakeHttp({ [SEARCH]: route });
			await expect(searchLoc(http.get, ISBN)).rejects.toThrow(message);
		}
	});
});

describe("fetchLocRecord", () => {
	const url = locDocumentUrl("22483650");

	it("fetches and maps the record document", async () => {
		const http = fakeHttp({ [url]: { body: fixture("loc/instance-22483650.cbd.json") } });
		const book = await fetchLocRecord(http.get, "22483650");
		expect(book).toMatchObject({ id: "22483650", title: "Software engineering at Google" });
		expect(http.headers).toEqual([BOOK_HOST_HEADERS]);
	});

	it("fails the entry on HTTP status and invalid JSON", async () => {
		await expect(fetchLocRecord(fakeHttp({}).get, "22483650")).rejects.toThrow(
			"The LoC catalogue answered with HTTP 404.",
		);
		await expect(
			fetchLocRecord(fakeHttp({ [url]: { body: "<html>" } }).get, "22483650"),
		).rejects.toThrow("LoC record 22483650 is not a JSON-LD document.");
	});
});
