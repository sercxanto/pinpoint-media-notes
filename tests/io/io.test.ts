import type { RequestUrlParam } from "obsidian";
import { http, Vault } from "../__mocks__/obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import { httpGet } from "../../src/io/http";
import { vaultFiles } from "../../src/io/vault";

describe("httpGet", () => {
	beforeEach(() => {
		http.calls = [];
	});

	it("passes URL and headers through and never throws on an HTTP error status", async () => {
		http.handler = () => ({
			status: 404,
			headers: { "Content-Type": "text/html" },
			text: "not found",
			arrayBuffer: new ArrayBuffer(0),
			json: null,
		});
		const response = await httpGet("https://example.org/x", { Accept: "application/json" });
		expect(http.calls).toEqual<RequestUrlParam[]>([
			{
				url: "https://example.org/x",
				method: "GET",
				headers: { Accept: "application/json" },
				throw: false,
			},
		]);
		expect(response.status).toBe(404);
		expect(response.text()).toBe("not found");
	});

	it("looks up headers case-insensitively", async () => {
		http.handler = () => ({
			status: 200,
			headers: { "content-type": "image/jpeg" },
			text: "",
			arrayBuffer: new ArrayBuffer(3),
			json: null,
		});
		const response = await httpGet("https://example.org/cover");
		expect(response.header("Content-Type")).toBe("image/jpeg");
		expect(response.arrayBuffer().byteLength).toBe(3);
	});
});

describe("vaultFiles", () => {
	it("creates missing folders with their parents and tolerates existing ones", async () => {
		const vault = new Vault();
		const files = vaultFiles(vault as never);
		await files.ensureFolder("Media/Books/");
		await files.ensureFolder("Media/Books");
		expect([...vault.folders]).toEqual(["Media", "Media/Books"]);
	});

	it("writes notes and binaries and reports what exists", async () => {
		const vault = new Vault();
		const files = vaultFiles(vault as never);
		await files.createNote("Books/A.md", "text");
		await files.createBinary("assets/A.jpg", new ArrayBuffer(1));
		expect(await files.exists("Books/A.md")).toBe(true);
		expect(await files.exists("assets/A.jpg")).toBe(true);
		expect(await files.exists("Books/B.md")).toBe(false);
	});

	it("refuses to overwrite a note", async () => {
		const vault = new Vault();
		const files = vaultFiles(vault as never);
		await files.createNote("Books/A.md", "first");
		await expect(files.createNote("Books/A.md", "second")).rejects.toThrow();
		expect(vault.files.get("Books/A.md")).toBe("first");
	});
});
