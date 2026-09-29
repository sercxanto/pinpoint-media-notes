import { describe, expect, it } from "vitest";
import { BLURB_LIMIT, blurbText, truncateBlurb } from "../../src/book/blurb";

// Shaped like the DNB's blurb pages, with invented text.
const PAGE =
	'<html><head><link href="/favicon.ico" rel="icon" type="image/x-icon"/><style>b{}</style></head>' +
	'<body><div style="font-size:14px; font-family: Georgia"><b>Der Bestseller!</b><br /><br />' +
	"Ein Buch &uuml;ber &raquo;Gewohnheiten&laquo; &amp; Ziele.\n  Es hilft.<p />" +
	"Siehe auch<i>: Das Journal</i></div></body></html>";

describe("blurbText", () => {
	it("strips tags, decodes entities and collapses whitespace", () => {
		expect(blurbText(PAGE)).toBe(
			"Der Bestseller! Ein Buch über »Gewohnheiten« & Ziele. Es hilft. Siehe auch: Das Journal",
		);
	});

	it("normalises to NFC", () => {
		expect(blurbText("<p>Müller</p>")).toBe("Müller");
	});

	it("returns an empty string for an empty page", () => {
		expect(blurbText("<html><body></body></html>")).toBe("");
	});
});

describe("truncateBlurb", () => {
	const sentence = (n: number, length: number) =>
		`Satz ${n} ${"x".repeat(length - `Satz ${n} `.length - 1)}.`;

	it("keeps a short text unchanged", () => {
		expect(truncateBlurb("Kurz. Ohne Punkt am Ende")).toBe("Kurz. Ohne Punkt am Ende");
	});

	it("keeps whole sentences while staying under the limit", () => {
		const text = [sentence(1, 200), sentence(2, 200), sentence(3, 200)].join(" ");
		expect(truncateBlurb(text)).toBe(`${sentence(1, 200)} ${sentence(2, 200)}`);
	});

	it("never reaches the limit", () => {
		// 249 + 1 + 250 = 500 characters: the second sentence must go.
		const text = `${sentence(1, 249)} ${sentence(2, 250)} Rest.`;
		expect(truncateBlurb(text)).toBe(sentence(1, 249));
		const exact = `${sentence(1, 249)} ${sentence(2, 249)} Rest.`;
		expect(truncateBlurb(exact)).toHaveLength(499);
	});

	it("treats !, ? and closing quotes as sentence ends", () => {
		const long = "y".repeat(600);
		expect(truncateBlurb(`Wirklich? »Ja!« ${long}.`)).toBe("Wirklich? »Ja!«");
	});

	it("cuts an overlong first sentence at a word boundary and appends …", () => {
		const words = Array.from({ length: 120 }, (_, i) => `wort${i}`).join(" ");
		const result = truncateBlurb(`${words}.`);
		expect(result.length).toBeLessThan(BLURB_LIMIT);
		expect(result.endsWith("…")).toBe(true);
		expect(`${words}.`.startsWith(result.slice(0, -1))).toBe(true);
		expect(result.at(-2)).toMatch(/\d/);
	});

	it("cuts a text without any space hard", () => {
		const result = truncateBlurb("z".repeat(800));
		expect(result).toBe(`${"z".repeat(498)}…`);
	});
});
