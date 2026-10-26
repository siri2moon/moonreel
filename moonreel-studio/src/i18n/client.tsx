"use client";

import { createContext, use, type ReactNode } from "react";
import type { Locale } from "./config";
import { dictionaries } from "./dictionaries";

const LocaleContext = createContext<Locale>("en");

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

/** Locale and dictionary for Client Components rendered under the root layout. */
export function useI18n() {
  const locale = use(LocaleContext);
  return { locale, t: dictionaries[locale] };
}
