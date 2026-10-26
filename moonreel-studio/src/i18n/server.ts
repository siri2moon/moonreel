import { lang } from "next/root-params";
import { DEFAULT_LOCALE, hasLocale, type Locale } from "./config";
import { dictionaries } from "./dictionaries";

/** Locale of the current route (`app/[lang]`), for Server Components. */
export async function getLocale(): Promise<Locale> {
  const value = await lang();
  return hasLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getDictionary() {
  return dictionaries[await getLocale()];
}
