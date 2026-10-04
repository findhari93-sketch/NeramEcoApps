import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound, permanentRedirect } from 'next/navigation';
import { CityCoachingPage } from '@/components/coaching-location/CityCoachingPage';
import { loadLocalReviews } from '@/lib/reviews/data';
import { getCityVideos } from '@/lib/seo/location-videos';
import { EXAMS } from '@/lib/seo/exam-config';
import { loadGeoDatasets } from '@/lib/seo/location-data';
import { cityFactsFor, cityMetadata, citySegment, lookupCity, nearbyCities, prebuiltCitySlugs, travelFromCities } from '@/lib/seo/location-pages';

/**
 * /coaching/nata-coaching/nata-coaching-centers-in-{city}: one page per city in
 * the location registry (~770). Only the classroom cities and metros are
 * prebuilt (the marketing build is near Vercel's 15k-file cap); the rest render
 * on first visit and are cached for a day. Whether a page is indexed is decided
 * by the location gate (lib/seo/location-gate.ts), never here.
 */
export const revalidate = 86400;
export const dynamicParams = true;

interface PageProps {
  params: { locale: string; slug: string };
}

export function generateStaticParams() {
  return prebuiltCitySlugs('nata').map((city) => ({ locale: 'en', slug: citySegment('nata', city) }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const found = lookupCity('nata', params.slug);
  if (found.kind !== 'page') return {};
  const { facts, gate } = cityFactsFor('nata', found.place, await loadGeoDatasets());
  return cityMetadata(facts, gate);
}

export default async function NataCityPage({ params }: PageProps) {
  setRequestLocale(params.locale);
  const found = lookupCity('nata', params.slug);
  if (found.kind === 'redirect') permanentRedirect(found.to);
  if (found.kind === 'not-found') notFound();

  const ds = await loadGeoDatasets();
  const { facts } = cityFactsFor('nata', found.place, ds);
  const videos = (await getCityVideos()).filter((v) => v.citySlug === found.place.slug);
  const reviews = await loadLocalReviews(
    [found.place.name, ...('altNames' in found.place ? found.place.altNames ?? [] : [])],
    facts.state?.name ?? null,
    params.locale,
  );
  const sibling =
    found.place.kind === 'india'
      ? { label: `JEE Paper 2 coaching in ${found.place.name}`, href: EXAMS['jee-paper-2'].cityPath(found.place.slug), hint: 'B.Arch through JEE Main' }
      : null;

  return (
    <CityCoachingPage facts={facts} locale={params.locale} nearby={nearbyCities('nata', found.place, ds)} siblingExam={sibling} reviews={reviews} videos={videos}
      travelFrom={facts.mode === 'classroom' ? travelFromCities('nata', found.place, ds) : []} />
  );
}
