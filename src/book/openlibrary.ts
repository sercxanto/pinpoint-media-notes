import { reasonOf } from "../core/errors";
import { nfc } from "../core/text";
import { BOOK_HOST_HEADERS, type HttpGet, type HttpResponse } from "../io/http";
import type { CoverSize } from "../settings";
import { downloadCover, type CoverResult } from "./cover";

// Open Library: the title and the cover of an LoC record, nothing else.

export function openLibraryEditionUrl(isbn13: string): string {
	return `https://openlibrary.org/isbn/${encodeURIComponent(isbn13)}.json`;
}

/** The setting's `s`, `m`, `l` are Open Library's `S`, `M`, `L`. */
export function openLibraryCoverUrl(isbn13: string, size: CoverSize): string {
	return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn13)}-${size.toUpperCase()}.jpg?default=false`;
}

/**
 * `none`: Open Library has no edition with this ISBN, which is not worth a
 * message. `failed`: the lookup went wrong; the LoC title is used and the
 * reason reported.
 */
export type OpenLibraryTitle =
	{ kind: "title"; title: string } | { kind: "none" } | { kind: "failed"; reason: string };

/**
 * The edition's `title`. A hit is a redirect to `/books/<id>.json`, which
 * the HTTP layer follows; a miss is HTTP 404 with an HTML page. Never throws
 * for what the server sends or a network failure.
 */
export async function fetchOpenLibraryTitle(
	http: HttpGet,
	isbn13: string,
): Promise<OpenLibraryTitle> {
	let response: HttpResponse;
	try {
		response = await http(openLibraryEditionUrl(isbn13), BOOK_HOST_HEADERS);
	} catch (error) {
		const reason = reasonOf(error);
		return { kind: "failed", reason: `Open Library could not be reached (${reason})` };
	}
	if (response.status === 404) return { kind: "none" };
	if (response.status !== 200) {
		return { kind: "failed", reason: `Open Library answered with HTTP ${response.status}` };
	}
	let data: unknown;
	try {
		data = JSON.parse(response.text());
	} catch {
		return { kind: "failed", reason: "Open Library sent an edition that is not JSON" };
	}
	const title =
		typeof data === "object" && data !== null ? (data as { title?: unknown }).title : null;
	const text = typeof title === "string" ? nfc(title).trim() : "";
	if (text === "") return { kind: "failed", reason: "the Open Library edition has no title" };
	return { kind: "title", title: text };
}

/**
 * Downloads one Open Library cover, judged by {@link downloadCover}. A hit
 * may be a redirect to `archive.org`, which the HTTP layer follows; a miss
 * is HTTP 404, thanks to `default=false`.
 */
export function fetchOpenLibraryCover(
	http: HttpGet,
	isbn13: string,
	size: CoverSize,
): Promise<CoverResult> {
	return downloadCover(http, openLibraryCoverUrl(isbn13, size), isbn13);
}
