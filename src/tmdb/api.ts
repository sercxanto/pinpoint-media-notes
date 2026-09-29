import { ConfigError, EntryError } from "../core/errors";
import { nfc } from "../core/text";
import type { HttpGet, HttpResponse } from "../io/http";
import type { TmdbRef } from "./input";

const API_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p/";

/** `language` null asks without the parameter, for the translation fallback. */
export function detailsUrl(ref: TmdbRef, language: string | null): string {
	const url = `${API_BASE}/${ref.kind}/${ref.id}`;
	return language === null ? url : `${url}?language=${encodeURIComponent(language)}`;
}

/** Series only: `/tv/{id}` lacks `imdb_id`, this endpoint has it. */
export function externalIdsUrl(ref: TmdbRef): string {
	return `${API_BASE}/${ref.kind}/${ref.id}/external_ids`;
}

/** `posterPath` starts with a slash, as TMDB delivers it. */
export function posterUrl(size: string, posterPath: string): string {
	return `${IMAGE_BASE}${size}${posterPath}`;
}

/** Sent to the API only, never to the image host. */
export function tmdbHeaders(token: string): Record<string, string> {
	return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

/**
 * Removes the token from a message, in case an error from below ever
 * echoes the request. Messages built here never contain it in the first
 * place.
 */
export function redact(message: string, token: string): string {
	return token === "" ? message : message.split(token).join("***");
}

/**
 * GET against the API, parsed and NFC-normalised. A rejected token is a
 * ConfigError: every further request would fail the same way. Anything else
 * (network, unknown id, server error, unreadable body) is an EntryError.
 */
export async function getJson(
	http: HttpGet,
	url: string,
	token: string,
	what: string,
): Promise<unknown> {
	let response: HttpResponse;
	try {
		response = await http(url, tmdbHeaders(token));
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new EntryError(`Could not reach TMDB for ${what}: ${redact(reason, token)}`);
	}
	if (response.status === 401) {
		throw new ConfigError(
			'TMDB rejected the access token (HTTP 401). Check the setting "TMDB read access token": it needs the long API read access token, not the API key.',
		);
	}
	if (response.status === 404) throw new EntryError(`TMDB has no ${what}.`);
	if (response.status !== 200) {
		throw new EntryError(`TMDB answered with HTTP ${response.status} for ${what}.`);
	}
	try {
		return normalizeStrings(JSON.parse(response.text()));
	} catch {
		throw new EntryError(`TMDB sent an unreadable answer for ${what}.`);
	}
}

/** NFC-normalises every string in a parsed JSON value, as it is read. */
export function normalizeStrings(value: unknown): unknown {
	if (typeof value === "string") return nfc(value);
	if (Array.isArray(value)) return value.map(normalizeStrings);
	if (typeof value === "object" && value !== null) {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [key, normalizeStrings(item)]),
		);
	}
	return value;
}

export type PosterResult = { ok: true; data: ArrayBuffer } | { ok: false; reason: string };

/**
 * Downloads a poster from the image host, without the token. Only an
 * `image/*` answer counts; a failure is reported and the note written
 * without cover.
 */
export async function fetchPoster(
	http: HttpGet,
	size: string,
	posterPath: string,
): Promise<PosterResult> {
	let response: HttpResponse;
	try {
		response = await http(posterUrl(size, posterPath));
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return { ok: false, reason: `the image server could not be reached (${reason})` };
	}
	const contentType =
		(response.header("Content-Type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
	if (response.status !== 200) {
		return { ok: false, reason: `the image server answered with HTTP ${response.status}` };
	}
	if (!contentType.startsWith("image/")) {
		return {
			ok: false,
			reason: `the image server sent ${contentType || "no content type"} instead of an image`,
		};
	}
	return { ok: true, data: response.arrayBuffer() };
}
