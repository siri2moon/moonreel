import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, resolveLocale } from "@/i18n/config";

// URLs stay locale-free (/projects/123); the proxy rewrites them to app/[lang]
// using the saved choice or the browser's Accept-Language, falling back to English.
export function proxy(request: NextRequest) {
  const locale = resolveLocale(
    request.cookies.get(LOCALE_COOKIE)?.value,
    request.headers.get("accept-language"),
  );
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Skip API routes, Next internals and files with an extension (icon.svg, images…).
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
