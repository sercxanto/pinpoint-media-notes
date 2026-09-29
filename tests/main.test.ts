import type { RequestUrlParam, RequestUrlResponse } from "obsidian";
import { App } from "obsidian";
import { http, notices } from "./__mocks__/obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import { coverUrl, sruUrl } from "../src/book/dnb";
import PinpointMediaNotesPlugin from "../src/main";
import { fixture } from "./helpers";

async function loadPlugin(settings: unknown): Promise<PinpointMediaNotesPlugin> {
	const plugin = new PinpointMediaNotesPlugin(new App(), {} as never);
	(plugin as unknown as { data: unknown }).data = settings;
	await plugin.onload();
	return plugin;
}

function response(contentType: string, body: string | ArrayBuffer): RequestUrlResponse {
	return {
		status: 200,
		headers: { "content-type": contentType },
		text: typeof body === "string" ? body : "",
		arrayBuffer: typeof body === "string" ? new ArrayBuffer(0) : body,
		json: null,
	};
}

describe("book import command", () => {
	beforeEach(() => {
		notices.length = 0;
		http.calls = [];
	});

	it("is registered", async () => {
		const plugin = await loadPlugin(null);
		const commands = (plugin as unknown as { commands: { id: string; name: string }[] })
			.commands;
		expect(commands.map((command) => command.id)).toEqual(["import-book"]);
	});

	it("stops with a message naming the setting when the notes folder is missing", async () => {
		const plugin = await loadPlugin(null);
		plugin.openBookImport();
		expect(notices).toEqual(['Setting "Book notes folder": No folder set.']);
		expect(http.calls).toEqual([]);
	});

	it("imports an entry end to end through requestUrl and the vault", async () => {
		const isbn = "9783442178582";
		const jpeg = new Uint8Array([0xff, 0xd8]).buffer;
		const routes: Record<string, RequestUrlResponse> = {
			[sruUrl("NUM", isbn)]: response(
				"application/xml",
				fixture("book/sru-1-prozent-methode.xml"),
			),
			"https://services.dnb.de/plus/idn/1198618736/blurb/": response(
				"text/html",
				"<p>Kurz.</p>",
			),
			[coverUrl(isbn, "l")]: response("image/jpeg", jpeg),
		};
		http.handler = (request: RequestUrlParam) => {
			const route = routes[request.url];
			if (!route) throw new Error(`unexpected ${request.url}`);
			return route;
		};

		const plugin = await loadPlugin({ bookNotesDir: "Books" });
		expect(await plugin.importBookEntry(isbn)).toBe(true);

		const vault = plugin.app.vault as unknown as { files: Map<string, unknown> };
		expect([...vault.files.keys()]).toEqual([
			"assets/Die 1 % Methode (2020).jpg",
			"Books/Die 1 % Methode (2020).md",
		]);
		expect(notices).toEqual([
			`Created "Books/Die 1 % Methode (2020).md". Cover from ISBN ${isbn}.`,
		]);

		// The same entry again: a collision, reported, nothing overwritten.
		expect(await plugin.importBookEntry(isbn)).toBe(false);
		expect(notices[1]).toBe('Skipped: "Books/Die 1 % Methode (2020).md" already exists.');
	});
});
