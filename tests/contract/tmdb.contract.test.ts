import { describe, expect, it } from "vitest";
import { ConfigError, EntryError } from "../../src/core/errors";
import { detailsUrl, externalIdsUrl, fetchPoster, getJson } from "../../src/tmdb/api";
import { readDetails, readImdbId } from "../../src/tmdb/entry";
import { importTmdb } from "../../src/tmdb/importer";
import type { TmdbRef } from "../../src/tmdb/input";
import { fakeFiles } from "../helpers";
import { nodeHttp } from "./node-http";
import { shapeMismatches } from "./tmdb-shape";

// Live checks against the TMDB API. They assert the shape of what comes
// back, not titles or overviews, which TMDB's users edit. The token comes
// from the environment and is never printed.

const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN?.trim() ?? "";

/** Der beste Film aller Zeiten (Competencia oficial): the spec's example. */
const MOVIE: TmdbRef = { kind: "movie", id: "668640" };
/** Breaking Bad: a series with an IMDb id in external_ids. */
const SERIES: TmdbRef = { kind: "tv", id: "1396" };
/** Far beyond TMDB's ids. */
const NO_SUCH_MOVIE: TmdbRef = { kind: "movie", id: "999999999" };

describe.skipIf(TOKEN === "")("TMDB API (needs TMDB_READ_ACCESS_TOKEN)", () => {
	it("serves a movie with every field in shape, IMDb id included", async () => {
		const json = await getJson(nodeHttp, detailsUrl(MOVIE, "de-DE"), TOKEN, "movie");
		const entry = readDetails(json, "movie", "movie");
		expect(shapeMismatches(entry)).toEqual([]);
		expect(entry.year).not.toBeNull();
		expect(entry.genres.length).toBeGreaterThan(0);
		expect(entry.imdbId).not.toBeNull();
		expect(entry.posterPath).not.toBeNull();
	});

	it("serves a series without imdb_id, and external_ids with it", async () => {
		const json = await getJson(nodeHttp, detailsUrl(SERIES, "de-DE"), TOKEN, "series");
		expect(json).not.toHaveProperty("imdb_id");
		const entry = readDetails(json, "tv", "series");
		expect(shapeMismatches(entry)).toEqual([]);
		expect(entry.year).not.toBeNull();

		const ids = await getJson(nodeHttp, externalIdsUrl(SERIES), TOKEN, "external IDs");
		expect(readImdbId(ids, "external IDs")).toMatch(/^tt\d+$/);
	});

	it("answers without the language parameter, as the fallback asks", async () => {
		const json = await getJson(nodeHttp, detailsUrl(MOVIE, null), TOKEN, "movie");
		const entry = readDetails(json, "movie", "movie");
		expect(shapeMismatches(entry)).toEqual([]);
		expect(entry.description).not.toBe("");
	});

	it("serves the poster as image/*, without the token", async () => {
		const json = await getJson(nodeHttp, detailsUrl(MOVIE, "de-DE"), TOKEN, "movie");
		const { posterPath } = readDetails(json, "movie", "movie");
		const poster = await fetchPoster(nodeHttp, "w92", posterPath!);
		expect(poster.ok ? "image" : poster.reason).toBe("image");
	});

	it("answers 404 for an unknown id", async () => {
		await expect(
			getJson(nodeHttp, detailsUrl(NO_SUCH_MOVIE, "de-DE"), TOKEN, "movie"),
		).rejects.toBeInstanceOf(EntryError);
	});

	it("imports a series end to end", async () => {
		const files = fakeFiles();
		const result = await importTmdb("https://www.themoviedb.org/tv/1396", {
			http: nodeHttp,
			files: files.vault,
			config: {
				token: TOKEN,
				language: "de-DE",
				posterSize: "w92",
				notesDir: "Movies",
				assetsDir: "assets",
			},
		});
		expect(result.coverPath).toMatch(/^assets\/.+\.(jpg|png)$/);
		const note = files.files.get(result.notePath);
		expect(note).toMatch(/^---\ntemplate: "\[\[Movie Template\]\]"\ntype: series\n/);
		expect(note).toMatch(/\nimdb_id: tt\d+\n/);
	});
});

// Needs no token: it checks that TMDB still answers a bad one with 401,
// which the importer turns into a configuration error.
describe("TMDB API without a valid token", () => {
	it("answers 401, read as a configuration error", async () => {
		await expect(
			getJson(nodeHttp, detailsUrl(MOVIE, "de-DE"), "not-a-token", "movie"),
		).rejects.toBeInstanceOf(ConfigError);
	});
});
