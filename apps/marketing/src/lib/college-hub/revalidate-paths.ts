import { locales } from '@/i18n';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The ISR paths of one college profile page in every locale, for
 * POST /api/revalidate `{ colleges: [{ state_slug, slug }] }`. Anything that is
 * not a plain slug pair is dropped, so a caller can only purge college pages.
 */
export function collegePagePaths(colleges: unknown[]): string[] {
  const out: string[] = [];
  for (const c of colleges) {
    const state = (c as { state_slug?: unknown } | null)?.state_slug;
    const slug = (c as { slug?: unknown } | null)?.slug;
    if (typeof state !== 'string' || typeof slug !== 'string') continue;
    if (!SLUG.test(state) || !SLUG.test(slug) || state.length > 80 || slug.length > 120) continue;
    for (const locale of locales) {
      const path = `/${locale}/colleges/${state}/${slug}`;
      if (!out.includes(path)) out.push(path);
    }
  }
  return out;
}
