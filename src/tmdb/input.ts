import { EntryError } from "../core/errors";

/** TMDB's own path segment: `movie` for movies, `tv` for series. */
export type TmdbKind = "movie" | "tv";

/** One TMDB entry, as named in its URL. */
export interface TmdbRef {
	kind: TmdbKind;
	id: string;
}

/** `themoviedb.org/movie/<id>` anywhere in the input; a slug or more path may follow. */
const TMDB_LINK = /themoviedb\.org\/(movie|tv)\/(\d+)(?!\d)/i;

/** A bare `movie/<id>` or `tv/<id>`, with the same tails a link may have. */
const BARE_PATH = /^\/?(movie|tv)\/(\d+)(?:[-/?#].*)?$/i;

/**
 * Reads a TMDB link or a bare `movie/<id>` / `tv/<id>`. A bare number is
 * refused: it does not say whether a movie or a series is meant.
 */
export function parseTmdbInput(raw: string): TmdbRef {
	const input = raw.trim();
	const match = TMDB_LINK.exec(input) ?? BARE_PATH.exec(input);
	if (match?.[1] && match[2]) {
		return { kind: match[1].toLowerCase() as TmdbKind, id: match[2] };
	}
	if (/^\d+$/.test(input)) {
		throw new EntryError(
			`"${input}" is a bare number, which does not say whether a movie or a series is meant. Paste the TMDB link, or use movie/${input} or tv/${input}.`,
		);
	}
	throw new EntryError(
		`"${input}" is not a TMDB movie or series link (themoviedb.org/movie/<id> or themoviedb.org/tv/<id>).`,
	);
}

/** `url` in the note: rebuilt from the id, never the pasted link with its slug and query. */
export function canonicalUrl(ref: TmdbRef): string {
	return `https://www.themoviedb.org/${ref.kind}/${ref.id}`;
}
