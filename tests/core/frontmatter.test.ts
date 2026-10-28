import { describe, expect, it } from "vitest";
import { buildFrontmatter, buildNote, yamlScalar } from "../../src/core/frontmatter";

describe("yamlScalar", () => {
	it.each([
		"Der beste Film aller Zeiten",
		"Die 1 % Methode",
		"Clear, James",
		"tt8740768",
		"https://www.themoviedb.org/movie/668640",
		"C# for beginners",
		"Wer?",
		"Ärger im Paradies",
	])("leaves %j unquoted", (value) => {
		expect(yamlScalar(value)).toBe(value);
	});

	it.each([
		['Say "hi"', String.raw`"Say \"hi\""`],
		["2001: A Space Odyssey", '"2001: A Space Odyssey"'],
		["Mission: Impossible", '"Mission: Impossible"'],
		["Nummer #9", '"Nummer #9"'],
		["Ende:", '"Ende:"'],
		["#hashtag", '"#hashtag"'],
		[" leading", '" leading"'],
		["trailing ", '"trailing "'],
		["[[Movie Template]]", '"[[Movie Template]]"'],
		[
			"[[assets/Der beste Film aller Zeiten (2021).jpg]]",
			'"[[assets/Der beste Film aller Zeiten (2021).jpg]]"',
		],
		["!important", '"!important"'],
		["&Co", '"&Co"'],
		["*star", '"*star"'],
		["|pipe", '"|pipe"'],
		[">quote", '">quote"'],
		["%percent", '"%percent"'],
		["@home", '"@home"'],
		["`tick", '"`tick"'],
		["'single", `"'single"`],
		["{brace", '"{brace"'],
		["?question", '"?question"'],
		[",comma", '",comma"'],
		["-dash", '"-dash"'],
		[":colon", '":colon"'],
		["true", '"true"'],
		["No", '"No"'],
		["ON", '"ON"'],
		["off", '"off"'],
		["null", '"null"'],
		["~", '"~"'],
		["1917", '"1917"'],
		["9783442178582", '"9783442178582"'],
		["3.14", '"3.14"'],
		["-5", '"-5"'],
		["1e10", '"1e10"'],
		["0x1F", '"0x1F"'],
		[".inf", '".inf"'],
		["2021-05-01", '"2021-05-01"'],
		[String.raw`back\slash "x"`, String.raw`"back\\slash \"x\""`],
	])("quotes %j", (value, expected) => {
		expect(yamlScalar(value)).toBe(expected);
	});

	it("collapses line breaks into single spaces", () => {
		expect(yamlScalar("Erste Zeile.\n\n  Zweite Zeile.\r\nDritte.")).toBe(
			"Erste Zeile. Zweite Zeile. Dritte.",
		);
	});
});

describe("buildFrontmatter", () => {
	it("writes blanks, numbers, lists and empty lists", () => {
		expect(
			buildFrontmatter([
				["rating", null],
				["series", ""],
				["year", 2021],
				["series_index", 5],
				["genres", []],
				["authors", ["Clear, James", "true"]],
			]),
		).toBe(
			[
				"---",
				"rating:",
				"series:",
				"year: 2021",
				"series_index: 5",
				"genres: []",
				"authors:",
				"  - Clear, James",
				'  - "true"',
				"---",
				"",
			].join("\n"),
		);
	});

	it("keeps the given key order", () => {
		const keys = ["z", "a", "m"];
		const out = buildFrontmatter(keys.map((key) => [key, "x"]));
		expect(out).toBe("---\nz: x\na: x\nm: x\n---\n");
	});
});

describe("buildNote", () => {
	// The example note from the TMDB spec, character for character.
	it("reproduces the spec's movie note", () => {
		const note = buildNote([
			["template", "[[Movie Template]]"],
			["type", "movie"],
			["title", "Der beste Film aller Zeiten"],
			["original_title", "Competencia oficial"],
			["url", "https://www.themoviedb.org/movie/668640"],
			["imdb_id", "tt8740768"],
			["year", 2021],
			["genres", ["Komödie", "Drama"]],
			[
				"description",
				"Eine exzentrische Regisseurin bringt zwei rivalisierende Schauspieler zusammen.",
			],
			["cover", "[[assets/Der beste Film aller Zeiten (2021).jpg]]"],
			["rating", null],
			["last_finished", null],
			["shelf", "unsorted"],
			["tags", ["movies"]],
		]);
		expect(note).toBe(`---
template: "[[Movie Template]]"
type: movie
title: Der beste Film aller Zeiten
original_title: Competencia oficial
url: https://www.themoviedb.org/movie/668640
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
`);
	});

	// The example note from the book spec, character for character.
	it("reproduces the spec's book note", () => {
		const note = buildNote([
			["template", "[[Book Template]]"],
			["type", "book"],
			["title", "Die 1 % Methode"],
			["original_title", "Atomic habits"],
			["authors", ["Clear, James"]],
			["url", "https://d-nb.info/1198618736"],
			["isbn", "9783442178582"],
			["year", 2020],
			["series", null],
			["series_index", null],
			["genres", []],
			[
				"description",
				"Das Standardwerk über Gewohnheiten. Wer seine Gewohnheiten ändert, ändert sein Leben.",
			],
			["cover", "[[assets/Die 1 % Methode (2020).jpg]]"],
			["rating", null],
			["last_finished", null],
			["shelf", "unsorted"],
			["tags", ["books"]],
		]);
		expect(note).toBe(`---
template: "[[Book Template]]"
type: book
title: Die 1 % Methode
original_title: Atomic habits
authors:
  - Clear, James
url: https://d-nb.info/1198618736
isbn: "9783442178582"
year: 2020
series:
series_index:
genres: []
description: Das Standardwerk über Gewohnheiten. Wer seine Gewohnheiten ändert, ändert sein Leben.
cover: "[[assets/Die 1 % Methode (2020).jpg]]"
rating:
last_finished:
shelf: unsorted
tags:
  - books
---

## Notes
`);
	});
});
