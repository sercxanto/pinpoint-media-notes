import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HttpGet, HttpResponse } from "../src/io/http";
import type { VaultFiles } from "../src/io/vault";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

export function fixture(path: string): string {
	return readFileSync(join(FIXTURES, path), "utf8");
}

/** `[tag, subfields]` or `[tag, subfields, ind2]`; subfields as `[code, value]` pairs. */
export type TestField = [tag: string, subfields: [string, string][], ind2?: string];

const escapeXml = (text: string) =>
	text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A MARC21-XML record the way the DNB wraps it (inside an `srw:record`). */
export function marcRecord(idn: string, datafields: TestField[]): string {
	const body = datafields
		.map(([tag, subs, ind2 = " "]) => {
			const inner = subs
				.map(([code, value]) => `<subfield code="${code}">${escapeXml(value)}</subfield>`)
				.join("");
			return `<datafield tag="${tag}" ind1=" " ind2="${ind2}">${inner}</datafield>`;
		})
		.join("");
	return (
		`<record><recordSchema>MARC21-xml</recordSchema><recordPacking>xml</recordPacking><recordData>` +
		`<record xmlns="http://www.loc.gov/MARC21/slim" type="Bibliographic">` +
		`<leader>00000pam a2200000 c 4500</leader><controlfield tag="001">${idn}</controlfield>` +
		`${body}</record></recordData></record>`
	);
}

export function sruResponse(records: string[]): string {
	return (
		`<?xml version="1.0" encoding="UTF-8"?>` +
		`<searchRetrieveResponse xmlns="http://www.loc.gov/zing/srw/"><version>1.1</version>` +
		`<numberOfRecords>${records.length}</numberOfRecords><records>${records.join("")}</records>` +
		`</searchRetrieveResponse>`
	);
}

export interface FakeResponse {
	status?: number;
	contentType?: string;
	body?: string | ArrayBuffer;
}

/**
 * An HttpGet that answers from a table of exact URLs (404 for anything else)
 * and records every call, with the shared event log for order checks.
 */
export function fakeHttp(routes: Record<string, FakeResponse | Error>, log: string[] = []) {
	const calls: string[] = [];
	const get: HttpGet = (url) => {
		calls.push(url);
		log.push(`GET ${url}`);
		const route = routes[url];
		if (route instanceof Error) return Promise.reject(route);
		const { status = 200, contentType, body = "" } = route ?? { status: 404 };
		const response: HttpResponse = {
			status,
			header: (name) => (name.toLowerCase() === "content-type" ? contentType : undefined),
			text: () => (typeof body === "string" ? body : new TextDecoder().decode(body)),
			arrayBuffer: () =>
				typeof body === "string" ? new TextEncoder().encode(body).buffer : body,
		};
		return Promise.resolve(response);
	};
	return { get, calls };
}

/** In-memory VaultFiles; records writes in the shared event log. */
export function fakeFiles(existing: string[] = [], log: string[] = []) {
	const files = new Map<string, string | ArrayBuffer>(existing.map((path) => [path, ""]));
	const folders = new Set<string>();
	const vault: VaultFiles = {
		exists: (path) => Promise.resolve(files.has(path) || folders.has(path)),
		ensureFolder: (path) => {
			folders.add(path);
			return Promise.resolve();
		},
		createNote: (path, content) => {
			log.push(`note ${path}`);
			if (files.has(path)) return Promise.reject(new Error("File already exists."));
			files.set(path, content);
			return Promise.resolve();
		},
		createBinary: (path, data) => {
			log.push(`image ${path}`);
			if (files.has(path)) return Promise.reject(new Error("File already exists."));
			files.set(path, data);
			return Promise.resolve();
		},
	};
	return { vault, files, folders };
}
