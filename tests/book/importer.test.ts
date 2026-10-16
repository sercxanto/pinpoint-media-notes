import { describe, expect, it, vi } from "vitest";
import { coverUrl, sruUrl } from "../../src/book/dnb";
import {
	bookImportConfig,
	importBook,
	type BookImportConfig,
	type BookImportDeps,
} from "../../src/book/importer";
import { locDocumentUrl, locSearchUrl } from "../../src/book/loc";
import { openLibraryCoverUrl, openLibraryEditionUrl } from "../../src/book/openlibrary";
import type { BookRecord } from "../../src/book/record";
import { ConfigError, EntryError } from "../../src/core/errors";
import { DEFAULT_SETTINGS } from "../../src/settings";
import {
	fakeFiles,
	fakeHttp,
	fixture,
	marcRecord,
	sruResponse,
	type FakeResponse,
	type TestField,
} from "../helpers";

const CONFIG: BookImportConfig = { notesDir: "Books", assetsDir: "assets", coverSize: "l" };

const ISBN = "9783442178582";
const IDN = "1198618736";
const BLURB = `https://services.dnb.de/plus/idn/${IDN}/blurb/`;
const NOTE = "Books/Die 1 % Methode (2020).md";
const IMAGE = "assets/Die 1 % Methode (2020).jpg";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff]).buffer;

const found: FakeResponse = { body: fixture("book/sru-1-prozent-methode.xml") };
const none: FakeResponse = { body: fixture("book/sru-empty.xml") };
const blurb: FakeResponse = {
	contentType: "text/html",
	body: "<html><body><div>Ein Buch über Gewohnheiten. Es hilft.</div></body></html>",
};
const cover: FakeResponse = { contentType: "image/jpeg", body: JPEG };

function noChoiceExpected<T extends BookRecord>(_records: T[]): Promise<T | null> {
	return Promise.reject(new Error("unexpected record choice"));
}

/** Chooses the record at `index` and keeps every list offered. */
function choosing(index: number) {
	const offered: BookRecord[][] = [];
	const choose = <T extends BookRecord>(records: T[]): Promise<T | null> => {
		offered.push(records);
		return Promise.resolve(records[index] ?? null);
	};
	return { choose, offered };
}

function setup(
	routes: Record<string, FakeResponse | Error>,
	existing: string[] = [],
	chooseRecord: BookImportDeps["chooseRecord"] = noChoiceExpected,
) {
	const log: string[] = [];
	const http = fakeHttp(routes, log);
	const files = fakeFiles(existing, log);
	const run = (input: string) =>
		importBook(input, { http: http.get, files: files.vault, config: CONFIG, chooseRecord });
	return { log, http, files, run, chooseRecord };
}

const happyRoutes = {
	[sruUrl("NUM", ISBN)]: found,
	[BLURB]: blurb,
	[coverUrl(ISBN, "l")]: cover,
};

describe("importBook", () => {
	it("looks up, fetches blurb and cover, and writes the note last", async () => {
		const { log, files, run } = setup(happyRoutes);
		const result = await run("978-3-442-17858-2");

		expect(log).toEqual([
			`GET ${sruUrl("NUM", ISBN)}`,
			`GET ${BLURB}`,
			`GET ${coverUrl(ISBN, "l")}`,
			`image ${IMAGE}`,
			`note ${NOTE}`,
		]);
		expect(result).toEqual({
			notePath: NOTE,
			coverPath: IMAGE,
			message: `Created "${NOTE}". Cover from ISBN ${ISBN}.`,
		});
		expect(files.files.get(IMAGE)).toBe(JPEG);
		const note = files.files.get(NOTE) as string;
		expect(note).toContain("\ndescription: Ein Buch über Gewohnheiten. Es hilft.\n");
		expect(note).toContain(`\ncover: "[[${IMAGE}]]"\n`);
		expect([...files.folders].sort()).toEqual(["Books", "assets"]);
	});

	it("names itself to every DNB service, so the cover bot filter lets it through", async () => {
		const { http, run } = setup(happyRoutes);
		await run(ISBN);
		expect(http.calls).toHaveLength(3);
		for (const sent of http.headers) {
			expect(sent?.["User-Agent"]).toBe(
				"pinpoint-media-notes (Obsidian plugin; +https://github.com/sercxanto/pinpoint-media-notes)",
			);
		}
	});

	it("builds the SRU and cover URLs from the spec", () => {
		expect(sruUrl("NUM", ISBN)).toBe(
			"https://services.dnb.de/sru/dnb?version=1.1&operation=searchRetrieve&recordSchema=MARC21-xml&maximumRecords=10&query=NUM%3D9783442178582",
		);
		expect(sruUrl("IDN", "139261385X")).toContain("&query=IDN%3D139261385X");
		expect(coverUrl(ISBN, "m")).toBe(
			"https://portal.dnb.de/opac/mvb/cover?isbn=9783442178582&size=m",
		);
	});

	it("skips a name collision before the blurb or cover is fetched", async () => {
		const { log, files, run } = setup(happyRoutes, [NOTE]);
		await expect(run(ISBN)).rejects.toThrow(`Skipped: "${NOTE}" already exists.`);
		expect(log).toEqual([`GET ${sruUrl("NUM", ISBN)}`]);
		expect(files.files.get(NOTE)).toBe("");
	});

	it("reuses an existing image instead of downloading it again", async () => {
		const existing = "assets/Die 1 % Methode (2020).png";
		const { log, files, run } = setup(happyRoutes, [existing]);
		const result = await run(ISBN);
		expect(log).not.toContain(`GET ${coverUrl(ISBN, "l")}`);
		expect(result.coverPath).toBe(existing);
		expect(result.message).toContain(`Kept the existing cover "${existing}".`);
		expect(files.files.get(NOTE)).toContain(`\ncover: "[[${existing}]]"\n`);
	});

	it("writes the note without cover when the bot check answers with HTML", async () => {
		const { files, run } = setup({
			...happyRoutes,
			[coverUrl(ISBN, "l")]: {
				status: 200,
				contentType: "text/html; charset=UTF-8",
				body: "<html>Dein Browser wird geprüft!</html>",
			},
		});
		const result = await run(ISBN);
		expect(result.coverPath).toBeNull();
		expect(result.message).toBe(
			`Created "${NOTE}". No cover: the cover server answered with text/html instead of an image, probably its bot check.`,
		);
		expect([...files.files.keys()]).toEqual([NOTE]);
		expect(files.files.get(NOTE)).toContain("\ncover:\n");
	});

	it("does not try other editions once the bot check answers", async () => {
		const { log, run } = setup({
			...happyRoutes,
			[coverUrl(ISBN, "l")]: { contentType: "text/html", body: "<html></html>" },
		});
		await run(ISBN);
		expect(log).toEqual([
			`GET ${sruUrl("NUM", ISBN)}`,
			`GET ${BLURB}`,
			`GET ${coverUrl(ISBN, "l")}`,
			`note ${NOTE}`,
		]);
	});

	it.each<[string, FakeResponse | Error, string]>([
		[
			"an error page",
			{ status: 503, contentType: "text/plain" },
			"the cover server answered with HTTP 503 and text/plain instead of an image",
		],
		[
			"a network failure",
			new Error("ETIMEDOUT"),
			"the cover server could not be reached (ETIMEDOUT)",
		],
	])(
		"reports %s, tries no other edition and still writes the note",
		async (_, response, reason) => {
			const { log, files, run } = setup({ ...happyRoutes, [coverUrl(ISBN, "l")]: response });
			const result = await run(ISBN);
			expect(result.message).toBe(`Created "${NOTE}". No cover: ${reason}.`);
			expect(log.filter((entry) => entry.startsWith("GET"))).toHaveLength(3);
			expect([...files.files.keys()]).toEqual([NOTE]);
		},
	);

	it("accepts a cover by Content-Type even with an odd status", async () => {
		const { run } = setup({
			...happyRoutes,
			[coverUrl(ISBN, "l")]: { status: 203, contentType: "image/jpeg", body: JPEG },
		});
		expect((await run(ISBN)).coverPath).toBe(IMAGE);
	});

	it("uses the configured cover size", async () => {
		const log: string[] = [];
		const http = fakeHttp(happyRoutes, log);
		await importBook(ISBN, {
			http: http.get,
			files: fakeFiles([], log).vault,
			config: { ...CONFIG, coverSize: "s" },
			chooseRecord: noChoiceExpected,
		});
		expect(http.calls).toContain(coverUrl(ISBN, "s"));
	});

	it("reports a failed blurb and writes an empty description", async () => {
		const { files, run } = setup({ ...happyRoutes, [BLURB]: { status: 500 } });
		const result = await run(ISBN);
		expect(result.message).toBe(
			`Created "${NOTE}". No description: the blurb page answered with HTTP 500. Cover from ISBN ${ISBN}.`,
		);
		expect(files.files.get(NOTE)).toContain("\ndescription:\n");
	});

	it("reads an ambiguous input as ISBN first", async () => {
		const { run } = setup(happyRoutes);
		const result = await run("3442178584");
		expect(result.message).toContain(`Read 3442178584 as ISBN ${ISBN}.`);
	});

	it("retries an ambiguous input as a record number, after the LoC", async () => {
		const asIsbn = "9781198618734";
		const { log, run } = setup({
			[sruUrl("NUM", asIsbn)]: none,
			[locSearchUrl(asIsbn)]: { body: '{"hits": []}' },
			[sruUrl("IDN", IDN)]: found,
			[BLURB]: blurb,
			[coverUrl(ISBN, "l")]: cover,
		});
		const result = await run(IDN);
		expect(log.slice(0, 3)).toEqual([
			`GET ${sruUrl("NUM", asIsbn)}`,
			`GET ${locSearchUrl(asIsbn)}`,
			`GET ${sruUrl("IDN", IDN)}`,
		]);
		expect(result.message).toContain(`Read ${IDN} as a DNB record number.`);
	});

	it("looks up a d-nb.info link by record number only", async () => {
		const { http, run } = setup({ ...happyRoutes, [sruUrl("IDN", IDN)]: found });
		await run(`https://d-nb.info/${IDN}`);
		expect(http.calls[0]).toBe(sruUrl("IDN", IDN));
	});

	it.each([
		[
			ISBN,
			{ [sruUrl("NUM", ISBN)]: none, [locSearchUrl(ISBN)]: { body: '{"hits": []}' } },
			`No catalogue record for ISBN ${ISBN}, neither at the DNB nor at the Library of Congress.`,
		],
		[
			"12345678",
			{ [sruUrl("IDN", "12345678")]: none },
			"No catalogue record with record number 12345678.",
		],
		[
			IDN,
			{
				[sruUrl("NUM", "9781198618734")]: none,
				[locSearchUrl("9781198618734")]: { body: '{"hits": []}' },
				[sruUrl("IDN", IDN)]: none,
			},
			`No catalogue record for ${IDN}, neither as ISBN 9781198618734 (DNB, Library of Congress) nor as a DNB record number.`,
		],
		[
			ISBN,
			{ [sruUrl("NUM", ISBN)]: { status: 500 } },
			"The DNB catalogue answered with HTTP 500.",
		],
		[
			ISBN,
			{ [sruUrl("NUM", ISBN)]: new Error("offline") },
			"Could not reach the DNB catalogue: offline",
		],
	])("reports %s without writing anything", async (input, routes, message) => {
		const { files, run } = setup(routes);
		const error = await run(input).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(EntryError);
		expect((error as Error).message).toBe(message);
		expect(files.files.size).toBe(0);
	});

	it("rejects bad input before any request", async () => {
		const { http, run } = setup(happyRoutes);
		await expect(run("9783442178583")).rejects.toThrow("wrong check digit");
		expect(http.calls).toEqual([]);
	});

	it("skips unsupported material", async () => {
		const record = marcRecord("1111111111", [
			["245", [["a", "Partitur"]]],
			["336", [["a", "Noten"]]],
			["338", [["a", "Band"]]],
		]);
		const { files, run } = setup({ [sruUrl("NUM", ISBN)]: { body: sruResponse([record]) } });
		await expect(run(ISBN)).rejects.toThrow(
			'Skipped "Partitur": unsupported material (Noten / Band). Only books, e-books and audiobooks are imported.',
		);
		expect(files.files.size).toBe(0);
	});

	describe("cover fallback", () => {
		// The fixture links an audiobook by ISBN (776 $z) and the e-book by
		// record number (776 $w).
		const AUDIO = "9783844538458";
		const EBOOK_IDN = "1208614460";
		const EBOOK = "9783641260149";
		const ebookRecord: FakeResponse = {
			body: sruResponse([
				marcRecord(EBOOK_IDN, [
					["020", [["a", EBOOK]]],
					["245", [["a", "Die 1 % Methode"]]],
				]),
			]),
		};
		const missing: FakeResponse = { status: 404, contentType: "text/html" };
		const chainRoutes = {
			...happyRoutes,
			[coverUrl(ISBN, "l")]: missing,
			[coverUrl(AUDIO, "l")]: missing,
			[sruUrl("IDN", EBOOK_IDN)]: ebookRecord,
			[coverUrl(EBOOK, "l")]: missing,
		};

		it("takes the cover of an edition listed by ISBN and flags it", async () => {
			const { log, files, run } = setup({ ...chainRoutes, [coverUrl(AUDIO, "l")]: cover });
			const result = await run(ISBN);
			expect(log).toEqual([
				`GET ${sruUrl("NUM", ISBN)}`,
				`GET ${BLURB}`,
				`GET ${coverUrl(ISBN, "l")}`,
				`GET ${coverUrl(AUDIO, "l")}`,
				`image ${IMAGE}`,
				`note ${NOTE}`,
			]);
			expect(result.message).toBe(
				`Created "${NOTE}". Cover from ISBN ${AUDIO}, another edition; its artwork may differ.`,
			);
			expect(files.files.get(IMAGE)).toBe(JPEG);
		});

		it("looks up a linked record only after the listed ISBNs", async () => {
			const { log, run } = setup({ ...chainRoutes, [coverUrl(EBOOK, "l")]: cover });
			const result = await run(ISBN);
			expect(log.slice(2)).toEqual([
				`GET ${coverUrl(ISBN, "l")}`,
				`GET ${coverUrl(AUDIO, "l")}`,
				`GET ${sruUrl("IDN", EBOOK_IDN)}`,
				`GET ${coverUrl(EBOOK, "l")}`,
				`image ${IMAGE}`,
				`note ${NOTE}`,
			]);
			expect(result.message).toContain(
				`Cover from ISBN ${EBOOK}, another edition (https://d-nb.info/${EBOOK_IDN}); its artwork may differ.`,
			);
		});

		it("names every ISBN tried when no edition has a cover", async () => {
			const { files, run } = setup(chainRoutes);
			const result = await run(ISBN);
			expect(result.message).toBe(
				`Created "${NOTE}". No cover: the cover server has no usable cover for ISBN ${ISBN}, ${AUDIO}, ${EBOOK}.`,
			);
			expect([...files.files.keys()]).toEqual([NOTE]);
		});

		it("moves on past an unsupported image type", async () => {
			const { run } = setup({
				...chainRoutes,
				[coverUrl(ISBN, "l")]: { contentType: "image/tiff", body: JPEG },
				[coverUrl(AUDIO, "l")]: cover,
			});
			expect((await run(ISBN)).message).toContain(`Cover from ISBN ${AUDIO}`);
		});

		it("reports a linked record that could not be looked up", async () => {
			const { run } = setup({
				...chainRoutes,
				[sruUrl("IDN", EBOOK_IDN)]: new Error("offline"),
			});
			expect((await run(ISBN)).message).toBe(
				`Created "${NOTE}". No cover: the cover server has no usable cover for ISBN ${ISBN}, ${AUDIO}, https://d-nb.info/${EBOOK_IDN} could not be looked up.`,
			);
		});

		it("asks for each ISBN once", async () => {
			const record = marcRecord("1111111111", [
				["020", [["a", ISBN]]],
				["245", [["a", "Titel"]]],
				["336", [["a", "Text"]]],
				["338", [["a", "Band"]]],
				["776", [["z", ISBN]]],
				["776", [["w", `(DE-101)${IDN}`]]],
			]);
			const { http, run } = setup({
				[sruUrl("NUM", ISBN)]: { body: sruResponse([record]) },
				[sruUrl("IDN", IDN)]: found,
				[coverUrl(ISBN, "l")]: missing,
			});
			const result = await run(ISBN);
			expect(http.calls.filter((url) => url === coverUrl(ISBN, "l"))).toHaveLength(1);
			expect(http.calls).toContain(sruUrl("IDN", IDN));
			expect(result.message).toContain(
				`No cover: the cover server has no cover for ISBN ${ISBN}.`,
			);
		});

		it("uses another edition when the record has no ISBN of its own", async () => {
			const record = marcRecord("1111111111", [
				["245", [["a", "Titel"]]],
				["336", [["a", "Text"]]],
				["338", [["a", "Online-Ressource"]]],
				["776", [["z", AUDIO]]],
			]);
			const { run } = setup({
				[sruUrl("NUM", ISBN)]: { body: sruResponse([record]) },
				[coverUrl(AUDIO, "l")]: cover,
			});
			expect((await run(ISBN)).message).toContain(
				`Cover from ISBN ${AUDIO}, another edition`,
			);
		});

		it.each<[string, TestField[], string]>([
			["no ISBN and no links", [], "the record has no ISBN"],
			[
				"no ISBN anywhere",
				[["776", [["w", "(DE-101)1208614460"]]]],
				"neither the record nor its other editions have an ISBN",
			],
		])("reports a record with %s", async (_, links, reason) => {
			const record = marcRecord("1111111111", [
				["245", [["a", "Titel"]]],
				["336", [["a", "Text"]]],
				["338", [["a", "Band"]]],
				...links,
			]);
			const { run } = setup({
				[sruUrl("NUM", ISBN)]: { body: sruResponse([record]) },
				[sruUrl("IDN", EBOOK_IDN)]: {
					body: sruResponse([marcRecord(EBOOK_IDN, [["245", [["a", "T"]]]])]),
				},
			});
			expect((await run(ISBN)).message).toContain(`No cover: ${reason}.`);
		});
	});

	describe("several records", () => {
		const routes = {
			[sruUrl("NUM", ISBN)]: { body: fixture("book/sru-kaenguru-rebellion.xml") },
			"https://services.dnb.de/plus/idn/1379107830/blurb/": blurb,
			[coverUrl("9783957133373", "l")]: cover,
		};

		it("lets the user choose and imports the chosen record", async () => {
			const { choose, offered } = choosing(0);
			const { files, run } = setup(routes, [], choose);
			const result = await run(ISBN);
			expect(offered[0]?.map((book) => book.url)).toEqual([
				"https://d-nb.info/1379107830",
				"https://d-nb.info/1379188067",
				"https://d-nb.info/139261385X",
				"https://d-nb.info/1392644321",
				"https://d-nb.info/1395073848",
			]);
			expect(result.notePath).toBe("Books/Die Känguru-Rebellion (2026) - Hörbuch.md");
			expect(files.files.get("assets/Die Känguru-Rebellion (2026) - Hörbuch.jpg")).toBe(JPEG);
		});

		it("skips the entry when nothing is chosen", async () => {
			const { files, run } = setup(
				routes,
				[],
				vi.fn(() => Promise.resolve(null)),
			);
			await expect(run(ISBN)).rejects.toThrow("no record chosen");
			expect(files.files.size).toBe(0);
		});
	});
});

describe("importBook: Library of Congress fallback", () => {
	const GOOGLE = "9781492082798";
	const GOOGLE_NOTE = "Books/Software Engineering at Google (2020).md";
	const GOOGLE_IMAGE = "assets/Software Engineering at Google (2020).jpg";
	const BRAIN = "9781982167400";
	const BRAIN_PRINT = ["9781982167387", "9781982167394"];
	const KEHLMANN = "9780375424465";

	const document = (id: string): FakeResponse => ({
		body: fixture(`loc/instance-${id}.cbd.json`),
	});
	const search = (...ids: string[]): FakeResponse => ({
		body: JSON.stringify({ hits: ids.map((token) => ({ token })) }),
	});

	const googleRoutes = {
		[sruUrl("NUM", GOOGLE)]: none,
		[locSearchUrl(GOOGLE)]: { body: fixture("loc/search-9781492082798.json") },
		[locDocumentUrl("22483650")]: document("22483650"),
		[openLibraryEditionUrl(GOOGLE)]: {
			body: fixture("openlibrary/edition-9781492082798.json"),
		},
		[openLibraryCoverUrl(GOOGLE, "l")]: cover,
	};

	it("looks up the LoC after a DNB miss, takes the Open Library title, writes the note last", async () => {
		const { log, files, run } = setup(googleRoutes);
		const result = await run(GOOGLE);

		expect(log).toEqual([
			`GET ${sruUrl("NUM", GOOGLE)}`,
			`GET ${locSearchUrl(GOOGLE)}`,
			`GET ${locDocumentUrl("22483650")}`,
			`GET ${openLibraryEditionUrl(GOOGLE)}`,
			`GET ${openLibraryCoverUrl(GOOGLE, "l")}`,
			`image ${GOOGLE_IMAGE}`,
			`note ${GOOGLE_NOTE}`,
		]);
		expect(result).toEqual({
			notePath: GOOGLE_NOTE,
			coverPath: GOOGLE_IMAGE,
			message: `Created "${GOOGLE_NOTE}". Not in the DNB; record from the Library of Congress. Title from Open Library. Cover from Open Library, ISBN ${GOOGLE}.`,
		});
		expect(files.files.get(GOOGLE_NOTE)).toBe(`---
template: "[[Book Template]]"
type: book
title: Software Engineering at Google
original_title: Software Engineering at Google
authors:
  - Winters, Titus
  - Manshreck, Tom
  - Wright, Hyrum
url: https://lccn.loc.gov/2021443590
isbn: "${GOOGLE}"
year: 2020
series:
series_index:
genres: []
description:
cover: "[[${GOOGLE_IMAGE}]]"
rating:
last_finished:
shelf: unsorted
tags:
  - books
---

## Notes
`);
	});

	it("names itself to the LoC and Open Library", async () => {
		const { http, run } = setup(googleRoutes);
		await run(GOOGLE);
		expect(http.calls).toHaveLength(5);
		for (const sent of http.headers) {
			expect(sent?.["User-Agent"]).toBe(
				"pinpoint-media-notes (Obsidian plugin; +https://github.com/sercxanto/pinpoint-media-notes)",
			);
		}
	});

	it("keeps the LoC title, silently, when Open Library has no edition", async () => {
		const { files, run } = setup({
			...googleRoutes,
			[openLibraryEditionUrl(GOOGLE)]: { status: 404, contentType: "text/html" },
		});
		const result = await run(GOOGLE);
		expect(result.notePath).toBe("Books/Software engineering at Google (2020).md");
		expect(result.message).toContain(
			"Not in the DNB; record from the Library of Congress. Title from the Library of Congress. Cover",
		);
		expect(files.files.get(result.notePath)).toContain(
			"\ntitle: Software engineering at Google\noriginal_title: Software engineering at Google\n",
		);
	});

	it("reports a failed Open Library lookup and keeps the LoC title", async () => {
		const { run } = setup({
			...googleRoutes,
			[openLibraryEditionUrl(GOOGLE)]: { status: 503 },
		});
		const result = await run(GOOGLE);
		expect(result.notePath).toBe("Books/Software engineering at Google (2020).md");
		expect(result.message).toContain(
			"Title from the Library of Congress: Open Library answered with HTTP 503.",
		);
	});

	it("keeps a translation's original title", async () => {
		const { files, run } = setup({
			[sruUrl("NUM", KEHLMANN)]: none,
			[locSearchUrl(KEHLMANN)]: search("14268223"),
			[locDocumentUrl("14268223")]: document("14268223"),
			[openLibraryEditionUrl(KEHLMANN)]: { body: '{"title": "Measuring the World"}' },
		});
		const result = await run(KEHLMANN);
		const note = files.files.get(result.notePath) as string;
		expect(note).toContain(
			"\ntitle: Measuring the World\noriginal_title: Vermessung der Welt\nauthors:\n  - Kehlmann, Daniel\n",
		);
	});

	it("checks for a collision after the title lookup and before the cover", async () => {
		const { log, run } = setup(googleRoutes, [GOOGLE_NOTE]);
		await expect(run(GOOGLE)).rejects.toThrow(`Skipped: "${GOOGLE_NOTE}" already exists.`);
		expect(log.at(-1)).toBe(`GET ${openLibraryEditionUrl(GOOGLE)}`);
	});

	it("takes the record that lists the ISBN, its summary, and a cover of another format", async () => {
		const missing: FakeResponse = { status: 404, contentType: "text/html" };
		const { log, files, run } = setup({
			[sruUrl("NUM", BRAIN)]: none,
			[locSearchUrl(BRAIN)]: { body: fixture("loc/search-9781982167400.json") },
			[locDocumentUrl("22338086")]: document("22338086"),
			[locDocumentUrl("22339234")]: document("22339234"),
			[openLibraryCoverUrl(BRAIN, "l")]: missing,
			[openLibraryCoverUrl(BRAIN_PRINT[0]!, "l")]: missing,
			[openLibraryCoverUrl(BRAIN_PRINT[1]!, "l")]: cover,
		});
		const result = await run(BRAIN);
		expect(result.notePath).toBe("Books/Building a second brain (2022) - E-Book.md");
		expect(log.filter((entry) => entry.includes("covers."))).toEqual(
			[BRAIN, ...BRAIN_PRINT].map((isbn) => `GET ${openLibraryCoverUrl(isbn, "l")}`),
		);
		expect(result.message).toContain(
			`Cover from Open Library, ISBN ${BRAIN_PRINT[1]}, another edition; its artwork may differ.`,
		);
		expect(files.files.get(result.notePath)).toContain(
			"\ndescription: Invented stand-in for publisher copy. A method for keeping notes so that ideas come back when they are needed\n",
		);
	});

	it("names every ISBN tried when Open Library has no cover", async () => {
		const { run } = setup({
			[sruUrl("NUM", BRAIN)]: none,
			[locSearchUrl(BRAIN)]: search("22339234"),
			[locDocumentUrl("22339234")]: document("22339234"),
		});
		expect((await run(BRAIN)).message).toContain(
			`No cover: the cover server has no usable cover for ISBN ${BRAIN}, ${BRAIN_PRINT.join(", ")}.`,
		);
	});

	it("stops the cover chain at the first blocked answer", async () => {
		const { http, run } = setup({
			[sruUrl("NUM", BRAIN)]: none,
			[locSearchUrl(BRAIN)]: search("22339234"),
			[locDocumentUrl("22339234")]: document("22339234"),
			[openLibraryCoverUrl(BRAIN, "l")]: { status: 500, contentType: "text/plain" },
		});
		await run(BRAIN);
		expect(http.calls.filter((url) => url.includes("covers."))).toHaveLength(1);
	});

	it("is a miss when the only record lists the ISBN as another format's, and names it", async () => {
		const { files, run } = setup({
			[sruUrl("NUM", BRAIN)]: none,
			[locSearchUrl(BRAIN)]: search("22338086"),
			[locDocumentUrl("22338086")]: document("22338086"),
		});
		await expect(run(BRAIN)).rejects.toThrow(
			`No catalogue record for ISBN ${BRAIN}, neither at the DNB nor at the Library of Congress. The LoC record https://lccn.loc.gov/2021057378 lists it only as another format's ISBN; it describes a different edition.`,
		);
		expect(files.files.size).toBe(0);
	});

	it("lets the user choose among several records that count", async () => {
		const twin = fixture("loc/instance-22483650.cbd.json").replaceAll("22483650", "22483651");
		const { choose, offered } = choosing(1);
		const { run } = setup(
			{
				...googleRoutes,
				[locSearchUrl(GOOGLE)]: search("22483650", "22483651"),
				[locDocumentUrl("22483651")]: { body: twin },
			},
			[],
			choose,
		);
		const result = await run(GOOGLE);
		expect(offered[0]?.map((book) => book.url)).toEqual([
			"https://lccn.loc.gov/2021443590",
			"https://lccn.loc.gov/2021443590",
		]);
		expect(result.notePath).toBe(GOOGLE_NOTE);
	});

	it("skips unsupported material before asking Open Library", async () => {
		const { http, run } = setup({
			[sruUrl("NUM", GOOGLE)]: none,
			[locSearchUrl(GOOGLE)]: search("22483650"),
			[locDocumentUrl("22483650")]: {
				body: fixture("loc/instance-22483650.cbd.json").replaceAll(
					"/contentTypes/txt",
					"/contentTypes/ntm",
				),
			},
		});
		await expect(run(GOOGLE)).rejects.toThrow('Skipped "Software engineering at Google"');
		expect(http.calls).not.toContain(openLibraryEditionUrl(GOOGLE));
	});

	it("reads ten characters as ISBN at the LoC before the record number", async () => {
		const { http, run } = setup(googleRoutes);
		const result = await run("1492082791");
		expect(http.calls).not.toContain(sruUrl("IDN", "1492082791"));
		expect(result.message).toContain(
			`Read 1492082791 as ISBN ${GOOGLE}. Not in the DNB; record from the Library of Congress.`,
		);
	});

	it("does not fall back when the DNB lookup fails", async () => {
		const { http, run } = setup({ ...googleRoutes, [sruUrl("NUM", GOOGLE)]: { status: 500 } });
		await expect(run(GOOGLE)).rejects.toThrow("The DNB catalogue answered with HTTP 500.");
		expect(http.calls).toHaveLength(1);
	});

	it.each<[string, Record<string, FakeResponse | Error>, string]>([
		["a failed search", { [locSearchUrl(GOOGLE)]: { status: 500 } }, "HTTP 500"],
		["an unreachable host", { [locSearchUrl(GOOGLE)]: new Error("offline") }, "offline"],
		["a failed record", { [locDocumentUrl("22483650")]: { status: 404 } }, "HTTP 404"],
	])("fails the entry on %s, also for ten characters", async (_, routes, message) => {
		for (const input of [GOOGLE, "1492082791"]) {
			const { http, files, run } = setup({ ...googleRoutes, ...routes });
			await expect(run(input)).rejects.toThrow(message);
			expect(http.calls).not.toContain(sruUrl("IDN", "1492082791"));
			expect(files.files.size).toBe(0);
		}
	});

	it("names both catalogues and the other-format record for ten characters found nowhere", async () => {
		const { run } = setup({
			[sruUrl("NUM", BRAIN)]: none,
			[locSearchUrl(BRAIN)]: search("22338086"),
			[locDocumentUrl("22338086")]: document("22338086"),
			[sruUrl("IDN", "1982167408")]: none,
		});
		await expect(run("1982167408")).rejects.toThrow(
			`No catalogue record for 1982167408, neither as ISBN ${BRAIN} (DNB, Library of Congress) nor as a DNB record number. The LoC record https://lccn.loc.gov/2021057378 lists it`,
		);
	});
});

describe("bookImportConfig", () => {
	it("normalises the folders", () => {
		expect(
			bookImportConfig({
				...DEFAULT_SETTINGS,
				bookNotesDir: "Media/Books/",
				assetsDir: "./assets",
				coverSize: "m",
			}),
		).toEqual({ notesDir: "Media/Books", assetsDir: "assets", coverSize: "m" });
	});

	it("names the missing setting", () => {
		expect(() => bookImportConfig(DEFAULT_SETTINGS)).toThrow(ConfigError);
		expect(() => bookImportConfig(DEFAULT_SETTINGS)).toThrow('Setting "Book notes folder"');
		expect(() =>
			bookImportConfig({ ...DEFAULT_SETTINGS, bookNotesDir: "Books", assetsDir: "/abs" }),
		).toThrow('Setting "Image folder"');
	});
});
