import { describe, expect, it } from "vitest";
import { EntryError } from "../../src/core/errors";
import { nfc, noteStem, sanitizeFileName } from "../../src/core/text";

describe("nfc", () => {
	it("composes decomposed umlauts", () => {
		const decomposed = "Hörbuch";
		expect(decomposed).not.toBe("Hörbuch");
		expect(nfc(decomposed)).toBe("Hörbuch");
	});
});

describe("sanitizeFileName", () => {
	it("strips every forbidden character", () => {
		expect(sanitizeFileName('a*b"c\\d/e<f>g:h|i?j#k^l[m]n')).toBe("abcdefghijklmn");
	});

	it("collapses whitespace and trims", () => {
		expect(sanitizeFileName("  Mission:  Impossible \t – Dead\nReckoning ")).toBe(
			"Mission Impossible – Dead Reckoning",
		);
	});

	it("keeps characters that are safe in file names and links", () => {
		expect(sanitizeFileName("Die 1 % Methode (Band 2) & mehr!")).toBe(
			"Die 1 % Methode (Band 2) & mehr!",
		);
	});

	it("strips leading dots, which would hide the file from Obsidian", () => {
		expect(sanitizeFileName("...And Justice for All")).toBe("And Justice for All");
	});

	it("strips control characters, which Windows rejects", () => {
		expect(sanitizeFileName("Null\u0000Byte \u001b[1m Escape\u0085")).toBe(
			"NullByte 1m Escape",
		);
	});

	it("strips bidirectional controls, which disguise a name", () => {
		expect(sanitizeFileName("Report\u202Efdp.exe")).toBe("Reportfdp.exe");
		expect(sanitizeFileName("\u200FKitab \u2067\u2069 Arabic\u200E")).toBe("Kitab Arabic");
	});

	it("keeps joiners, which belong to some scripts and emoji", () => {
		expect(sanitizeFileName("Mi\u200Craj 👩\u200D💻")).toBe("Mi\u200Craj 👩\u200D💻");
	});
});

describe("noteStem", () => {
	it("appends the year", () => {
		expect(noteStem("Competencia: oficial", 2021)).toBe("Competencia oficial (2021)");
	});

	it("uses the title alone when the year is unknown", () => {
		expect(noteStem("Ohne Jahr", null)).toBe("Ohne Jahr");
	});

	it("appends a suffix after the year, or after the title without year", () => {
		expect(noteStem("Die Känguru-Rebellion", 2026, " - Hörbuch")).toBe(
			"Die Känguru-Rebellion (2026) - Hörbuch",
		);
		expect(noteStem("Die Känguru-Rebellion", null, " - E-Book")).toBe(
			"Die Känguru-Rebellion - E-Book",
		);
	});

	it("rejects a title that leaves nothing after sanitising", () => {
		expect(() => noteStem("???", 2020)).toThrow(EntryError);
	});

	it.each<[string, number | null, string]>([
		["Con", null, "Con"],
		["nul", null, "nul"],
		["COM1", null, "COM1"],
		["LPT¹", null, "LPT¹"],
		["Aux. Tales", 2020, "Aux. Tales (2020)"],
		["Prn .Notes", null, "Prn .Notes"],
	])("rejects %j, which Windows reserves for a device", (title, year, stem) => {
		expect(() => noteStem(title, year)).toThrow(
			new EntryError(
				`The title "${title}" gives the file name "${stem}", which Windows reserves for a device.`,
			),
		);
	});

	it("accepts a device name with more after it", () => {
		expect(noteStem("Con", 2020)).toBe("Con (2020)");
		expect(noteStem("Nul", null, " - E-Book")).toBe("Nul - E-Book");
		expect(noteStem("Console", null)).toBe("Console");
		expect(noteStem("COM10", null)).toBe("COM10");
	});
});
