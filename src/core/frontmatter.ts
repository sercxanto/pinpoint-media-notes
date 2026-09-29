// Frontmatter is built as a plain string rather than with a YAML library, to
// keep exact control over key order, over which values are numbers, and over
// intentionally blank properties.

/**
 * - `null` or `""`: blank property (`key:`)
 * - `number`: written unquoted, so Obsidian types the property as a number
 * - `string`: a scalar, quoted only when YAML would misread it
 * - `string[]`: a block sequence, or `[]` when empty
 */
export type FrontmatterValue = string | number | null | readonly string[];

export type FrontmatterEntries = readonly (readonly [key: string, value: FrontmatterValue])[];

/** Characters that start a YAML indicator when they lead a plain scalar. */
const LEADING_INDICATOR = /^[-?:,[\]{}&*!|>'"%@`#]/;

/** Plain scalars YAML 1.1 or 1.2 would read as a boolean or null. */
const RESERVED = /^(?:true|false|null|yes|no|on|off|y|n|~)$/i;

/** Plain scalars YAML would read as a number (int, float, hex, octal, inf, nan). */
const NUMBER_LIKE =
	/^(?:[-+]?(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][-+]?\d+)?|0x[\da-fA-F_]+|0o[0-7_]+|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/;

/** Plain scalars YAML 1.1 would read as a date or timestamp. */
const DATE_LIKE = /^\d{4}-\d{1,2}-\d{1,2}/;

/** Collapses line breaks, so every scalar stays on one line. */
function singleLine(value: string): string {
	return value.replace(/\s*[\r\n]+\s*/g, " ");
}

function needsQuotes(value: string): boolean {
	return (
		value.includes('"') ||
		value.includes(": ") ||
		value.includes(" #") ||
		value.includes("\t") ||
		value.endsWith(":") ||
		value !== value.trim() ||
		LEADING_INDICATOR.test(value) ||
		RESERVED.test(value) ||
		NUMBER_LIKE.test(value) ||
		DATE_LIKE.test(value)
	);
}

/** Formats one string as a YAML scalar, double-quoted when needed. */
export function yamlScalar(raw: string): string {
	const value = singleLine(raw);
	if (!needsQuotes(value)) return value;
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function formatEntry(key: string, value: FrontmatterValue): string {
	if (value === null || value === "") return `${key}:`;
	if (typeof value === "number") return `${key}: ${value}`;
	if (typeof value === "string") return `${key}: ${yamlScalar(value)}`;
	if (value.length === 0) return `${key}: []`;
	return [`${key}:`, ...value.map((item) => `  - ${yamlScalar(item)}`)].join("\n");
}

/** Builds the frontmatter block, keys in the given order, with the closing `---`. */
export function buildFrontmatter(entries: FrontmatterEntries): string {
	const lines = entries.map(([key, value]) => formatEntry(key, value));
	return ["---", ...lines, "---", ""].join("\n");
}

/** A complete note: frontmatter followed by an empty `## Notes` section. */
export function buildNote(entries: FrontmatterEntries): string {
	return `${buildFrontmatter(entries)}\n## Notes\n`;
}
