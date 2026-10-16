import { EntryError } from "../core/errors";
import { BOOK_HOST_HEADERS, type HttpGet, type HttpResponse } from "../io/http";
import { JsonLdGraph } from "./jsonld";
import { readLocRecord, type LocRecord } from "./loc-record";

const INSTANCES = "https://id.loc.gov/resources/instances";

/** At most this many search hits are fetched, one after the other. */
export const LOC_MAX_RECORDS = 10;

export function locSearchUrl(isbn13: string): string {
	return `${INSTANCES}/suggest2?q=${encodeURIComponent(isbn13)}&searchtype=keyword`;
}

/** The record document: instance, work, names and summary in one JSON-LD graph. */
export function locDocumentUrl(id: string): string {
	return `${INSTANCES}/${encodeURIComponent(id)}.cbd.json`;
}

async function get(http: HttpGet, url: string): Promise<HttpResponse> {
	let response: HttpResponse;
	try {
		response = await http(url, BOOK_HOST_HEADERS);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new EntryError(`Could not reach the LoC catalogue: ${reason}`);
	}
	if (response.status !== 200) {
		throw new EntryError(`The LoC catalogue answered with HTTP ${response.status}.`);
	}
	return response;
}

/**
 * Record numbers of the instances a keyword search for the ISBN finds, at
 * most {@link LOC_MAX_RECORDS}. No hit gives an empty list. Network and HTTP
 * failures and an unreadable response are entry errors.
 */
export async function searchLoc(http: HttpGet, isbn13: string): Promise<string[]> {
	const response = await get(http, locSearchUrl(isbn13));
	let data: unknown;
	try {
		data = JSON.parse(response.text());
	} catch {
		throw new EntryError("The LoC catalogue sent a search result that is not JSON.");
	}
	const hits =
		typeof data === "object" && data !== null ? (data as { hits?: unknown }).hits : null;
	if (!Array.isArray(hits)) {
		throw new EntryError("The LoC catalogue sent a search result without hits.");
	}
	const tokens = hits
		.map((hit: unknown) =>
			typeof hit === "object" && hit !== null ? (hit as { token?: unknown }).token : null,
		)
		.filter((token): token is string => typeof token === "string" && token !== "");
	return [...new Set(tokens)].slice(0, LOC_MAX_RECORDS);
}

/** One record document, mapped. Failures are entry errors. */
export async function fetchLocRecord(http: HttpGet, id: string): Promise<LocRecord> {
	const response = await get(http, locDocumentUrl(id));
	const graph = JsonLdGraph.parse(response.text());
	if (graph === null) throw new EntryError(`LoC record ${id} is not a JSON-LD document.`);
	return readLocRecord(graph, id);
}
