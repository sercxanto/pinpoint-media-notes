import { buildNote } from "../core/frontmatter";
import { noteStem } from "../core/text";
import type { TmdbEntry } from "./entry";
import { canonicalUrl, type TmdbRef } from "./input";

/** Base name of the note and its poster: `<title> (<year>)`, the localised title. */
export function tmdbStem(entry: TmdbEntry): string {
	return noteStem(entry.title, entry.year);
}

/**
 * The complete note. `cover` is the vault-relative poster path, or null.
 * Property order is a golden format, see the spec.
 */
export function tmdbNote(ref: TmdbRef, entry: TmdbEntry, cover: string | null): string {
	return buildNote([
		["template", "[[Movie Template]]"],
		["type", ref.kind === "movie" ? "movie" : "series"],
		["title", entry.title],
		["original_title", entry.originalTitle],
		["url", canonicalUrl(ref)],
		["imdb_id", entry.imdbId],
		["year", entry.year],
		["genres", entry.genres],
		["description", entry.description],
		["cover", cover === null ? null : `[[${cover}]]`],
		["rating", null],
		["last_finished", null],
		["shelf", "unsorted"],
		["tags", ["movies"]],
	]);
}
