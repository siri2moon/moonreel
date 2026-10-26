// Shared by the worker (writes scenes.error) and the editor (explains it), so no server-only imports here.

/** Prefix stored in `scenes.error` when Muse answered with text instead of media, usually a content filter. */
export const REFUSED_PREFIX = "[refused] ";

export const isRefusal = (error: string | null | undefined): error is string =>
  !!error?.startsWith(REFUSED_PREFIX);

/** Muse's own explanation, without the prefix. */
export const refusalReply = (error: string) => error.slice(REFUSED_PREFIX.length).trim();
