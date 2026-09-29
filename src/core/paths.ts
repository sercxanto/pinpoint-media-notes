import { ConfigError } from "./errors";

export type FolderCheck = { ok: true; path: string } | { ok: false; reason: string };

/**
 * Checks a folder setting and normalises it: backslashes become slashes,
 * `.` segments, doubled and trailing slashes are dropped. The folder must be
 * vault-relative, because it is used both as a vault path and inside the
 * `cover` wikilink.
 */
export function checkVaultFolder(raw: string): FolderCheck {
	const value = raw.trim().replace(/\\/g, "/");
	if (value === "") return { ok: false, reason: "No folder set." };
	if (value.startsWith("/") || value.startsWith("~") || /^[a-zA-Z]:/.test(value)) {
		return { ok: false, reason: "Use a folder inside the vault, not an absolute path." };
	}
	const segments = value.split("/").filter((segment) => segment !== "" && segment !== ".");
	if (segments.includes("..")) {
		return { ok: false, reason: 'The folder must not contain "..".' };
	}
	if (segments.length === 0) {
		return { ok: false, reason: "Use a folder inside the vault, not the vault root." };
	}
	return { ok: true, path: segments.join("/") };
}

/**
 * For the settings tab: an empty field is allowed while editing (an importer
 * may be unused), anything else must pass {@link checkVaultFolder}.
 */
export function validateFolderInput(raw: string): string | undefined {
	if (raw.trim() === "") return undefined;
	const check = checkVaultFolder(raw);
	return check.ok ? undefined : check.reason;
}

/** Before an import: returns the normalised folder or throws a ConfigError naming the setting. */
export function requireVaultFolder(settingName: string, raw: string): string {
	const check = checkVaultFolder(raw);
	if (!check.ok) throw new ConfigError(`Setting "${settingName}": ${check.reason}`);
	return check.path;
}
