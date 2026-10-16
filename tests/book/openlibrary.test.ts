import { describe, expect, it } from "vitest";
import {
	fetchOpenLibraryCover,
	fetchOpenLibraryTitle,
	openLibraryCoverUrl,
	openLibraryEditionUrl,
} from "../../src/book/openlibrary";
import { BOOK_HOST_HEADERS } from "../../src/io/http";
import { fakeHttp, fixture } from "../helpers";

const ISBN = "9781492082798";
const EDITION = openLibraryEditionUrl(ISBN);

describe("Open Library URLs", () => {
	it("builds the edition and cover URLs from the spec", () => {
		expect(EDITION).toBe("https://openlibrary.org/isbn/9781492082798.json");
		expect(openLibraryCoverUrl(ISBN, "l")).toBe(
			"https://covers.openlibrary.org/b/isbn/9781492082798-L.jpg?default=false",
		);
	});

	it("maps the cover size setting to S, M, L", () => {
		expect(["s", "m", "l"].map((size) => openLibraryCoverUrl(ISBN, size as "s"))).toEqual(
			["S", "M", "L"].map(
				(size) => `https://covers.openlibrary.org/b/isbn/${ISBN}-${size}.jpg?default=false`,
			),
		);
	});
});

describe("fetchOpenLibraryTitle", () => {
	it("reads the edition title, without the subtitle", async () => {
		const http = fakeHttp({
			[EDITION]: { body: fixture("openlibrary/edition-9781492082798.json") },
		});
		expect(await fetchOpenLibraryTitle(http.get, ISBN)).toEqual({
			kind: "title",
			title: "Software Engineering at Google",
		});
		expect(http.headers).toEqual([BOOK_HOST_HEADERS]);
	});

	it("reads a title without the edition statement", async () => {
		const isbn = "9780135957059";
		const http = fakeHttp({
			[openLibraryEditionUrl(isbn)]: {
				body: fixture("openlibrary/edition-9780135957059.json"),
			},
		});
		expect(await fetchOpenLibraryTitle(http.get, isbn)).toEqual({
			kind: "title",
			title: "The Pragmatic Programmer",
		});
	});

	it("normalises and trims the title", async () => {
		const body = JSON.stringify({ title: "  Café Society " });
		const http = fakeHttp({ [EDITION]: { body } });
		expect(await fetchOpenLibraryTitle(http.get, ISBN)).toEqual({
			kind: "title",
			title: "Café Society",
		});
	});

	it("takes HTTP 404 for no edition", async () => {
		const http = fakeHttp({
			[EDITION]: { status: 404, contentType: "text/html", body: "<html></html>" },
		});
		expect(await fetchOpenLibraryTitle(http.get, ISBN)).toEqual({ kind: "none" });
	});

	it("reports any other failure", async () => {
		const cases: [Parameters<typeof fakeHttp>[0][string], string][] = [
			[new Error("offline"), "Open Library could not be reached (offline)"],
			[{ status: 503 }, "Open Library answered with HTTP 503"],
			[{ status: 302 }, "Open Library answered with HTTP 302"],
			[{ body: "<html>" }, "Open Library sent an edition that is not JSON"],
			[{ body: "[]" }, "the Open Library edition has no title"],
			[{ body: '{"title": " "}' }, "the Open Library edition has no title"],
			[{ body: '{"title": 7}' }, "the Open Library edition has no title"],
		];
		for (const [route, reason] of cases) {
			const http = fakeHttp({ [EDITION]: route });
			expect(await fetchOpenLibraryTitle(http.get, ISBN)).toEqual({ kind: "failed", reason });
		}
	});
});

describe("fetchOpenLibraryCover", () => {
	const url = openLibraryCoverUrl(ISBN, "m");
	const image = new Uint8Array([0xff, 0xd8, 0xff]).buffer;

	it("downloads an image", async () => {
		const http = fakeHttp({ [url]: { contentType: "image/jpeg", body: image } });
		expect(await fetchOpenLibraryCover(http.get, ISBN, "m")).toEqual({
			ok: true,
			data: image,
			extension: "jpg",
		});
		expect(http.calls).toEqual([url]);
		expect(http.headers).toEqual([BOOK_HOST_HEADERS]);
	});

	it("takes HTTP 404 as missing, so the next ISBN is tried", async () => {
		const http = fakeHttp({});
		expect(await fetchOpenLibraryCover(http.get, ISBN, "m")).toEqual({
			ok: false,
			failure: "missing",
			reason: `the cover server has no cover for ISBN ${ISBN}`,
		});
	});

	it("takes anything but an image as blocked", async () => {
		const http = fakeHttp({ [url]: { status: 302, contentType: "text/html" } });
		expect(await fetchOpenLibraryCover(http.get, ISBN, "m")).toEqual({
			ok: false,
			failure: "blocked",
			reason: "the cover server answered with HTTP 302 and text/html instead of an image",
		});
	});
});
