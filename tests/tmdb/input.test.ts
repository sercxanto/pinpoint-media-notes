import { describe, expect, it } from "vitest";
import { EntryError } from "../../src/core/errors";
import { canonicalUrl, parseTmdbInput } from "../../src/tmdb/input";

describe("parseTmdbInput", () => {
	it.each([
		"https://www.themoviedb.org/movie/800815-official-competition",
		"https://www.themoviedb.org/movie/800815/cast?language=de#top",
		"https://www.themoviedb.org/movie/800815",
		"http://themoviedb.org/movie/800815?language=de-DE",
		"www.themoviedb.org/movie/800815",
		"  https://www.TheMovieDB.org/Movie/800815  ",
		"movie/800815",
		"/movie/800815",
		"movie/800815-official-competition",
	])("reads %s as movie 800815", (input) => {
		expect(parseTmdbInput(input)).toEqual({ kind: "movie", id: "800815" });
	});

	it.each([
		"https://www.themoviedb.org/tv/1396/season/2",
		"https://www.themoviedb.org/tv/1396-breaking-bad",
		"tv/1396",
	])("reads %s as series 1396", (input) => {
		expect(parseTmdbInput(input)).toEqual({ kind: "tv", id: "1396" });
	});

	it("refuses a bare number, which does not say movie or series", () => {
		expect(() => parseTmdbInput("800815")).toThrow(EntryError);
		expect(() => parseTmdbInput("800815")).toThrow(/movie\/800815 or tv\/800815/);
	});

	it.each([
		"https://www.themoviedb.org/person/287",
		"https://www.themoviedb.org/movie/",
		"https://www.imdb.com/title/tt8740768/",
		"movie/abc",
		"films/800815",
		"https://example.org/movie/800815x",
	])("refuses %s", (input) => {
		expect(() => parseTmdbInput(input)).toThrow(EntryError);
	});
});

describe("canonicalUrl", () => {
	it("rebuilds the link from kind and id", () => {
		expect(canonicalUrl({ kind: "movie", id: "800815" })).toBe(
			"https://www.themoviedb.org/movie/800815",
		);
		expect(canonicalUrl({ kind: "tv", id: "1396" })).toBe("https://www.themoviedb.org/tv/1396");
	});
});
