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

export type HttpGet = (url: string, headers?: Record<string, string>) => Promise<HttpResponse>;

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
