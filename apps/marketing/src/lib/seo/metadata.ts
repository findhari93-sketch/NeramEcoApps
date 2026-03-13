import { BASE_URL, SUPPORTED_LOCALES, DEFAULT_LOCALE } from './constants';

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
 * @param locale - Current page locale (e.g., 'en', 'ta')
 * @param path - Page path WITHOUT locale prefix (e.g., '/about', '/blog/my-post')
 */
export function buildAlternates(locale: string, path: string) {
  const languages: Record<string, string> = {};
  for (const l of SUPPORTED_LOCALES) {
    // Default locale (en) has no prefix due to localePrefix: 'as-needed'
    languages[l] =
      l === DEFAULT_LOCALE ? `${BASE_URL}${path}` : `${BASE_URL}/${l}${path}`;
  }
  languages['x-default'] = `${BASE_URL}${path}`;

  return {
    canonical:
      locale === DEFAULT_LOCALE
        ? `${BASE_URL}${path}`
        : `${BASE_URL}/${locale}${path}`,
    languages,
  };
}
