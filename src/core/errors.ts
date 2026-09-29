/**
 * A configuration problem: nothing can be imported until the user fixes a
 * setting. The message names what is missing or wrong. Never put the TMDB
 * token into a message.
 */
export class ConfigError extends Error {
	override name = "ConfigError";
}

/**
 * A problem with one entry only (bad input, no record, name collision, failed
 * request). It is reported and the user continues with the next entry.
 */
export class EntryError extends Error {
	override name = "EntryError";
}

/** The message shown to the user; anything unexpected is marked as such. */
export function errorMessage(error: unknown): string {
	if (error instanceof ConfigError || error instanceof EntryError) return error.message;
	const detail = error instanceof Error ? error.message : String(error);
	return `Unexpected error: ${detail}`;
}
