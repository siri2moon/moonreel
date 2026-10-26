import type { Locale } from "../config";
import en, { type Dictionary } from "./en";
import vi from "./vi";

// Both dictionaries are small, so they are bundled statically and shared by server and client code.
export const dictionaries: Record<Locale, Dictionary> = { en, vi };
export type { Dictionary };
