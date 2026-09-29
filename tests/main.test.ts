import type { RequestUrlParam, RequestUrlResponse } from "obsidian";
import { App } from "obsidian";
import { http, notices } from "./__mocks__/obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import { coverUrl, sruUrl } from "../src/book/dnb";
import { detailsUrl, posterUrl } from "../src/tmdb/api";
import PinpointMediaNotesPlugin from "../src/main";
import { fixture } from "./helpers";

async function loadPlugin(settings: unknown): Promise<PinpointMediaNotesPlugin> {
	const plugin = new PinpointMediaNotesPlugin(new App(), {} as never);
	(plugin as unknown as { data: unknown }).data = settings;
	await plugin.onload();
	return plugin;
}

function response(
	contentType: string,
	body: string | ArrayBuffer,
	status = 200,
): RequestUrlResponse {
	return {
		status,
		headers: { "content-type": contentType },
		text: typeof body === "string" ? body : "",
		arrayBuffer: typeof body === "string" ? new ArrayBuffer(0) : body,
		json: null,
	};
}

function serve(routes: Record<string, RequestUrlResponse>): void {
	http.handler = (request: RequestUrlParam) => {
		const route = routes[request.url];
		if (!route) throw new Error(`unexpected ${request.url}`);
		return route;
	};
}

beforeEach(() => {
	notices.length = 0;
	http.calls = [];
});

describe("commands", () => {
	it("are registered", async () => {
		const plugin = await loadPlugin(null);
		const commands = (plugin as unknown as { commands: { id: string; name: string }[] })
			.commands;
		expect(commands.map((command) => command.id)).toEqual([
			"import-book",
			"import-movie-or-series",
		]);
	});
});

describe("book import command", () => {
	it("stops with a message naming the setting when the notes folder is missing", async () => {
		const plugin = await loadPlugin(null);
		plugin.openBookImport();
		expect(notices).toEqual(['Setting "Book notes folder": No folder set.']);
		expect(http.calls).toEqual([]);
	});

	it("imports an entry end to end through requestUrl and the vault", async () => {
		const isbn = "9783442178582";
		const jpeg = new Uint8Array([0xff, 0xd8]).buffer;
		serve({
			[sruUrl("NUM", isbn)]: response(
				"application/xml",
				fixture("book/sru-1-prozent-methode.xml"),
			),
			"https://services.dnb.de/plus/idn/1198618736/blurb/": response(
				"text/html",
				"<p>Kurz.</p>",
			),
			[coverUrl(isbn, "l")]: response("image/jpeg", jpeg),
		});

		const plugin = await loadPlugin({ bookNotesDir: "Books" });
		expect(await plugin.importBookEntry(isbn)).toBe("next");

		const vault = plugin.app.vault as unknown as { files: Map<string, unknown> };
		expect([...vault.files.keys()]).toEqual([
			"assets/Die 1 % Methode (2020).jpg",
			"Books/Die 1 % Methode (2020).md",
		]);
		expect(notices).toEqual([
			`Created "Books/Die 1 % Methode (2020).md". Cover from ISBN ${isbn}.`,
		]);

		// The same entry again: a collision, reported, nothing overwritten.
		expect(await plugin.importBookEntry(isbn)).toBe("retry");
		expect(notices[1]).toBe('Skipped: "Books/Die 1 % Methode (2020).md" already exists.');
	});
});

describe("movie and series import command", () => {
	const TOKEN = "eyJhbGciOiJIUzI1NiJ9.main-test-token";
	const settings = { tmdbNotesDir: "Movies", tmdbToken: TOKEN, tmdbLanguage: "de-DE" };
	const movie = { kind: "movie", id: "800815" } as const;

	it("stops with a message naming the setting when the token is missing", async () => {
		const plugin = await loadPlugin({ tmdbNotesDir: "Movies" });
		plugin.openTmdbImport();
		expect(notices).toEqual(['Setting "TMDB read access token": No token set.']);
		expect(http.calls).toEqual([]);
	});

	it("imports an entry end to end through requestUrl and the vault", async () => {
		serve({
			[detailsUrl(movie, "de-DE")]: response(
				"application/json",
				fixture("tmdb/movie-800815-de-DE.json"),
			),
			[posterUrl("w500", "/3VqKmtBv4sG1iVFYWKPrJmVZXYT.jpg")]: response(
				"image/jpeg",
				new Uint8Array([0xff, 0xd8]).buffer,
			),
		});

		const plugin = await loadPlugin(settings);
		expect(await plugin.importTmdbEntry("https://www.themoviedb.org/movie/800815")).toBe(
			"next",
		);

		const vault = plugin.app.vault as unknown as { files: Map<string, unknown> };
		expect([...vault.files.keys()]).toEqual([
			"assets/Der beste Film aller Zeiten (2021).jpg",
			"Movies/Der beste Film aller Zeiten (2021).md",
		]);
		expect(notices).toEqual([
			'Created "Movies/Der beste Film aller Zeiten (2021).md". Poster saved.',
		]);
		expect(http.calls[0]?.headers).toEqual({
			Authorization: `Bearer ${TOKEN}`,
			Accept: "application/json",
		});
	});

	it("keeps the input after an entry error", async () => {
		const plugin = await loadPlugin(settings);
		expect(await plugin.importTmdbEntry("800815")).toBe("retry");
		expect(http.calls).toEqual([]);
	});

	it("ends the session when TMDB rejects the token, without showing it", async () => {
		serve({
			[detailsUrl(movie, "de-DE")]: response(
				"application/json",
				fixture("tmdb/error-401.json"),
				401,
			),
		});
		const plugin = await loadPlugin(settings);
		expect(await plugin.importTmdbEntry("movie/800815")).toBe("stop");
		expect(notices).toHaveLength(1);
		expect(notices[0]).toMatch(/^TMDB rejected the access token/);
		expect(notices[0]).not.toContain(TOKEN);
	});
});
