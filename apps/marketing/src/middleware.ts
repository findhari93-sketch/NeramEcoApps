import createMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './i18n';

export default createMiddleware({
  // A list of all locales that are supported
  locales,

  // Used when no locale matches
  defaultLocale,

  // Only prefix non-default locales (en has no prefix, ta/hi/kn/ml do)
  localePrefix: 'as-needed',

  // No `Link: rel=alternate` response header. It listed all 5 locale copies of
  // every URL, sending crawlers to copies that 301 or are noindexed. hreflang
  // comes from page metadata instead (buildAlternates in lib/seo/metadata.ts),
  // which only lists the locales a page is actually indexable in.
  alternateLinks: false,
});

export const config = {
  // Match only internationalized pathnames
  // Excludes: api, sso, signout, thank-you, college-dashboard (college admin portal),
  // unsubscribe (public, non-localized outreach opt-out), s (the student detail link,
  // kept short and locale-free because it is pasted raw into WhatsApp), d (the demo
  // join link behind WhatsApp buttons, same reason), Next.js internals, and anything
  // with a file extension.
  matcher: [
    '/',
    '/(en|ta|hi|kn|ml)/:path*',
    '/((?!api|sso|signout|thank-you|college-dashboard|unsubscribe|s/|d/|_next|_vercel|.*\\..*).*)',
  ],
};
