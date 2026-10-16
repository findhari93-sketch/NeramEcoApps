/**
 * Which surface the Site Header sits on. Pages that open with a light
 * DocHeader (T2 guide articles, T4 colleges, T5 counselling, legal, ticket
 * tracking) get the white header with a 1px line; every page that opens with a
 * dark PageHero keeps the navy header.
 */

export type HeaderTone = 'dark' | 'light';

const LIGHT_ROUTES: RegExp[] = [
  /^\/colleges(\/|$)/, // T4 college directory and profiles
  /^\/(nata|aat|pgeta)-2026\/.+/, // T2 exam guide spokes (the hub index stays dark)
  /^\/counseling\/.+/, // T5 counselling pages and concept articles (the /counseling hub stays dark)
  /^\/blog\/.+/, // T2 blog posts
  /^\/(terms|privacy|refund-policy)$/, // T9 legal
  /^\/support\/track(\/|$)/,
];

export function getHeaderTone(pathname: string): HeaderTone {
  const path = pathname.replace(/^\/(en|ta|hi|kn|ml)(?=\/|$)/, '') || '/';
  return LIGHT_ROUTES.some((re) => re.test(path)) ? 'light' : 'dark';
}
