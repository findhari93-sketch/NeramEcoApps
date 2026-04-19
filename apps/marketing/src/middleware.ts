import createMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './i18n';

export default createMiddleware({
  // A list of all locales that are supported
  locales,

  // Used when no locale matches
  defaultLocale,

  // Only prefix non-default locales (en has no prefix, ta/hi/kn/ml do)
  localePrefix: 'as-needed',
});

export const config = {
  // Match only internationalized pathnames
  // Excludes: api, sso, signout, thank-you, admin (staff tools), college-dashboard,
  // Next.js internals, and anything with a file extension.
  matcher: [
    '/',
    '/(en|ta|hi|kn|ml)/:path*',
    '/((?!api|sso|signout|thank-you|admin|college-dashboard|_next|_vercel|.*\\..*).*)',
  ],
};
