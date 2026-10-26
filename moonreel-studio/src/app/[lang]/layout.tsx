import type { Metadata } from "next";
import { Be_Vietnam_Pro, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { HealthBadge } from "@/components/health-badge";
import { Wordmark } from "@/components/logo";
import { NavLinks } from "@/components/nav-links";
import { NicheSwitcher } from "@/components/niche-switcher";
import { Sky } from "@/components/sky";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Skeleton } from "@/components/ui";
import { LOCALES } from "@/i18n/config";
import { LocaleProvider } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import "../globals.css";

const body = Be_Vietnam_Pro({
  variable: "--font-body",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return {
    title: { default: "MoonReel", template: "%s · MoonReel" },
    description: t.meta.description,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const [locale, t] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <html lang={locale} className={`${body.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <LocaleProvider locale={locale}>
        <Sky />
        <aside className="fixed inset-y-3 left-3 z-20 hidden w-[17rem] flex-col gap-6 rounded-[28px] bg-[linear-gradient(180deg,rgb(255_240_214/0.06),rgb(255_240_214/0.015))] px-4 py-6 shadow-[inset_0_1px_0_rgb(255_246_226/0.1),inset_0_0_0_1px_rgb(255_232_196/0.08),0_30px_80px_-30px_rgb(0_0_0/0.9)] backdrop-blur-2xl lg:flex">
          <Link href="/" className="px-2">
            <Wordmark />
          </Link>
          <Suspense fallback={<Skeleton className="h-[118px]" />}>
            <NicheSwitcher />
          </Suspense>
          <NavLinks />
          <div className="mt-auto flex flex-col gap-3">
            <HealthBadge />
            <div className="flex items-center justify-between gap-2 px-1">
              <p className="text-[11px] text-subtle">{t.sidebar.poweredBy}</p>
              <LanguageSwitcher />
            </div>
          </div>
        </aside>

        <header className="sticky top-0 z-20 bg-[rgb(4_4_10/0.6)] shadow-[inset_0_-1px_0_rgb(255_232_196/0.08)] backdrop-blur-2xl lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <Link href="/">
              <Wordmark />
            </Link>
            <div className="flex items-center gap-2">
              <Suspense fallback={null}>
                <NicheSwitcher compact />
              </Suspense>
              <LanguageSwitcher />
            </div>
          </div>
          <div className="px-3 pb-2">
            <NavLinks orientation="horizontal" />
          </div>
        </header>

        <div className="lg:pl-[18.75rem]">
          <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-10">{children}</main>
        </div>
        </LocaleProvider>
      </body>
    </html>
  );
}
