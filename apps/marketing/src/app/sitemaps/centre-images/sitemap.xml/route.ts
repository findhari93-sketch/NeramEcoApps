import { BASE_URL } from '@/lib/seo/constants';
import { EXAMS } from '@/lib/seo/exam-config';
import { getClassroomCentres } from '@/lib/seo/facts';
import { loadGeoDatasets } from '@/lib/seo/location-data';
import { cityFactsFor } from '@/lib/seo/location-pages';
import { buildImageSitemap } from '@/lib/seo/sitemaps';
import { getCity } from '@/data/geo';

/**
 * Image sitemap: the real centre photos (Admin > Centres), listed on the
 * classroom's own NATA city page, only when that page is indexed. Empty until
 * staff upload photos.
 */
export const revalidate = 86400;

export async function GET() {
  const [centres, ds] = await Promise.all([getClassroomCentres(), loadGeoDatasets()]);
  const byPage = new Map<string, string[]>();
  for (const c of centres) {
    const place = getCity(c.citySlug);
    if (!place || !c.photos?.length || !cityFactsFor('nata', place, ds).gate.index) continue;
    const loc = `${BASE_URL}${EXAMS.nata.cityPath(c.citySlug)}`;
    byPage.set(loc, [...(byPage.get(loc) ?? []), ...c.photos.map((p) => p.url)]);
  }
  const xml = buildImageSitemap([...byPage.entries()].map(([loc, images]) => ({ loc, images })));
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
