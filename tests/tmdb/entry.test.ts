import { describe, expect, it } from "vitest";
import { EntryError } from "../../src/core/errors";
import { normalizeStrings } from "../../src/tmdb/api";
import {
	fillMissing,
	needsFallback,
	readDetails,
	readImdbId,
	TMDB_ENTRY_SOURCES,
	type TmdbEntry,
} from "../../src/tmdb/entry";
import { shapeMismatches, TMDB_ENTRY_SHAPE } from "../contract/tmdb-shape";
import { fixture } from "../helpers";

const json = (path: string): unknown => normalizeStrings(JSON.parse(fixture(path)));

const movie = () => readDetails(json("tmdb/movie-668640-de-DE.json"), "movie", "movie 668640");
const seriesDe = () => readDetails(json("tmdb/tv-1396-de-DE.json"), "tv", "series 1396");
const seriesEn = () => readDetails(json("tmdb/tv-1396.json"), "tv", "series 1396");

/** The series as the importer assembles it: localised, gaps filled, IMDb id added. */
const series = (): TmdbEntry => ({
	...fillMissing(seriesDe(), seriesEn()).entry,
	imdbId: readImdbId(json("tmdb/tv-1396-external-ids.json"), "external IDs"),
});

describe("readDetails", () => {
	it("maps a movie", () => {
		expect(movie()).toEqual({
			title: "Der beste Film aller Zeiten",
			originalTitle: "Competencia oficial",
			year: 2021,
			description:
				"Eine exzentrische Regisseurin bringt zwei rivalisierende Schauspieler zusammen.",
			genres: ["Komödie", "Drama"],
			imdbId: "tt8740768",
			posterPath: "/3VqKmtBv4sG1iVFYWKPrJmVZXYT.jpg",
		});
	});

	it("maps a series from name, original_name and first_air_date, without IMDb id", () => {
		expect(seriesDe()).toEqual({
			title: "Breaking Bad",
			originalTitle: "Breaking Bad",
			year: 2008,
			description: "",
			genres: ["Drama", "Krimi"],
			imdbId: null,
			posterPath: null,
		});
	});

	it("does not take a series' imdb_id from the details, even if present", () => {
		const details = { name: "X", imdb_id: "tt1" };
		expect(readDetails(details, "tv", "series 1").imdbId).toBeNull();
	});

	it.each<[unknown, number | null]>([
		["2021-09-17", 2021],
		["", null],
		[null, null],
		[undefined, null],
		["unknown", null],
		["21-09-17", null],
	])("reads the year of release_date %j as %j", (date, year) => {
		expect(readDetails({ title: "X", release_date: date }, "movie", "movie 1").year).toBe(year);
	});

	it("tolerates missing and malformed fields", () => {
		const entry = readDetails(
			{ title: " X ", genres: [{ name: "" }, null, { id: 1 }, { name: "Drama" }, "Krimi"] },
			"movie",
			"movie 1",
		);
		expect(entry).toEqual({
			title: "X",
			originalTitle: "",
			year: null,
			description: "",
			genres: ["Drama"],
			imdbId: null,
			posterPath: null,
		});
	});

	it("rejects an answer that is not an object", () => {
		expect(() => readDetails([], "movie", "movie 1")).toThrow(EntryError);
		expect(() => readDetails(null, "movie", "movie 1")).toThrow(
			"TMDB sent an unexpected answer for movie 1.",
		);
	});

	it("reads text that TMDB delivers decomposed in NFC", () => {
		const decomposed = "Komödie";
		const entry = readDetails(
			normalizeStrings({ title: `Die ${decomposed}`, genres: [{ name: decomposed }] }),
			"movie",
			"movie 1",
		);
		expect(entry.title).toBe("Die Komödie");
		expect(entry.genres).toEqual(["Komödie"]);
	});
});

describe("readImdbId", () => {
	it("reads imdb_id from external_ids, null when empty", () => {
		expect(readImdbId(json("tmdb/tv-1396-external-ids.json"), "x")).toBe("tt0903747");
		expect(readImdbId({ imdb_id: "" }, "x")).toBeNull();
		expect(readImdbId({ imdb_id: null }, "x")).toBeNull();
	});
});

describe("translation fallback", () => {
	it("is needed when overview or poster is missing", () => {
		expect(needsFallback(movie())).toBe(false);
		expect(needsFallback(seriesDe())).toBe(true);
		expect(needsFallback({ ...movie(), description: "" })).toBe(true);
		expect(needsFallback({ ...movie(), posterPath: null })).toBe(true);
	});

	it("fills only the empty fields and keeps the localised ones", () => {
		const { entry, filled } = fillMissing(seriesDe(), seriesEn());
		expect(filled).toEqual(["description", "posterPath"]);
		expect(entry.genres).toEqual(["Drama", "Krimi"]);
		expect(entry.description).toBe("A chemistry teacher turns to crime.");
		expect(entry.posterPath).toBe("/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg");
	});

	it("leaves a field empty that the fallback lacks too", () => {
		const { entry, filled } = fillMissing(
			{ ...movie(), description: "", year: null },
			{ ...movie(), description: "", year: null, title: "Other" },
		);
		expect(filled).toEqual([]);
		expect(entry.title).toBe("Der beste Film aller Zeiten");
		expect(entry.description).toBe("");
	});
});

describe("field coverage", () => {
	it("has a documented source for exactly the fields the mapping returns", () => {
		expect(Object.keys(TMDB_ENTRY_SOURCES).sort()).toEqual(Object.keys(movie()).sort());
	});

	it("has a shape check in the contract test for every field", () => {
		expect(Object.keys(TMDB_ENTRY_SHAPE).sort()).toEqual(Object.keys(movie()).sort());
		for (const entry of [movie(), series(), seriesDe()]) {
			expect(shapeMismatches(entry)).toEqual([]);
		}
	});

	it("sees every field filled by the movie fixture and by the assembled series", () => {
		for (const entry of [movie(), series()]) {
			const empty = Object.keys(TMDB_ENTRY_SOURCES).filter((key) => {
				const value = entry[key as keyof TmdbEntry];
				return (
					value === null || value === "" || (Array.isArray(value) && value.length === 0)
				);
			});
			expect(empty).toEqual([]);
		}
	});
});
