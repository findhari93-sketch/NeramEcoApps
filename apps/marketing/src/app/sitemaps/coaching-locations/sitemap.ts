import type { MetadataRoute } from 'next';
import { chennaiNeighborhoods } from '@/lib/seo/chennai-neighborhoods';
import { BASE_URL } from '@/lib/seo/constants';
import { EXAMS, type ExamKey } from '@/lib/seo/exam-config';
import { TEMPLATE_UPDATED_AT } from '@/lib/seo/location-facts';
import { loadGeoDatasets } from '@/lib/seo/location-data';
import { allCityGates, allStateGates } from '@/lib/seo/location-pages';

/**
 * Coaching location pages: the all-India directory, every state page and every
 * city page that passes the location gate (lib/seo/location-gate.ts), for NATA
 * and JEE Paper 2. Pages the gate holds back are noindexed and left out here.
 * lastmod comes from the facts each page is built from, so it only moves when
 * the page really changes. Served at /sitemaps/coaching-locations/sitemap.xml.
 */
export const revalidate = 86400;

const EXAM_KEYS: ExamKey[] = ['nata', 'jee-paper-2'];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const ds = await loadGeoDatasets();
  const entries: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/coaching/nata-coaching`, lastModified: new Date(TEMPLATE_UPDATED_AT), changeFrequency: 'weekly', priority: 0.9 },
  ];

  for (const exam of EXAM_KEYS) {
    const primary = exam === 'nata';
    for (const { state, facts, gate } of allStateGates(exam, ds)) {
      if (!gate.index) continue;
      entries.push({
        url: `${BASE_URL}${EXAMS[exam].statePath(state.slug)}`,
        lastModified: new Date(facts.lastModified),
        changeFrequency: 'weekly',
        priority: primary ? 0.85 : 0.75,
      });
    }
    for (const { place, facts, gate } of allCityGates(exam, ds)) {
      if (!gate.index) continue;
      const big = place.kind === 'india' && place.tier <= 2;
      entries.push({
        url: `${BASE_URL}${EXAMS[exam].cityPath(place.slug)}`,
        lastModified: new Date(facts.lastModified),
        changeFrequency: 'monthly',
        priority: (primary ? 0.7 : 0.6) + (big ? 0.1 : 0),
      });
    }
  }

  for (const n of chennaiNeighborhoods) {
    entries.push({
      url: `${BASE_URL}/coaching/nata-coaching-chennai/${n.slug}`,
      lastModified: new Date(TEMPLATE_UPDATED_AT),
      changeFrequency: 'monthly',
      priority: 0.6,
    });
  }

  return entries;
}
