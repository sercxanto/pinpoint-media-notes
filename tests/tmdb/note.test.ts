import { describe, expect, it } from "vitest";
import { normalizeStrings } from "../../src/tmdb/api";
import { readDetails, type TmdbEntry } from "../../src/tmdb/entry";
import { tmdbNote, tmdbStem } from "../../src/tmdb/note";
import { fixture } from "../helpers";

const movie = (): TmdbEntry =>
	readDetails(
		normalizeStrings(JSON.parse(fixture("tmdb/movie-800815-de-DE.json"))),
		"movie",
		"movie 800815",
	);

// The spec's example note, character for character. A change here is a
// change of the vault's note format.
const GOLDEN = `---
template: "[[Movie Template]]"
type: movie
title: Der beste Film aller Zeiten
original_title: Competencia oficial
url: https://www.themoviedb.org/movie/800815
imdb_id: tt8740768
year: 2021
genres:
  - Komödie
  - Drama
description: Eine exzentrische Regisseurin bringt zwei rivalisierende Schauspieler zusammen.
cover: "[[assets/Der beste Film aller Zeiten (2021).jpg]]"
rating:
last_finished:
shelf: unsorted
tags:
  - movies
---

## Notes
`;

describe("tmdbNote", () => {
	it("reproduces the golden note from the movie response", () => {
		const note = tmdbNote(
			{ kind: "movie", id: "800815" },
			movie(),
			"assets/Der beste Film aller Zeiten (2021).jpg",
		);
		expect(note).toBe(GOLDEN);
	});

	it("writes a series with type series, the tv link and empty fields", () => {
		const entry: TmdbEntry = {
			...movie(),
			title: "Dark",
			originalTitle: "",
			imdbId: null,
			year: null,
			genres: [],
			description: "Line one.\nLine two.",
		};
		const note = tmdbNote({ kind: "tv", id: "70523" }, entry, null);
		expect(note).toContain(
			"\ntype: series\ntitle: Dark\noriginal_title:\nurl: https://www.themoviedb.org/tv/70523\nimdb_id:\nyear:\ngenres: []\n",
		);
		expect(note).toContain("\ndescription: Line one. Line two.\ncover:\nrating:\n");
		expect(note).toContain("\ntags:\n  - movies\n");
	});

	it("quotes titles YAML would misread", () => {
		const note = tmdbNote(
			{ kind: "movie", id: "1" },
			{ ...movie(), title: "1917", originalTitle: "Alien: Romulus" },
			null,
		);
		expect(note).toContain('\ntitle: "1917"\noriginal_title: "Alien: Romulus"\n');
	});
});

describe("tmdbStem", () => {
	it("is the sanitised localised title with the year", () => {
		expect(tmdbStem(movie())).toBe("Der beste Film aller Zeiten (2021)");
		expect(tmdbStem({ ...movie(), title: "Mission: Impossible?", year: 1996 })).toBe(
			"Mission Impossible (1996)",
		);
	});

	it("drops the year when it is unknown", () => {
		expect(tmdbStem({ ...movie(), year: null })).toBe("Der beste Film aller Zeiten");
	});
});
