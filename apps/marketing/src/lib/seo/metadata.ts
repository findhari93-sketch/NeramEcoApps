import { BASE_URL, SUPPORTED_LOCALES, DEFAULT_LOCALE } from './constants';

/**
 * Build locale-aware canonical + hreflang alternates for Next.js Metadata API.
 * Use this in every page's generateMetadata() to ensure proper SEO.
 *
 * @param locale - Current page locale (e.g., 'en', 'ta')
 * @param path - Page path WITHOUT locale prefix (e.g., '/about', '/blog/my-post')
 */
export function buildAlternates(locale: string, path: string) {
  const languages: Record<string, string> = {};
  for (const l of SUPPORTED_LOCALES) {
    languages[l] = `${BASE_URL}/${l}${path}`;
  }
  languages['x-default'] = `${BASE_URL}/${DEFAULT_LOCALE}${path}`;

  return {
    canonical: `${BASE_URL}/${locale}${path}`,
    languages,
  };
}
