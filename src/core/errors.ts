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
