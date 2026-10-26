"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/app/actions";
import { LOCALES } from "@/i18n/config";
import { useI18n } from "@/i18n/client";

/** EN / VI toggle. The choice is saved in a cookie and overrides the browser language. */
export function LanguageSwitcher() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="group"
      aria-label={t.language.label}
      className={`frost flex shrink-0 rounded-full p-0.5 text-[11px] font-semibold transition ${pending ? "opacity-60" : ""}`}
    >
      {LOCALES.map((code) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            lang={code}
            title={t.language.names[code]}
            aria-pressed={active}
            disabled={pending}
            onClick={() =>
              !active &&
              startTransition(async () => {
                await setLocale(code);
                router.refresh();
              })
            }
            className={`rounded-full px-2.5 py-1 uppercase transition ${
              active ? "bg-gold text-[#21180a] shadow-[inset_0_1px_0_rgb(255_255_255/0.5)]" : "text-muted hover:text-gold-light"
            }`}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}
