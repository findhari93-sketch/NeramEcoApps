/**
 * Cached offline-centre reads for /contact/[slug] and the core sitemap.
 *
 * The package defaults use the no-store admin client, which made these ISR
 * pages render on every request. These go through the ISR admin client inside
 * unstable_cache (daily, tag 'centers').
 *
 * A slug is looked up only when it is in the cached slug list, so a junk
 * /contact/<anything> answers 404 without a per-slug database read or a new
 * Data Cache entry.
 */
import { unstable_cache } from 'next/cache';
import { createAdminClientISR } from '@neram/database';
import { getAllCenterSeoSlugs, getCenterBySeoSlug } from '@neram/database/queries';
import type { OfflineCenter } from '@neram/database';
import { CACHE_TAGS } from '@/lib/cache-tags';

export const CENTERS_REVALIDATE = 86400;

const isrClient = () => createAdminClientISR(CENTERS_REVALIDATE);

export const getCachedCenterSlugs = unstable_cache(
  async (): Promise<string[]> => getAllCenterSeoSlugs(isrClient()),
  ['marketing-center-seo-slugs-v1'],
  { revalidate: CENTERS_REVALIDATE, tags: [CACHE_TAGS.centers] },
);

const readCenter = unstable_cache(
  async (slug: string): Promise<OfflineCenter | null> => getCenterBySeoSlug(slug, isrClient()),
  ['marketing-center-by-slug-v1'],
  { revalidate: CENTERS_REVALIDATE, tags: [CACHE_TAGS.centers] },
);

/** The active centre for an SEO slug, or null (unknown slugs never hit the database). */
export async function getCachedCenter(slug: string): Promise<OfflineCenter | null> {
  const slugs = await getCachedCenterSlugs();
  if (!slugs.includes(slug)) return null;
  return readCenter(slug);
}
