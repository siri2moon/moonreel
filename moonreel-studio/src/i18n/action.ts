import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, resolveLocale } from "./config";
import { dictionaries } from "./dictionaries";

/**
 * Server Actions cannot read root params, so they negotiate the locale the same way the proxy does.
 */
export async function getActionDictionary() {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  return dictionaries[resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerList.get("accept-language"))];
}
