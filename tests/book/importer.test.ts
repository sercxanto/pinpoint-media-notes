import { describe, expect, it, vi } from "vitest";
import { coverUrl, sruUrl } from "../../src/book/dnb";
import { bookImportConfig, importBook, type BookImportConfig } from "../../src/book/importer";
import type { DnbRecord } from "../../src/book/dnb-record";
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

function noChoiceExpected(_records: DnbRecord[]): Promise<DnbRecord | null> {
	return Promise.reject(new Error("unexpected record choice"));
}

function setup(
	routes: Record<string, FakeResponse | Error>,
	existing: string[] = [],
	chooseRecord = vi.fn(noChoiceExpected),
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

	it("retries an ambiguous input as a record number", async () => {
		const asIsbn = "9781198618734";
		const { log, run } = setup({
			[sruUrl("NUM", asIsbn)]: none,
			[sruUrl("IDN", IDN)]: found,
			[BLURB]: blurb,
			[coverUrl(ISBN, "l")]: cover,
		});
		const result = await run(IDN);
		expect(log.slice(0, 2)).toEqual([
			`GET ${sruUrl("NUM", asIsbn)}`,
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
		[ISBN, { [sruUrl("NUM", ISBN)]: none }, `No catalogue record for ISBN ${ISBN}.`],
		[
			"12345678",
			{ [sruUrl("IDN", "12345678")]: none },
			"No catalogue record with record number 12345678.",
		],
		[
			IDN,
			{ [sruUrl("NUM", "9781198618734")]: none, [sruUrl("IDN", IDN)]: none },
			`No catalogue record for ${IDN}, neither as ISBN 9781198618734 nor as a DNB record number.`,
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
			const choose = vi.fn((records: DnbRecord[]) => Promise.resolve(records[0] ?? null));
			const { files, run } = setup(routes, [], choose);
			const result = await run(ISBN);
			expect(choose.mock.calls[0]?.[0].map((book) => book.idn)).toEqual([
				"1379107830",
				"1379188067",
				"139261385X",
				"1392644321",
				"1395073848",
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
