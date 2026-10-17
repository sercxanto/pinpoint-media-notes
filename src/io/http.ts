import { requestUrl } from "obsidian";

// The only place that talks to the network. `requestUrl` rather than `fetch`,
// because it is not subject to CORS, and both APIs are called directly.

export interface HttpResponse {
	status: number;
	/** Response header by name, case-insensitive. */
	header(name: string): string | undefined;
	text(): string;
	arrayBuffer(): ArrayBuffer;
}

/** The Content-Type without parameters, lower-cased; "" when absent. */
export function mediaType(response: HttpResponse): string {
	return (response.header("Content-Type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

export type HttpGet = (url: string, headers?: Record<string, string>) => Promise<HttpResponse>;

/**
 * Sent with every request to a book host (DNB, LoC, Open Library). The DNB
 * cover host's bot filter challenges any browser-like User-Agent (containing
 * `Mozilla`) with an HTML page, and Obsidian's own is one; a client that
 * names itself is let through. Open Library asks API clients for a name and
 * a contact; the repository URL is the contact.
 */
export const BOOK_HOST_HEADERS: Record<string, string> = {
	"User-Agent":
		"pinpoint-media-notes (Obsidian plugin; +https://github.com/sercxanto/pinpoint-media-notes)",
};

/**
 * GET without throwing on HTTP error statuses; callers decide what a status
 * means. Network failures still reject. Headers (the TMDB token among them)
 * are passed through and never appear in errors raised here.
 */
export const httpGet: HttpGet = async (url, headers = {}) => {
	const response = await requestUrl({ url, method: "GET", headers, throw: false });
	const byName = new Map(
		Object.entries(response.headers).map(([name, value]) => [name.toLowerCase(), value]),
	);
	return {
		status: response.status,
		header: (name) => byName.get(name.toLowerCase()),
		text: () => response.text,
		arrayBuffer: () => response.arrayBuffer,
	};
};
