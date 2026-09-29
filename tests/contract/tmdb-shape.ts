import type { TmdbEntry } from "../../src/tmdb/entry";

const nonEmpty = (value: unknown) => typeof value === "string" && value !== "";
const orNull = (check: (value: unknown) => boolean) => (value: unknown) =>
	value === null || check(value);

/**
 * The shape each mapped field must have on a live entry. Typed against
 * {@link TmdbEntry}, so a new field needs an entry; the offline
 * field-coverage test checks the keys as well.
 */
export const TMDB_ENTRY_SHAPE = {
	title: nonEmpty,
	// Present on every real entry; may be blank only on a hand-built one.
	originalTitle: (value) => typeof value === "string",
	year: orNull((value) => Number.isInteger(value) && (value as number) > 1850),
	description: (value) => typeof value === "string",
	genres: (value) =>
		Array.isArray(value) && value.every((name) => typeof name === "string" && name !== ""),
	imdbId: orNull((value) => typeof value === "string" && /^tt\d+$/.test(value)),
	posterPath: orNull((value) => typeof value === "string" && /^\/[\w-]+\.[a-z]+$/i.test(value)),
} as const satisfies Record<keyof TmdbEntry, (value: unknown) => boolean>;

/** Names of the fields whose value does not have the expected shape. */
export function shapeMismatches(entry: TmdbEntry): string[] {
	return (Object.keys(TMDB_ENTRY_SHAPE) as (keyof TmdbEntry)[]).filter(
		(key) => !TMDB_ENTRY_SHAPE[key](entry[key]),
	);
}
