import { EntryError } from "../core/errors";
import type { HttpGet, HttpResponse } from "../io/http";
import type { CoverSize } from "../settings";
import { blurbText, truncateBlurb } from "./blurb";
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
		return await http(url);
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
		response = await http(url);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return { ok: false, reason: `the blurb could not be fetched (${reason})` };
	}
	if (response.status !== 200) {
		return { ok: false, reason: `the blurb page answered with HTTP ${response.status}` };
	}
	return { ok: true, text: truncateBlurb(blurbText(response.text())) };
}

/**
 * `missing`: the server has no usable cover for this ISBN, another edition's
 * may do. `blocked`: the server did not serve covers at all (bot check,
 * error, unreachable); asking again for another ISBN would get the same.
 */
export type CoverResult =
	| { ok: true; data: ArrayBuffer; extension: string }
	| { ok: false; failure: "missing" | "blocked"; reason: string };

/**
 * Downloads one cover. A bot filter answers challenged requests with HTTP 200
 * and an HTML page, so only an `image/*` Content-Type counts as a cover,
 * whatever the status.
 */
export async function fetchCover(
	http: HttpGet,
	isbn13: string,
	size: CoverSize,
): Promise<CoverResult> {
	let response: HttpResponse;
	try {
		response = await http(coverUrl(isbn13, size));
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return {
			ok: false,
			failure: "blocked",
			reason: `the cover server could not be reached (${reason})`,
		};
	}
	const contentType =
		(response.header("Content-Type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
	if (contentType.startsWith("image/")) {
		const extension = IMAGE_TYPES[contentType];
		if (extension === undefined) {
			return {
				ok: false,
				failure: "missing",
				reason: `the cover server sent an unsupported image type, ${contentType}`,
			};
		}
		return { ok: true, data: response.arrayBuffer(), extension };
	}
	if (response.status === 404) {
		return {
			ok: false,
			failure: "missing",
			reason: `the cover server has no cover for ISBN ${isbn13}`,
		};
	}
	if (response.status === 200 && contentType === "text/html") {
		return {
			ok: false,
			failure: "blocked",
			reason: "the cover server answered with text/html instead of an image, probably its bot check",
		};
	}
	return {
		ok: false,
		failure: "blocked",
		reason: `the cover server answered with HTTP ${response.status} and ${contentType || "no content type"} instead of an image`,
	};
}

/** Image types accepted as covers, by Content-Type, with their file extension. */
const IMAGE_TYPES: Partial<Record<string, string>> = {
	"image/jpeg": "jpg",
	"image/pjpeg": "jpg",
	"image/png": "png",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/avif": "avif",
};

/**
 * Extensions an existing cover may have. The extension comes from the
 * response, so an existing file is looked for under each of them before any
 * download.
 */
export const COVER_EXTENSIONS = [...new Set(Object.values(IMAGE_TYPES))].filter(
	(extension) => extension !== undefined,
);
