import NextAuth from "next-auth";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { routing } from "@/i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);
const { auth } = NextAuth(authConfig);

const LOCALE_PATTERN = new RegExp(`^/(${routing.locales.join("|")})(?=/|$)`);

export default auth((request) => {
  const { pathname } = request.nextUrl;

  const localeMatch = pathname.match(LOCALE_PATTERN);
  const locale = localeMatch?.[1] ?? routing.defaultLocale;
  const path = localeMatch ? pathname.slice(localeMatch[0].length) || "/" : pathname;

  const user = request.auth?.user;
  const isProtected = /^\/(dashboard|account|admin)(\/|$)/.test(path);
  const isAdminArea = /^\/admin(\/|$)/.test(path);
  const isAuthPage = /^\/(login|register)(\/|$)/.test(path);

  if (isProtected && !user) {
    const url = new URL(`/${locale}/login`, request.url);
    url.searchParams.set("callbackUrl", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (isAdminArea && user?.role !== "ADMIN") {
    return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
  }

  if (isAuthPage && user) {
    return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
  }

  return intlMiddleware(request);
});

export const config = {
  // Skip API routes, Next internals and any file with an extension.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
