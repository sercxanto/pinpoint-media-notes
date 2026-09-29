import { nfc } from "../core/text";

export const BLURB_LIMIT = 500;

/** Elements that separate words; inline elements like `<i>` do not. */
const BREAKING = "br, p, div, li, ul, ol, h1, h2, h3, h4, h5, h6, tr, td, th, blockquote";

/** The blurb page's text: tags stripped, entities decoded, whitespace collapsed. */
export function blurbText(html: string): string {
	const doc = new DOMParser().parseFromString(html, "text/html");
	doc.querySelectorAll("script, style, head").forEach((element) => element.remove());
	doc.querySelectorAll(BREAKING).forEach((element) => {
		element.before(" ");
		element.after(" ");
	});
	return nfc(doc.body?.textContent ?? "")
		.replace(/\s+/g, " ")
		.trim();
}

/** A sentence ends in `.`, `!`, `?` or `…`, maybe followed by closing quotes, then whitespace. */
const SENTENCE_END = /[.!?…]+["'»«“”’)\]]*(?=\s|$)/g;

/**
 * Keeps whole sentences while the result stays under `limit` characters. If
 * even the first sentence is too long, cuts at the last word boundary and
 * appends `…`.
 */
export function truncateBlurb(text: string, limit = BLURB_LIMIT): string {
	if (text.length < limit) return text;

	let end = 0;
	for (const match of text.matchAll(SENTENCE_END)) {
		const candidate = match.index + match[0].length;
		if (candidate >= limit) break;
		end = candidate;
	}
	if (end > 0) return text.slice(0, end);

	const head = text.slice(0, limit - 1);
	const space = head.lastIndexOf(" ");
	const cut = space > 0 ? head.slice(0, space) : head.slice(0, limit - 2);
	return `${cut.replace(/[\s,;:–-]+$/, "")}…`;
}
