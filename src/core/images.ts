// The image types saved into the vault, for book covers and TMDB posters
// alike. Anything else (SVG among them) is not written, whatever the server
// calls it.

/** Image types accepted, by Content-Type, with their file extension. */
const IMAGE_TYPES: Partial<Record<string, string>> = {
	"image/jpeg": "jpg",
	"image/pjpeg": "jpg",
	"image/png": "png",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/avif": "avif",
};

/** The file extension for an accepted Content-Type (without parameters), or undefined. */
export function imageExtension(contentType: string): string | undefined {
	return IMAGE_TYPES[contentType];
}

/** The extensions an image file of the plugin may have. */
export const IMAGE_EXTENSIONS: readonly string[] = [...new Set(Object.values(IMAGE_TYPES))].filter(
	(extension) => extension !== undefined,
);
