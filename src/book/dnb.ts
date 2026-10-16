import { EntryError } from "../core/errors";
import { BOOK_HOST_HEADERS, type HttpGet, type HttpResponse } from "../io/http";
import type { CoverSize } from "../settings";
import { blurbText, truncateBlurb } from "./blurb";
import { downloadCover, type CoverResult } from "./cover";
import { parseSruResponse, type MarcRecord } from "./marc";

const SRU_ENDPOINT = "https://services.dnb.de/sru/dnb";
const COVER_ENDPOINT = "https://portal.dnb.de/opac/mvb/cover";

/** `NUM` searches ISBNs (and other numbers), `IDN` the record number. */
export type SruIndex = "NUM" | "IDN";

export function sruUrl(index: SruIndex, value: string): string {
	const params = new URLSearchParams({
		version: "1.1",
		operation: "searchRetrieve",
		recordSchema: "MARC21-xml",
		maximumRecords: "10",
		query: `${index}=${value}`,
	});
	return `${SRU_ENDPOINT}?${params.toString()}`;
}

export function coverUrl(isbn13: string, size: CoverSize): string {
	return `${COVER_ENDPOINT}?isbn=${encodeURIComponent(isbn13)}&size=${size}`;
}

async function get(http: HttpGet, url: string, what: string): Promise<HttpResponse> {
	try {
		return await http(url, BOOK_HOST_HEADERS);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new EntryError(`Could not reach the ${what}: ${reason}`);
	}
}

/** Catalogue search. Network and HTTP failures are entry errors. */
export async function searchCatalogue(
	http: HttpGet,
	index: SruIndex,
	value: string,
): Promise<MarcRecord[]> {
	const response = await get(http, sruUrl(index, value), "DNB catalogue");
	if (response.status !== 200) {
		throw new EntryError(`The DNB catalogue answered with HTTP ${response.status}.`);
	}
	return parseSruResponse(response.text());
}

export type BlurbResult = { ok: true; text: string } | { ok: false; reason: string };

/** The blurb, truncated. A failure is reported but does not stop the entry. */
export async function fetchBlurb(http: HttpGet, url: string): Promise<BlurbResult> {
	let response: HttpResponse;
	try {
		response = await http(url, BOOK_HOST_HEADERS);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return { ok: false, reason: `the blurb could not be fetched (${reason})` };
	}
	if (response.status !== 200) {
		return { ok: false, reason: `the blurb page answered with HTTP ${response.status}` };
	}
	return { ok: true, text: truncateBlurb(blurbText(response.text())) };
}

/** Downloads one MVB cover, judged by {@link downloadCover}. */
export function fetchCover(http: HttpGet, isbn13: string, size: CoverSize): Promise<CoverResult> {
	return downloadCover(http, coverUrl(isbn13, size), isbn13);
}
