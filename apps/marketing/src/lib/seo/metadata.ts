import { BASE_URL, SUPPORTED_LOCALES, DEFAULT_LOCALE } from './constants';
import { indexableLocales } from './indexable-locales';

/**
 * Build a dynamic OG image URL using the /api/og endpoint.
 *
 * @param title - The title text for the OG image
 * @param subtitle - Optional subtitle text
 * @param type - Image style: 'nata' | 'coaching' | 'blog' | 'tool' | 'default'
 */
export function buildOgImage(
  title: string,
  subtitle?: string,
  type: 'nata' | 'coaching' | 'blog' | 'tool' | 'default' = 'default'
) {
  const params = new URLSearchParams({ title, type });
  if (subtitle) params.set('subtitle', subtitle);
  return `${BASE_URL}/api/og?${params.toString()}`;
}

/**
 * Build locale-aware canonical + hreflang alternates for Next.js Metadata API.
 * Use this in every page's generateMetadata() to ensure proper SEO.
 *
 * Only locales in which the page is indexable get an hreflang entry (see
 * indexable-locales.ts). A request for a noindexed locale copy gets the English
 * URL as its canonical, so Google consolidates signals on the indexable page.
 *
 * @param locale - Current page locale (e.g., 'en', 'ta')
 * @param path - Page path WITHOUT locale prefix (e.g., '/about', '/blog/my-post')
 */
export function buildAlternates(
  locale: string,
  path: string
): { canonical: string; languages?: Record<string, string> } {
  const url = (l: string) =>
    // Default locale (en) has no prefix due to localePrefix: 'as-needed'
    l === DEFAULT_LOCALE ? `${BASE_URL}${path}` : `${BASE_URL}/${l}${path}`;

  const indexable = indexableLocales(path);
  const canonical = url(indexable.includes(locale) ? locale : DEFAULT_LOCALE);
  if (indexable.length < 2) return { canonical };

  const languages: Record<string, string> = {};
  for (const l of SUPPORTED_LOCALES) {
    if (indexable.includes(l)) languages[l] = url(l);
  }
  languages['x-default'] = url(DEFAULT_LOCALE);
  return { canonical, languages };
}
