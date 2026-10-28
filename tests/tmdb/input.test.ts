import { describe, expect, it } from "vitest";
import { EntryError } from "../../src/core/errors";
import { canonicalUrl, parseTmdbInput } from "../../src/tmdb/input";

describe("parseTmdbInput", () => {
	it.each([
		"https://www.themoviedb.org/movie/668640-competencia-oficial",
		"https://www.themoviedb.org/movie/668640/cast?language=de#top",
		"https://www.themoviedb.org/movie/668640",
		"http://themoviedb.org/movie/668640?language=de-DE",
		"www.themoviedb.org/movie/668640",
		"  https://www.TheMovieDB.org/Movie/668640  ",
		"movie/668640",
		"/movie/668640",
		"movie/668640-competencia-oficial",
	])("reads %s as movie 668640", (input) => {
		expect(parseTmdbInput(input)).toEqual({ kind: "movie", id: "668640" });
	});

	it.each([
		"https://www.themoviedb.org/tv/1396/season/2",
		"https://www.themoviedb.org/tv/1396-breaking-bad",
		"tv/1396",
	])("reads %s as series 1396", (input) => {
		expect(parseTmdbInput(input)).toEqual({ kind: "tv", id: "1396" });
	});

	it("refuses a bare number, which does not say movie or series", () => {
		expect(() => parseTmdbInput("668640")).toThrow(EntryError);
		expect(() => parseTmdbInput("668640")).toThrow(/movie\/668640 or tv\/668640/);
	});

	it.each([
		"https://www.themoviedb.org/person/287",
		"https://www.themoviedb.org/movie/",
		"https://www.imdb.com/title/tt8740768/",
		"movie/abc",
		"films/668640",
		"https://example.org/movie/668640x",
	])("refuses %s", (input) => {
		expect(() => parseTmdbInput(input)).toThrow(EntryError);
	});
});

describe("canonicalUrl", () => {
	it("rebuilds the link from kind and id", () => {
		expect(canonicalUrl({ kind: "movie", id: "668640" })).toBe(
			"https://www.themoviedb.org/movie/668640",
		);
		expect(canonicalUrl({ kind: "tv", id: "1396" })).toBe("https://www.themoviedb.org/tv/1396");
	});
});
