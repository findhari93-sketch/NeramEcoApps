import type { MetadataRoute } from 'next';
import { APP_URL } from '@/lib/seo/constants';
import { allToolSeo } from '@/lib/tools/tool-seo';
import { TEMPLATE_UPDATED_AT } from '@/lib/tools/geo-pages';
import { loadRankBands } from '@/lib/tools/data/loaders';
import { SYSTEM_PAGES, systemSlugFor } from '@/lib/tools/data/rank-props';

export const revalidate = 86400;

/** Home, the tools hub, every tool page and the per-counselling pages that have data. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = TEMPLATE_UPDATED_AT;
  const systems = (await loadRankBands()).map((s) => systemSlugFor(s.code)).filter((s): s is keyof typeof SYSTEM_PAGES => !!s);
  return [
    { url: APP_URL, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${APP_URL}/tools`, lastModified, changeFrequency: 'weekly', priority: 1 },
    ...allToolSeo().map((t) => ({ url: `${APP_URL}${t.path}`, lastModified, changeFrequency: 'weekly' as const, priority: 0.9 })),
    ...systems.flatMap((s) => [
      { url: `${APP_URL}/tools/counseling/rank-predictor/${s}`, lastModified, changeFrequency: 'monthly' as const, priority: 0.7 },
      { url: `${APP_URL}/tools/counseling/insights/${s}`, lastModified, changeFrequency: 'monthly' as const, priority: 0.7 },
    ]),
  ];
}
