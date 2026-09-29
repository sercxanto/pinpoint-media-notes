import { ConfigError, EntryError } from "../core/errors";
import { requireVaultFolder } from "../core/paths";
import type { HttpGet } from "../io/http";
import type { VaultFiles } from "../io/vault";
import type { PinpointSettings } from "../settings";
import { detailsUrl, externalIdsUrl, fetchPoster, getJson } from "./api";
import { fillMissing, needsFallback, readDetails, readImdbId, type TmdbEntry } from "./entry";
import { parseTmdbInput, type TmdbRef } from "./input";
import { tmdbNote, tmdbStem } from "./note";

export interface TmdbImportConfig {
	/** Never put it into a message. */
	token: string;
	language: string;
	posterSize: string;
	notesDir: string;
	assetsDir: string;
}

const TOKEN_SETTING = "TMDB read access token";

/** Checks the settings before any work; throws a ConfigError naming the setting. */
export function tmdbImportConfig(settings: PinpointSettings): TmdbImportConfig {
	const token = settings.tmdbToken.trim();
	if (token === "") throw new ConfigError(`Setting "${TOKEN_SETTING}": No token set.`);
	// The API key sits next to the token in TMDB's account settings and is
	// easily copied instead; it does not work as a bearer token.
	if (/^[\da-f]{32}$/i.test(token)) {
		throw new ConfigError(
			`Setting "${TOKEN_SETTING}": This looks like the short API key. Use the long API read access token shown next to it.`,
		);
	}
	const language = settings.tmdbLanguage.trim();
	if (language === "") throw new ConfigError('Setting "Language": No language set.');
	const posterSize = settings.posterSize.trim();
	if (!/^(?:w\d+|original)$/.test(posterSize)) {
		throw new ConfigError(`Setting "Poster size": "${posterSize}" is not a TMDB image size.`);
	}
	return {
		token,
		language,
		posterSize,
		notesDir: requireVaultFolder("Movie and series notes folder", settings.tmdbNotesDir),
		assetsDir: requireVaultFolder("Image folder", settings.assetsDir),
	};
}

export interface TmdbImportDeps {
	http: HttpGet;
	files: VaultFiles;
	config: TmdbImportConfig;
}

export interface TmdbImportResult {
	notePath: string;
	/** Vault path of the poster, or null if the note has none. */
	coverPath: string | null;
	/** One-line report for the user. */
	message: string;
}

/**
 * Imports one entry, in the fixed order: parse, fetch the details (and the
 * untranslated details if overview or poster are missing), name and check
 * for a collision, fetch a series' IMDb id, get the poster (or reuse an
 * existing file), write the note last. Per-entry problems throw an
 * EntryError, a rejected token a ConfigError.
 */
export async function importTmdb(input: string, deps: TmdbImportDeps): Promise<TmdbImportResult> {
	const { http, files, config } = deps;
	const report: string[] = [];

	const ref = parseTmdbInput(input);
	const what = `${ref.kind === "movie" ? "movie" : "series"} ${ref.id}`;
	const details = await getJson(http, detailsUrl(ref, config.language), config.token, what);
	let entry = readDetails(details, ref.kind, what);

	if (needsFallback(entry)) {
		const fallback = await fetchFallback(deps, ref, what);
		if (fallback.ok) {
			const merged = fillMissing(entry, fallback.entry);
			entry = merged.entry;
			if (merged.filled.length > 0) {
				report.push(
					`No ${config.language} translation for ${merged.filled.map(describeField).join(", ")}; took TMDB's default language.`,
				);
			}
		} else {
			report.push(`Could not ask for the untranslated details: ${fallback.reason}`);
		}
	}
	if (entry.title === "") throw new EntryError(`TMDB has no title for ${what}.`);

	const stem = tmdbStem(entry);
	const notePath = `${config.notesDir}/${stem}.md`;
	if (await files.exists(notePath)) {
		throw new EntryError(`Skipped: "${notePath}" already exists.`);
	}

	if (ref.kind === "tv") {
		const ids = await getJson(
			http,
			externalIdsUrl(ref),
			config.token,
			`external IDs of ${what}`,
		);
		entry = { ...entry, imdbId: readImdbId(ids, `external IDs of ${what}`) };
	}

	const poster = await providePoster(deps, entry, stem);
	report.push(poster.message);

	try {
		await files.ensureFolder(config.notesDir);
		await files.createNote(notePath, tmdbNote(ref, entry, poster.path));
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new EntryError(`Could not create "${notePath}": ${reason}`);
	}

	return {
		notePath,
		coverPath: poster.path,
		message: [`Created "${notePath}".`, ...report].join(" "),
	};
}

type Fallback = { ok: true; entry: TmdbEntry } | { ok: false; reason: string };

/**
 * The details without `language`. It only fills gaps, so a failure is
 * reported and the note written with what the first answer had; a
 * rejected token still stops the import.
 */
async function fetchFallback(deps: TmdbImportDeps, ref: TmdbRef, what: string): Promise<Fallback> {
	try {
		const json = await getJson(deps.http, detailsUrl(ref, null), deps.config.token, what);
		return { ok: true, entry: readDetails(json, ref.kind, what) };
	} catch (error) {
		if (!(error instanceof EntryError)) throw error;
		return { ok: false, reason: error.message };
	}
}

function describeField(key: keyof TmdbEntry): string {
	switch (key) {
		case "posterPath":
			return "poster";
		case "originalTitle":
			return "original title";
		case "imdbId":
			return "IMDb id";
		default:
			return key;
	}
}

/** A path as TMDB delivers it: one file name with an extension, nothing to escape. */
const POSTER_PATH = /^\/[\w-]+\.([a-z\d]+)$/i;

interface PosterOutcome {
	path: string | null;
	message: string;
}

/**
 * Reuses an existing image of the target name; otherwise downloads the
 * poster, named like the note, with the extension of TMDB's file.
 */
async function providePoster(
	deps: TmdbImportDeps,
	entry: TmdbEntry,
	stem: string,
): Promise<PosterOutcome> {
	const { http, files, config } = deps;
	if (entry.posterPath === null) {
		return { path: null, message: "No poster: TMDB has none for this entry." };
	}
	const extension = POSTER_PATH.exec(entry.posterPath)?.[1]?.toLowerCase();
	if (extension === undefined) {
		return {
			path: null,
			message: `No poster: TMDB's poster path "${entry.posterPath}" is not a plain file name.`,
		};
	}

	const path = `${config.assetsDir}/${stem}.${extension}`;
	if (await files.exists(path)) {
		return { path, message: `Kept the existing poster "${path}".` };
	}

	const poster = await fetchPoster(http, config.posterSize, entry.posterPath);
	if (!poster.ok) return { path: null, message: `No poster: ${poster.reason}.` };

	try {
		await files.ensureFolder(config.assetsDir);
		await files.createBinary(path, poster.data);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new EntryError(`Could not save the poster "${path}": ${reason}`);
	}
	return { path, message: "Poster saved." };
}
