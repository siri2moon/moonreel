import { Muse2ApiProvider } from "./muse2api";

let provider: Muse2ApiProvider | undefined;

/** The active generation backend. Swap the implementation here to change providers. */
export function getProvider() {
  provider ??= new Muse2ApiProvider();
  return provider;
}

export type { GenerationProvider } from "./types";
