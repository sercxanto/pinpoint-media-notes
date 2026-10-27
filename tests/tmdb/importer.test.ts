import { describe, expect, it } from "vitest";
import { ConfigError, EntryError } from "../../src/core/errors";
import { DEFAULT_SETTINGS } from "../../src/settings";
import { detailsUrl, externalIdsUrl, posterUrl, redact } from "../../src/tmdb/api";
import { importTmdb, tmdbImportConfig, type TmdbImportConfig } from "../../src/tmdb/importer";
import type { TmdbRef } from "../../src/tmdb/input";
import { fakeFiles, fakeHttp, fixture, type FakeResponse } from "../helpers";

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.test-token-secret";
const CONFIG: TmdbImportConfig = {
	token: TOKEN,
	language: "de-DE",
	posterSize: "w500",
	notesDir: "Movies",
	assetsDir: "assets",
};

const MOVIE: TmdbRef = { kind: "movie", id: "800815" };
const MOVIE_URL = "https://www.themoviedb.org/movie/800815-official-competition?language=de";
const MOVIE_POSTER = "/3VqKmtBv4sG1iVFYWKPrJmVZXYT.jpg";
const MOVIE_NOTE = "Movies/Der beste Film aller Zeiten (2021).md";
const MOVIE_IMAGE = "assets/Der beste Film aller Zeiten (2021).jpg";

const SERIES: TmdbRef = { kind: "tv", id: "1396" };
const SERIES_POSTER = "/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg";
const SERIES_NOTE = "Movies/Breaking Bad (2008).md";
const SERIES_IMAGE = "assets/Breaking Bad (2008).jpg";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff]).buffer;
const json = (path: string): FakeResponse => ({
	contentType: "application/json;charset=utf-8",
	body: fixture(path),
});
const image: FakeResponse = { contentType: "image/jpeg", body: JPEG };

/** The requests that went to TMDB's image host, matched on the host name. */
const imageHostCalls = (calls: string[]) =>
	calls.filter((url) => new URL(url).hostname === "image.tmdb.org");

const movieRoutes = {
	[detailsUrl(MOVIE, "de-DE")]: json("tmdb/movie-800815-de-DE.json"),
	[posterUrl("w500", MOVIE_POSTER)]: image,
};

const seriesRoutes = {
	[detailsUrl(SERIES, "de-DE")]: json("tmdb/tv-1396-de-DE.json"),
	[detailsUrl(SERIES, null)]: json("tmdb/tv-1396.json"),
	[externalIdsUrl(SERIES)]: json("tmdb/tv-1396-external-ids.json"),
	[posterUrl("w500", SERIES_POSTER)]: image,
};

function setup(routes: Record<string, FakeResponse | Error>, existing: string[] = []) {
	const log: string[] = [];
	const http = fakeHttp(routes, log);
	const files = fakeFiles(existing, log);
	const run = (input: string, config = CONFIG) =>
		importTmdb(input, { http: http.get, files: files.vault, config });
	return { log, http, files, run };
}

describe("importTmdb", () => {
	it("imports a movie with one request, then the poster, the note last", async () => {
		const { log, files, run } = setup(movieRoutes);
		const result = await run(MOVIE_URL);

		expect(log).toEqual([
			`GET ${detailsUrl(MOVIE, "de-DE")}`,
			`GET ${posterUrl("w500", MOVIE_POSTER)}`,
			`image ${MOVIE_IMAGE}`,
			`note ${MOVIE_NOTE}`,
		]);
		expect(result).toEqual({
			notePath: MOVIE_NOTE,
			coverPath: MOVIE_IMAGE,
			message: `Created "${MOVIE_NOTE}". Poster saved.`,
		});
		expect(files.files.get(MOVIE_IMAGE)).toBe(JPEG);
		const note = files.files.get(MOVIE_NOTE) as string;
		expect(note).toContain("\nurl: https://www.themoviedb.org/movie/800815\n");
		expect(note).toContain(`\ncover: "[[${MOVIE_IMAGE}]]"\n`);
		expect([...files.folders].sort()).toEqual(["Movies", "assets"]);
	});

	it("builds the API and image URLs from the spec", () => {
		expect(detailsUrl(MOVIE, "de-DE")).toBe(
			"https://api.themoviedb.org/3/movie/800815?language=de-DE",
		);
		expect(detailsUrl(SERIES, null)).toBe("https://api.themoviedb.org/3/tv/1396");
		expect(externalIdsUrl(SERIES)).toBe("https://api.themoviedb.org/3/tv/1396/external_ids");
		expect(posterUrl("original", "/a.jpg")).toBe("https://image.tmdb.org/t/p/original/a.jpg");
	});

	it("sends the token to the API only, not to the image host", async () => {
		const { http, run } = setup(movieRoutes);
		await run(MOVIE_URL);
		expect(http.headers[0]).toEqual({
			Authorization: `Bearer ${TOKEN}`,
			Accept: "application/json",
		});
		expect(http.headers[1]).toBeUndefined();
	});

	it("imports a series: fallback for missing translations, then external_ids", async () => {
		const { log, files, run } = setup(seriesRoutes);
		const result = await run("https://www.themoviedb.org/tv/1396-breaking-bad/season/2");

		expect(log).toEqual([
			`GET ${detailsUrl(SERIES, "de-DE")}`,
			`GET ${detailsUrl(SERIES, null)}`,
			`GET ${externalIdsUrl(SERIES)}`,
			`GET ${posterUrl("w500", SERIES_POSTER)}`,
			`image ${SERIES_IMAGE}`,
			`note ${SERIES_NOTE}`,
		]);
		expect(result.message).toBe(
			`Created "${SERIES_NOTE}". No de-DE translation for description, poster; took TMDB's default language. Poster saved.`,
		);
		const note = files.files.get(SERIES_NOTE) as string;
		expect(note).toContain(
			"\ntype: series\ntitle: Breaking Bad\noriginal_title: Breaking Bad\nurl: https://www.themoviedb.org/tv/1396\nimdb_id: tt0903747\nyear: 2008\ngenres:\n  - Drama\n  - Krimi\ndescription: A chemistry teacher turns to crime.\n",
		);
	});

	it("skips a name collision before external_ids and poster are fetched", async () => {
		const { log, files, run } = setup(seriesRoutes, [SERIES_NOTE]);
		await expect(run("tv/1396")).rejects.toThrow(`Skipped: "${SERIES_NOTE}" already exists.`);
		expect(log).toEqual([
			`GET ${detailsUrl(SERIES, "de-DE")}`,
			`GET ${detailsUrl(SERIES, null)}`,
		]);
		expect(files.files.get(SERIES_NOTE)).toBe("");
	});

	it("reuses an existing poster instead of downloading it again", async () => {
		const { log, files, run } = setup(movieRoutes, [MOVIE_IMAGE]);
		const result = await run(MOVIE_URL);
		expect(log).toEqual([`GET ${detailsUrl(MOVIE, "de-DE")}`, `note ${MOVIE_NOTE}`]);
		expect(result.message).toBe(
			`Created "${MOVIE_NOTE}". Kept the existing poster "${MOVIE_IMAGE}".`,
		);
		expect(files.files.get(MOVIE_NOTE)).toContain(`\ncover: "[[${MOVIE_IMAGE}]]"\n`);
	});

	it("names the poster with the extension of TMDB's file", async () => {
		const movie = JSON.parse(fixture("tmdb/movie-800815-de-DE.json")) as Record<
			string,
			unknown
		>;
		const { files, run } = setup({
			[detailsUrl(MOVIE, "de-DE")]: {
				body: JSON.stringify({ ...movie, poster_path: "/abc.PNG" }),
			},
			[posterUrl("w500", "/abc.PNG")]: { contentType: "image/png", body: JPEG },
		});
		const result = await run("movie/800815");
		expect(result.coverPath).toBe("assets/Der beste Film aller Zeiten (2021).png");
		expect(files.files.has("assets/Der beste Film aller Zeiten (2021).png")).toBe(true);
	});

	it("writes the note without cover when TMDB has no poster in any language", async () => {
		const series = JSON.parse(fixture("tmdb/tv-1396.json")) as Record<string, unknown>;
		const { http, files, run } = setup({
			...seriesRoutes,
			[detailsUrl(SERIES, null)]: { body: JSON.stringify({ ...series, poster_path: null }) },
		});
		const result = await run("tv/1396");
		expect(result.coverPath).toBeNull();
		expect(result.message).toBe(
			`Created "${SERIES_NOTE}". No de-DE translation for description; took TMDB's default language. No poster: TMDB has none for this entry.`,
		);
		expect(imageHostCalls(http.calls)).toEqual([]);
		expect(files.files.get(SERIES_NOTE)).toContain("\ncover:\nrating:\n");
	});

	it.each<[string, FakeResponse | Error, string]>([
		["an HTTP error", { status: 500 }, "the image server answered with HTTP 500"],
		[
			"an HTML page",
			{ contentType: "text/html", body: "<html></html>" },
			"the image server sent text/html instead of an image",
		],
		[
			"an unsupported image type",
			{ contentType: "image/svg+xml", body: "<svg/>" },
			"the image server sent an unsupported image type, image/svg+xml",
		],
		[
			"a network failure",
			new Error("net::ERR_TIMED_OUT"),
			"the image server could not be reached (net::ERR_TIMED_OUT)",
		],
	])("writes the note without cover after %s from the image host", async (_, poster, reason) => {
		const { files, run } = setup({ ...movieRoutes, [posterUrl("w500", MOVIE_POSTER)]: poster });
		const result = await run(MOVIE_URL);
		expect(result.coverPath).toBeNull();
		expect(result.message).toBe(`Created "${MOVIE_NOTE}". No poster: ${reason}.`);
		expect([...files.files.keys()]).toEqual([MOVIE_NOTE]);
	});

	it("does not follow a poster path that is not a plain file name", async () => {
		const movie = JSON.parse(fixture("tmdb/movie-800815-de-DE.json")) as Record<
			string,
			unknown
		>;
		const { log, run } = setup({
			[detailsUrl(MOVIE, "de-DE")]: {
				body: JSON.stringify({ ...movie, poster_path: "/../x.jpg" }),
			},
		});
		const result = await run("movie/800815");
		expect(result.coverPath).toBeNull();
		expect(result.message).toContain('No poster: TMDB\'s poster path "/../x.jpg"');
		expect(log).toHaveLength(2);
	});

	it.each(["/abc.svg", "/abc.md", "/abc.html"])(
		"does not follow a poster path %j that is not an accepted image type",
		async (posterPath) => {
			const movie = JSON.parse(fixture("tmdb/movie-800815-de-DE.json")) as Record<
				string,
				unknown
			>;
			const { http, files, run } = setup({
				[detailsUrl(MOVIE, "de-DE")]: {
					body: JSON.stringify({ ...movie, poster_path: posterPath }),
				},
			});
			const result = await run("movie/800815");
			expect(result.coverPath).toBeNull();
			expect(result.message).toBe(
				`Created "${MOVIE_NOTE}". No poster: TMDB's poster "${posterPath}" is not a supported image type.`,
			);
			expect(imageHostCalls(http.calls)).toEqual([]);
			expect([...files.files.keys()]).toEqual([MOVIE_NOTE]);
		},
	);

	it("keeps the localised values when the fallback request fails", async () => {
		const { files, run } = setup({
			...seriesRoutes,
			[detailsUrl(SERIES, null)]: { status: 503 },
		});
		const result = await run("tv/1396");
		expect(result.message).toBe(
			`Created "${SERIES_NOTE}". Could not ask for the untranslated details: TMDB answered with HTTP 503 for series 1396. No poster: TMDB has none for this entry.`,
		);
		expect(files.files.get(SERIES_NOTE)).toContain("\ndescription:\ncover:\n");
	});

	it("does not ask again when the localised answer is complete", async () => {
		const { http, run } = setup(movieRoutes);
		await run(MOVIE_URL);
		expect(http.calls).not.toContain(detailsUrl(MOVIE, null));
	});

	it("reports an unknown id as an entry error", async () => {
		const { log, run } = setup({
			[detailsUrl(MOVIE, "de-DE")]: { status: 404, body: fixture("tmdb/error-404.json") },
		});
		await expect(run("movie/800815")).rejects.toThrow(
			new EntryError("TMDB has no movie 800815."),
		);
		expect(log).toHaveLength(1);
	});

	it("stops with a configuration error when TMDB rejects the token", async () => {
		const { run } = setup({
			[detailsUrl(MOVIE, "de-DE")]: { status: 401, body: fixture("tmdb/error-401.json") },
		});
		const error: unknown = await run("movie/800815").catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(ConfigError);
		expect((error as Error).message).toMatch(/^TMDB rejected the access token \(HTTP 401\)/);
		expect((error as Error).message).not.toContain(TOKEN);
	});

	it("stops when the token is rejected on the fallback request", async () => {
		const { run } = setup({ ...seriesRoutes, [detailsUrl(SERIES, null)]: { status: 401 } });
		await expect(run("tv/1396")).rejects.toBeInstanceOf(ConfigError);
	});

	it("fails the entry when external_ids cannot be fetched", async () => {
		const { files, run } = setup({
			...seriesRoutes,
			[externalIdsUrl(SERIES)]: { status: 500 },
		});
		await expect(run("tv/1396")).rejects.toThrow(
			"TMDB answered with HTTP 500 for external IDs of series 1396.",
		);
		expect(files.files.size).toBe(0);
	});

	it("never puts the token into a message, even when a lower layer echoes it", async () => {
		const { run } = setup({
			[detailsUrl(MOVIE, "de-DE")]: new Error(
				`request failed: Authorization: Bearer ${TOKEN}`,
			),
		});
		const error: unknown = await run("movie/800815").catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(EntryError);
		expect((error as Error).message).toBe(
			"Could not reach TMDB for movie 800815: request failed: Authorization: Bearer ***",
		);
	});

	it("reports an unreadable answer", async () => {
		const { run } = setup({ [detailsUrl(MOVIE, "de-DE")]: { body: "<html>" } });
		await expect(run("movie/800815")).rejects.toThrow(
			"TMDB sent an unreadable answer for movie 800815.",
		);
	});

	it("reports an entry without title", async () => {
		const { run } = setup({ [detailsUrl(MOVIE, "de-DE")]: { body: '{"overview":"x"}' } });
		await expect(run("movie/800815")).rejects.toThrow("TMDB has no title for movie 800815.");
	});

	it("rejects bad input before any request", async () => {
		const { log, run } = setup(movieRoutes);
		await expect(run("800815")).rejects.toBeInstanceOf(EntryError);
		expect(log).toEqual([]);
	});

	it("writes NFC names and links when TMDB delivers decomposed text", async () => {
		const movie = JSON.parse(fixture("tmdb/movie-800815-de-DE.json")) as Record<
			string,
			unknown
		>;
		const { files, run } = setup({
			[detailsUrl(MOVIE, "de-DE")]: {
				body: JSON.stringify({ ...movie, title: "Die Königin" }),
			},
			[posterUrl("w500", MOVIE_POSTER)]: image,
		});
		const result = await run("movie/800815");
		expect(result.notePath).toBe("Movies/Die Königin (2021).md");
		expect(result.coverPath).toBe("assets/Die Königin (2021).jpg");
		expect(files.files.get(result.notePath)).toContain("\ntitle: Die Königin\n");
	});
});

describe("redact", () => {
	it("replaces every occurrence of the token", () => {
		expect(redact("a TOKEN b TOKEN", "TOKEN")).toBe("a *** b ***");
		expect(redact("nothing", "")).toBe("nothing");
	});
});

describe("tmdbImportConfig", () => {
	const settings = {
		...DEFAULT_SETTINGS,
		tmdbToken: ` ${TOKEN} `,
		tmdbNotesDir: "Movies/",
		tmdbLanguage: "de-DE",
	};

	it("reads and normalises the settings", () => {
		expect(tmdbImportConfig(settings)).toEqual(CONFIG);
	});

	it.each<[string, Partial<typeof settings>, string]>([
		["no token", { tmdbToken: " " }, 'Setting "TMDB read access token": No token set.'],
		[
			"the API key instead of the token",
			{ tmdbToken: "0123456789abcdef0123456789ABCDEF" },
			'Setting "TMDB read access token": This looks like the short API key. Use the long API read access token shown next to it.',
		],
		[
			"no notes folder",
			{ tmdbNotesDir: "" },
			'Setting "Movie and series notes folder": No folder set.',
		],
		["no language", { tmdbLanguage: "" }, 'Setting "Language": No language set.'],
		[
			"a bad poster size",
			{ posterSize: "big" },
			'Setting "Poster size": "big" is not a TMDB image size.',
		],
		[
			"an absolute image folder",
			{ assetsDir: "/tmp" },
			'Setting "Image folder": Use a folder inside the vault, not an absolute path.',
		],
	])("stops on %s, naming the setting", (_, change, message) => {
		expect(() => tmdbImportConfig({ ...settings, ...change })).toThrow(
			new ConfigError(message),
		);
	});

	it("never puts the token into a configuration message", () => {
		const apiKey = "0123456789abcdef0123456789abcdef";
		try {
			tmdbImportConfig({ ...settings, tmdbToken: apiKey });
		} catch (error) {
			expect((error as Error).message).not.toContain(apiKey);
		}
	});
});
