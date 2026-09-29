import { EntryError } from "../core/errors";
import type { TmdbKind } from "./input";

/** What the importer reads from the API for one movie or series. */
export interface TmdbEntry {
	title: string;
	originalTitle: string;
	year: number | null;
	description: string;
	genres: string[];
	/** From the details for a movie, from `external_ids` for a series. */
	imdbId: string | null;
	/** Path on the image host, starting with `/`. */
	posterPath: string | null;
}

/**
 * Where each field comes from, per kind. Typed against {@link TmdbEntry},
 * so a new field needs an entry here, and the field-coverage test checks
 * every entry against the fixtures.
 */
export const TMDB_ENTRY_SOURCES = {
	title: { movie: "title", tv: "name" },
	originalTitle: { movie: "original_title", tv: "original_name" },
	year: { movie: "release_date (year part)", tv: "first_air_date (year part)" },
	description: { movie: "overview", tv: "overview" },
	genres: { movie: "genres[].name", tv: "genres[].name" },
	imdbId: { movie: "imdb_id", tv: "external_ids: imdb_id" },
	posterPath: { movie: "poster_path", tv: "poster_path" },
} as const satisfies Record<keyof TmdbEntry, Record<TmdbKind, string>>;

type JsonObject = Record<string, unknown>;

function asObject(value: unknown, what: string): JsonObject {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new EntryError(`TMDB sent an unexpected answer for ${what}.`);
	}
	return value as JsonObject;
}

function text(object: JsonObject, key: string): string {
	const value = object[key];
	return typeof value === "string" ? value.trim() : "";
}

function orNull(value: string): string | null {
	return value === "" ? null : value;
}

/** The year part of an ISO date; an empty or malformed date gives null. */
function yearOf(date: string): number | null {
	const year = /^(\d{4})-/.exec(date)?.[1];
	return year ? Number(year) : null;
}

function genreNames(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const names = value
		.map((genre) =>
			typeof genre === "object" && genre !== null ? text(genre as JsonObject, "name") : "",
		)
		.filter((name) => name !== "");
	return [...new Set(names)];
}

/**
 * Maps a `/movie/{id}` or `/tv/{id}` response. A series' `imdbId` is null
 * here; it comes from {@link readImdbId} over `external_ids`.
 */
export function readDetails(json: unknown, kind: TmdbKind, what: string): TmdbEntry {
	const details = asObject(json, what);
	const movie = kind === "movie";
	return {
		title: text(details, movie ? "title" : "name"),
		originalTitle: text(details, movie ? "original_title" : "original_name"),
		year: yearOf(text(details, movie ? "release_date" : "first_air_date")),
		description: text(details, "overview"),
		genres: genreNames(details.genres),
		imdbId: movie ? orNull(text(details, "imdb_id")) : null,
		posterPath: orNull(text(details, "poster_path")),
	};
}

/** `imdb_id` from an `external_ids` response. */
export function readImdbId(json: unknown, what: string): string | null {
	return orNull(text(asObject(json, what), "imdb_id"));
}

/**
 * TMDB does not fall back to another language on its own: an entry
 * without a translation comes back without overview or poster. Those two
 * trigger a second request without `language`.
 */
export function needsFallback(entry: TmdbEntry): boolean {
	return entry.description === "" || entry.posterPath === null;
}

const isEmpty = (value: TmdbEntry[keyof TmdbEntry]) =>
	value === null || value === "" || (Array.isArray(value) && value.length === 0);

/**
 * Fills only the fields that came back empty; localised values already
 * obtained are kept. Returns the entry and the names of the filled fields.
 */
export function fillMissing(
	entry: TmdbEntry,
	fallback: TmdbEntry,
): { entry: TmdbEntry; filled: (keyof TmdbEntry)[] } {
	const merged: TmdbEntry = { ...entry };
	const filled: (keyof TmdbEntry)[] = [];
	for (const key of Object.keys(TMDB_ENTRY_SOURCES) as (keyof TmdbEntry)[]) {
		if (isEmpty(entry[key]) && !isEmpty(fallback[key])) {
			(merged as unknown as Record<string, unknown>)[key] = fallback[key];
			filled.push(key);
		}
	}
	return { entry: merged, filled };
}
