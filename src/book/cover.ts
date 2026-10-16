import { BOOK_HOST_HEADERS, type HttpGet, type HttpResponse } from "../io/http";

// Cover downloads, judged the same way for every cover host (MVB through the
// DNB portal, Open Library).

/**
 * `missing`: the server has no usable cover for this ISBN, another edition's
 * may do. `blocked`: the server did not serve covers at all (bot check,
 * error, unreachable); asking again for another ISBN would get the same.
 */
export type CoverResult =
	| { ok: true; data: ArrayBuffer; extension: string }
	| { ok: false; failure: "missing" | "blocked"; reason: string };

/**
 * Downloads one cover. A bot filter answers challenged requests with HTTP 200
 * and an HTML page, so only an `image/*` Content-Type counts as a cover,
 * whatever the status.
 */
export async function downloadCover(
	http: HttpGet,
	url: string,
	isbn13: string,
): Promise<CoverResult> {
	let response: HttpResponse;
	try {
		response = await http(url, BOOK_HOST_HEADERS);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return {
			ok: false,
			failure: "blocked",
			reason: `the cover server could not be reached (${reason})`,
		};
	}
	const contentType =
		(response.header("Content-Type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
	if (contentType.startsWith("image/")) {
		const extension = IMAGE_TYPES[contentType];
		if (extension === undefined) {
			return {
				ok: false,
				failure: "missing",
				reason: `the cover server sent an unsupported image type, ${contentType}`,
			};
		}
		return { ok: true, data: response.arrayBuffer(), extension };
	}
	if (response.status === 404) {
		return {
			ok: false,
			failure: "missing",
			reason: `the cover server has no cover for ISBN ${isbn13}`,
		};
	}
	if (response.status === 200 && contentType === "text/html") {
		return {
			ok: false,
			failure: "blocked",
			reason: "the cover server answered with text/html instead of an image, probably its bot check",
		};
	}
	return {
		ok: false,
		failure: "blocked",
		reason: `the cover server answered with HTTP ${response.status} and ${contentType || "no content type"} instead of an image`,
	};
}

/** Image types accepted as covers, by Content-Type, with their file extension. */
const IMAGE_TYPES: Partial<Record<string, string>> = {
	"image/jpeg": "jpg",
	"image/pjpeg": "jpg",
	"image/png": "png",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/avif": "avif",
};

/**
 * Extensions an existing cover may have. The extension comes from the
 * response, so an existing file is looked for under each of them before any
 * download.
 */
export const COVER_EXTENSIONS = [...new Set(Object.values(IMAGE_TYPES))].filter(
	(extension) => extension !== undefined,
);
