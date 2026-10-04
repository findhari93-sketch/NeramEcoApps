import { BASE_URL } from '@/lib/seo/constants';
import { EXAMS } from '@/lib/seo/exam-config';
import { loadGeoDatasets } from '@/lib/seo/location-data';
import { cityFactsFor } from '@/lib/seo/location-pages';
import { getCityVideos, youtubeThumb } from '@/lib/seo/location-videos';
import { getCity } from '@/data/geo';

/**
 * Video sitemap: city-tagged class clips and reviews, listed on the city page
 * they play on, and only when that page is indexed. Empty until staff tag
 * videos with a city in social_proofs.city_slug.
 */
export const revalidate = 86400;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function GET() {
  const [videos, ds] = await Promise.all([getCityVideos(), loadGeoDatasets()]);
  const byPage = new Map<string, typeof videos>();
  for (const v of videos) {
    const place = getCity(v.citySlug);
    if (!place || !cityFactsFor('nata', place, ds).gate.index) continue;
    const loc = `${BASE_URL}${EXAMS.nata.cityPath(v.citySlug)}`;
    byPage.set(loc, [...(byPage.get(loc) ?? []), v]);
  }
  const urls = [...byPage.entries()].map(
    ([loc, vs]) => `  <url>
    <loc>${esc(loc)}</loc>
${vs
  .map(
    (v) => `    <video:video>
      <video:thumbnail_loc>${esc(youtubeThumb(v.youtubeId))}</video:thumbnail_loc>
      <video:title>${esc(v.title)}</video:title>
      <video:description>${esc(v.description.slice(0, 2000))}</video:description>
      <video:player_loc>${esc(`https://www.youtube-nocookie.com/embed/${v.youtubeId}`)}</video:player_loc>
      <video:publication_date>${v.addedAt}</video:publication_date>
    </video:video>`,
  )
  .join('\n')}
  </url>`,
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${urls.join('\n')}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
