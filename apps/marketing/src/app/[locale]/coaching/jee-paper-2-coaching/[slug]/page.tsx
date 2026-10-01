import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound, permanentRedirect } from 'next/navigation';
import { CityCoachingPage } from '@/components/coaching-location/CityCoachingPage';
import { EXAMS } from '@/lib/seo/exam-config';
import { loadGeoDatasets } from '@/lib/seo/location-data';
import { cityFactsFor, cityMetadata, lookupCity, nearbyCities } from '@/lib/seo/location-pages';

/**
 * /coaching/jee-paper-2-coaching/jee-paper-2-coaching-in-{city}: JEE Main
 * Paper 2 (B.Arch) coaching for every Indian city in the registry. Nothing is
 * prebuilt (Vercel 15k-file cap); pages render on first visit and are cached for
 * a day. The location gate indexes only cities with real JEE facts (a JoSAA or
 * JEE-accepting college nearby, a classroom, or local content).
 */
export const revalidate = 86400;
export const dynamicParams = true;

interface PageProps {
  params: { locale: string; slug: string };
}

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const found = lookupCity('jee-paper-2', params.slug);
  if (found.kind !== 'page') return {};
  const { facts, gate } = cityFactsFor('jee-paper-2', found.place, await loadGeoDatasets());
  return cityMetadata(facts, gate);
}

export default async function JeeCityPage({ params }: PageProps) {
  setRequestLocale(params.locale);
  const found = lookupCity('jee-paper-2', params.slug);
  if (found.kind === 'redirect') permanentRedirect(found.to);
  if (found.kind === 'not-found') notFound();

  const ds = await loadGeoDatasets();
  const { facts } = cityFactsFor('jee-paper-2', found.place, ds);
  const sibling = { label: `NATA coaching in ${found.place.name}`, href: EXAMS.nata.cityPath(found.place.slug), hint: 'B.Arch through NATA' };

  return (
    <CityCoachingPage facts={facts} locale={params.locale} nearby={nearbyCities('jee-paper-2', found.place, ds)} siblingExam={sibling} />
  );
}
