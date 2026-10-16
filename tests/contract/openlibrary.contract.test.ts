import { describe, expect, it } from "vitest";
import { fetchOpenLibraryCover, fetchOpenLibraryTitle } from "../../src/book/openlibrary";
import { nodeHttp } from "./node-http";

// Live checks against openlibrary.org and covers.openlibrary.org. They assert
// how hits and misses come back, not titles, which anyone may edit.

/** Software engineering at Google: an edition with a cover, served from openlibrary.org. */
const GOOGLE = "9781492082798";
/** The Pragmatic Programmer: a cover redirected to archive.org. */
const PRAGMATIC = "9780135957059";
/** Building a second brain: the e-book has an edition but no cover, the hardcover has one. */
const BRAIN = { ebook: "9781982167400", hardcover: "9781982167387" };
/** Think Like a Street Photographer, Laurence King: not in Open Library. */
const NOT_LISTED = "9781399615310";

describe("Open Library", () => {
	it("finds an edition by ISBN, through the redirect", async () => {
		const result = await fetchOpenLibraryTitle(nodeHttp, GOOGLE);
		expect(result.kind).toBe("title");
	});

	it("answers HTTP 404 for an ISBN it does not have", async () => {
		expect(await fetchOpenLibraryTitle(nodeHttp, NOT_LISTED)).toEqual({ kind: "none" });
	});

	it("serves a cover as an image, also through a redirect", async () => {
		for (const isbn of [GOOGLE, PRAGMATIC, BRAIN.hardcover]) {
			const cover = await fetchOpenLibraryCover(nodeHttp, isbn, "s");
			expect(cover).toMatchObject({ ok: true, extension: "jpg" });
		}
	});

	it("answers HTTP 404 for a missing cover", async () => {
		expect(await fetchOpenLibraryTitle(nodeHttp, BRAIN.ebook)).toMatchObject({ kind: "title" });
		expect(await fetchOpenLibraryCover(nodeHttp, BRAIN.ebook, "l")).toMatchObject({
			ok: false,
			failure: "missing",
		});
	});
});
