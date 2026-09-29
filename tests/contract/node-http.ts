import type { HttpGet } from "../../src/io/http";

/**
 * HttpGet over Node's fetch, for the live checks only: `requestUrl` exists
 * inside Obsidian alone. Production code never calls fetch.
 */
export const nodeHttp: HttpGet = async (url, headers = {}) => {
	const response = await fetch(url, { headers });
	const body = await response.arrayBuffer();
	return {
		status: response.status,
		header: (name) => response.headers.get(name) ?? undefined,
		text: () => new TextDecoder().decode(body),
		arrayBuffer: () => body,
	};
};
