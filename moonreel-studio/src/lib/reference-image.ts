/** Place reference photos. Kept free of Node imports so client code can use it. */
export const REFERENCE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"] as const;

export const REFERENCE_MAX_BYTES = 25 * 1024 ** 2;

/** Storage key of an uploaded reference photo, as returned by POST /api/uploads/image. */
export const REFERENCE_KEY = /^uploads\/images\/[0-9a-f-]{36}\.jpg$/;
