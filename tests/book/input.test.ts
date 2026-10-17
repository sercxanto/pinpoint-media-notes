import { describe, expect, it } from "vitest";
import { EntryError } from "../../src/core/errors";
import {
	ean13CheckDigit,
	isValidIsbn10,
	isbn10To13,
	parseBookInput,
	toIsbn13,
	type BookQuery,
} from "../../src/book/input";

describe("parseBookInput", () => {
	it.each<[string, BookQuery]>([
		["9783442178582", { kind: "isbn", isbn: "9783442178582" }],
		["978-3-442-17858-2", { kind: "isbn", isbn: "9783442178582" }],
		[" 978 3 442 17858 2 ", { kind: "isbn", isbn: "9783442178582" }],
		["ISBN 978-3-442-17858-2", { kind: "isbn", isbn: "9783442178582" }],
		["ISBN-13: 9783442178582", { kind: "isbn", isbn: "9783442178582" }],
		["9791032305690", { kind: "isbn", isbn: "9791032305690" }],
		["\u200E978-3442178582", { kind: "isbn", isbn: "9783442178582" }],
		["ISBN-13 \u200F : \u200E 978-3442178582", { kind: "isbn", isbn: "9783442178582" }],
		["978\u200B3442178582\u2060", { kind: "isbn", isbn: "9783442178582" }],
		["\uFEFF978\u00A03442178582", { kind: "isbn", isbn: "9783442178582" }],
	])("reads %j as ISBN-13", (input, expected) => {
		expect(parseBookInput(input)).toEqual(expected);
	});

	it.each<[string, BookQuery]>([
		["3-442-17858-4", { kind: "isbn-or-idn", isbn: "9783442178582", idn: "3442178584" }],
		["1198618736", { kind: "isbn-or-idn", isbn: "9781198618734", idn: "1198618736" }],
		["139261385x", { kind: "isbn-or-idn", isbn: "9781392613856", idn: "139261385X" }],
	])("reads 10 characters %j as ISBN-10 or IDN", (input, expected) => {
		expect(parseBookInput(input)).toEqual(expected);
	});

	it.each<[string, BookQuery]>([
		["https://d-nb.info/1198618736", { kind: "idn", idn: "1198618736" }],
		["http://d-nb.info/139261385X/about/html", { kind: "idn", idn: "139261385X" }],
		["d-nb.info/1198618736?x=1#top", { kind: "idn", idn: "1198618736" }],
		["\u200Ehttps://d-nb.info/1198618736", { kind: "idn", idn: "1198618736" }],
		["954788106", { kind: "idn", idn: "954788106" }],
		["94478106X", { kind: "idn", idn: "94478106X" }],
		["12345678", { kind: "idn", idn: "12345678" }],
	])("reads %j as IDN", (input, expected) => {
		expect(parseBookInput(input)).toEqual(expected);
	});

	it.each([
		["", /Enter an ISBN/],
		["   ", /Enter an ISBN/],
		["\u200E", /Enter an ISBN/],
		["9783442178583", /wrong check digit/],
		["9773442178582", /does not start with 978 or 979/],
		["3442178585", /wrong check digit, as an ISBN-10 and as a DNB record number/],
		["https://d-nb.info/gnd/118540238", /not a link to a DNB record/],
		["1234567", /neither an ISBN nor/],
		["97834421785", /neither an ISBN nor/],
		["The Hobbit", /neither an ISBN nor/],
	])("rejects %j before any lookup", (input, message) => {
		expect(() => parseBookInput(input)).toThrow(EntryError);
		expect(() => parseBookInput(input)).toThrow(message);
	});
});

describe("check digits", () => {
	it("computes the EAN-13 check digit", () => {
		expect(ean13CheckDigit("978344217858")).toBe("2");
		expect(ean13CheckDigit("978384373787")).toBe("6");
		expect(ean13CheckDigit("978000000000")).toBe("2");
	});

	it("validates ISBN-10 including X", () => {
		expect(isValidIsbn10("3442178584")).toBe(true);
		expect(isValidIsbn10("080442957X")).toBe(true);
		expect(isValidIsbn10("0804429579")).toBe(false);
		expect(isValidIsbn10("X804429570")).toBe(false);
	});

	it("converts ISBN-10 to ISBN-13", () => {
		expect(isbn10To13("3442178584")).toBe("9783442178582");
		expect(isbn10To13("080442957X")).toBe("9780804429573");
	});
});

describe("toIsbn13", () => {
	it.each<[string, string | null]>([
		["978-3-442-17858-2", "9783442178582"],
		["3-442-17858-4", "9783442178582"],
		["080442957x", "9780804429573"],
		["3442178585", null],
		["9783442178582 (Gb.)", null],
		["", null],
	])("%j → %j", (raw, isbn) => {
		expect(toIsbn13(raw)).toBe(isbn);
	});
});
