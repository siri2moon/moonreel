/** Soundtrack uploads for ambient niches. Kept free of Node imports so client code can use it. */
export const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac"] as const;

export const AUDIO_MAX_BYTES = 1024 ** 3;

/** Storage key of an uploaded soundtrack, as returned by POST /api/uploads/audio. */
export const SOUNDTRACK_KEY = /^uploads\/audio\/[0-9a-f-]{36}\.(mp3|m4a|aac|wav|ogg|flac)$/;
