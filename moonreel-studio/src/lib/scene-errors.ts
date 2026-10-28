// Shared by the worker (writes scenes.error) and the editor (explains it), so no server-only imports here.

/** Prefix stored in `scenes.error` when Muse answered with text instead of media, usually a content filter. */
export const REFUSED_PREFIX = "[refused] ";

export const isRefusal = (error: string | null | undefined): error is string =>
  !!error?.startsWith(REFUSED_PREFIX);

/** Muse's own explanation, without the prefix. */
export const refusalReply = (error: string) => error.slice(REFUSED_PREFIX.length).trim();

/** Stored in `scenes.error` for scenes stopped with "Pause production"; Retry continues them. */
export const PAUSED_ERROR = "[paused]";

/** Stored for scenes the worker paused itself after several clips in a row failed. */
export const AUTO_PAUSED_ERROR = "[paused:video-failures]";

export const isPaused = (error: string | null | undefined) =>
  error === PAUSED_ERROR || error === AUTO_PAUSED_ERROR;

/** Prefix for a Muse account that is not allowed to make videos (HTTP 403, region restriction). */
export const BLOCKED_PREFIX = "[blocked] ";

export const isBlocked = (error: string | null | undefined): error is string => !!error?.startsWith(BLOCKED_PREFIX);

export const blockedReply = (error: string) => error.slice(BLOCKED_PREFIX.length).trim();

// Muse answers in English or Chinese: "403", "region restriction", "地区限制", "not available in your country".
const REGION_BLOCK =
  /\b403\b|地区限制|地區限制|区域限制|region(al)?[ -]?(restrict|lock|block)|not (yet )?available in your (region|country|location)/i;

/** Muse's text says the account may not make videos where it is, rather than declining the content. */
export const isRegionBlock = (reply: string) => REGION_BLOCK.test(reply);
