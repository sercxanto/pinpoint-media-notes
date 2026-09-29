import { describe, expect, it } from "vitest";
import { ConfigError } from "../../src/core/errors";
import { checkVaultFolder, requireVaultFolder, validateFolderInput } from "../../src/core/paths";

describe("checkVaultFolder", () => {
	it.each([
		["Books", "Books"],
		["Media/Books", "Media/Books"],
		["  Media/Books/  ", "Media/Books"],
		["Media\\Books", "Media/Books"],
		["./Media//Books", "Media/Books"],
	])("accepts %j as %j", (raw, path) => {
		expect(checkVaultFolder(raw)).toEqual({ ok: true, path });
	});

	it.each(["", "   ", "/", ".", "/home/me/Notes/Books", "~/Notes", "C:\\Notes", "c:/Notes"])(
		"rejects %j",
		(raw) => {
			expect(checkVaultFolder(raw).ok).toBe(false);
		},
	);

	it.each(["..", "../Books", "Media/../Books", "Media/.."])("rejects %j for its ..", (raw) => {
		expect(checkVaultFolder(raw)).toEqual({
			ok: false,
			reason: 'The folder must not contain "..".',
		});
	});
});

describe("validateFolderInput", () => {
	it("allows an empty field while editing settings", () => {
		expect(validateFolderInput("")).toBeUndefined();
	});

	it("explains what is wrong with an invalid folder", () => {
		expect(validateFolderInput("../x")).toBe('The folder must not contain "..".');
	});
});

describe("requireVaultFolder", () => {
	it("returns the normalised folder", () => {
		expect(requireVaultFolder("Book notes folder", "Books/")).toBe("Books");
	});

	it("names the setting in the error", () => {
		expect(() => requireVaultFolder("Book notes folder", "")).toThrow(
			new ConfigError('Setting "Book notes folder": No folder set.'),
		);
	});
});
