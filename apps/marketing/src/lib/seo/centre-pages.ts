/**
 * Each classroom's one page is its city page. Shared with next.config.js, which
 * 301s the old /contact/{seo_slug} centre pages using the same map.
 */
import CENTRE_PAGES from '@/data/centre-pages.json';
import { EXAMS } from './exam-config';

const MAP: Record<string, string> = CENTRE_PAGES;

/** City page (visit section) for a centre's seo_slug, or the contact hub when unknown. */
export function centrePagePath(seoSlug: string | null | undefined): string {
  const city = seoSlug ? MAP[seoSlug] : undefined;
  return city ? `${EXAMS.nata.cityPath(city)}#visit` : '/contact';
}
