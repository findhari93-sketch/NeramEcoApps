import type { MetadataRoute } from 'next';
import { APP_URL } from '@/lib/seo/constants';
import { allGeoPages } from '@/lib/tools/geo-pages';

export const revalidate = 86400;

/**
 * State and city pages of the tools, only those the index gate lets in
 * (lib/tools/geo-pages.ts). Gated-out pages still exist for students but are
 * noindex and never listed here.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = await allGeoPages();
  return pages
    .filter((p) => p.index)
    .map((p) => ({
      url: `${APP_URL}${p.path}`,
      lastModified: p.lastModified,
      changeFrequency: 'monthly' as const,
      priority: p.kind === 'state' ? 0.7 : 0.6,
    }));
}
