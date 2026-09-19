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
  // Excludes: api, sso, signout, thank-you, college-dashboard (college admin portal),
  // unsubscribe (public, non-localized outreach opt-out), s (the student detail link,
  // kept short and locale-free because it is pasted raw into WhatsApp), Next.js
  // internals, and anything with a file extension.
  matcher: [
    '/',
    '/(en|ta|hi|kn|ml)/:path*',
    '/((?!api|sso|signout|thank-you|college-dashboard|unsubscribe|s/|_next|_vercel|.*\\..*).*)',
  ],
};
