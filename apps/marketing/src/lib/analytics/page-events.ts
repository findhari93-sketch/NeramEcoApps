/**
 * Which first-party page-view event (if any) a marketing path fires.
 * Pure: unit tested in page-events.test.ts. Used by PageViewBeacon.
 *
 *   /                      landing_page_viewed
 *   /courses, /coaching... course_page_viewed (course and coaching landing pages)
 *   /tools, /tools/<tool>  tool_page_viewed
 */

import type { TaxonomyEvent } from '@neram/database/analytics';

const NON_DEFAULT_LOCALES = ['ta', 'hi', 'kn', 'ml'];

/** Course and coaching landing pages, by first path segment. */
const COURSE_SECTIONS = [
  'courses',
  'coaching',
  'nata-coaching',
  'nata-online-coaching',
  'best-nata-coaching-online',
  'nata-entrance-exam-coaching',
  'nata-coaching-centers-in-chennai',
];

export interface PageViewEvent {
  event: Extract<TaxonomyEvent, 'landing_page_viewed' | 'course_page_viewed' | 'tool_page_viewed'>;
  metadata: Record<string, string>;
}

/** Strip the locale prefix (English has none) and trailing slash. */
export function stripLocale(pathname: string): { locale: string; path: string } {
  const clean = (pathname || '/').split(/[?#]/)[0] || '/';
  const parts = clean.split('/').filter(Boolean);
  let locale = 'en';
  if (parts.length > 0 && NON_DEFAULT_LOCALES.includes(parts[0])) {
    locale = parts.shift() as string;
  } else if (parts[0] === 'en') {
    parts.shift();
  }
  return { locale, path: '/' + parts.join('/') };
}

export function classifyPageView(pathname: string): PageViewEvent | null {
  const { locale, path } = stripLocale(pathname);
  if (path === '/') return { event: 'landing_page_viewed', metadata: { page: 'home', locale } };

  const segments = path.split('/').filter(Boolean);
  const section = segments[0];
  if (section === 'tools') {
    return { event: 'tool_page_viewed', metadata: { tool: segments[1] || 'index', locale } };
  }
  if (COURSE_SECTIONS.includes(section)) {
    return { event: 'course_page_viewed', metadata: { section, slug: segments.slice(1).join('/') || 'index', locale } };
  }
  return null;
}
