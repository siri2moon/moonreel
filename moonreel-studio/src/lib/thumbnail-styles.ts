/**
 * Thumbnail templates. A niche picks one, plus an accent colour and a brand label, so every
 * video of a channel shares one recognisable look. Rendering lives in pipeline/thumbnail.ts;
 * this list is kept apart so forms can import it without the image libraries.
 */
export const THUMBNAIL_STYLES = ["impact", "cinematic", "boxed"] as const;
export type ThumbnailStyle = (typeof THUMBNAIL_STYLES)[number];
