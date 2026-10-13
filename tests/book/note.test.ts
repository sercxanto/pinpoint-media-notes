import { describe, expect, it } from "vitest";
import { parseSruResponse } from "../../src/book/marc";
import { bookNote, bookStem } from "../../src/book/note";
import { readDnbRecord } from "../../src/book/dnb-record";
import type { BookRecord } from "../../src/book/record";
import { fixture } from "../helpers";

const methode = (): BookRecord =>
	readDnbRecord(parseSruResponse(fixture("book/sru-1-prozent-methode.xml"))[0]!);

// The spec's example note, character for character. A change here is a
// change of the vault's note format.
const GOLDEN = `---
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
`;

describe("bookNote", () => {
	it("reproduces the golden note from the real catalogue record", () => {
		const note = bookNote(
			methode(),
			"book",
			"Das Standardwerk über Gewohnheiten. Wer seine Gewohnheiten ändert, ändert sein Leben.",
			"assets/Die 1 % Methode (2020).jpg",
		);
		expect(note).toBe(GOLDEN);
	});

	it("writes series, numbers, empty authors and an empty cover", () => {
		const book: BookRecord = {
			...methode(),
			authors: [],
			series: "Die Känguru-Werke",
			seriesIndex: 5,
			year: null,
			isbn: "9790000000001",
		};
		const note = bookNote(book, "ebook", "", null);
		expect(note).toContain("\ntype: ebook\n");
		expect(note).toContain("\nauthors: []\n");
		expect(note).toContain('\nisbn: "9790000000001"\n');
		expect(note).toContain("\nyear:\n");
		expect(note).toContain("\nseries: Die Känguru-Werke\nseries_index: 5\n");
		expect(note).toContain("\ndescription:\ncover:\nrating:\n");
	});

	it("writes a blank isbn when the record has none", () => {
		expect(bookNote({ ...methode(), isbn: null }, "book", "", null)).toContain("\nisbn:\n");
	});
});

describe("bookStem", () => {
	it("always appends the type suffix", () => {
		const book = methode();
		expect(bookStem(book, "book")).toBe("Die 1 % Methode (2020)");
		expect(bookStem(book, "ebook")).toBe("Die 1 % Methode (2020) - E-Book");
		expect(bookStem(book, "audiobook")).toBe("Die 1 % Methode (2020) - Hörbuch");
	});

	it("keeps the suffix without a year and sanitises the title", () => {
		const book = { ...methode(), title: "Wer? Wie: Was", year: null };
		expect(bookStem(book, "audiobook")).toBe("Wer Wie Was - Hörbuch");
	});
});
