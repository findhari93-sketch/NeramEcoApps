import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { GEONAMES_ATTRIBUTION } from '@neram/geo';
import ToolPublicPage from '@/components/tools/page/ToolPublicPage';
import { DataTable, Section } from '@/components/tools/page/parts';
import CollegePredictorDemo from '@/features/tools/college-predictor/CollegePredictorDemo';
import { getToolSeo } from '@/lib/tools/tool-seo';
import { GEO_BASE, indexedCities, predictorPages } from '@/lib/tools/geo-pages';
import { lookupCity } from '@/lib/tools/places';
import { demoSystems } from '@/lib/tools/data/predictor-props';
import { marketing } from '@/lib/tools/marketing-links';
import { toolPageMetadata } from '@/lib/seo/tool-metadata';
import { itemListSchema } from '@/lib/seo/tool-schemas';
import { nataCycleYear } from '@/lib/tools/cycle';
import type { CutoffCollege } from '@/lib/tools/data/facts';

export const revalidate = 86400;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

async function load(stateSlug: string, citySlug: string) {
  const found = lookupCity(GEO_BASE.collegePredictor, stateSlug, citySlug);
  if (found.kind === 'redirect') permanentRedirect(found.to);
  if (found.kind === 'missing') return null;
  const data = await predictorPages();
  const page = data.cities.find((c) => c.city.slug === found.value.slug);
  return page ? { page, ...data } : null;
}

const closing = (c: CutoffCollege) => (c.system === 'TNEA_BARCH' ? c.closingMarks?.OC : c.closingRank);

export async function generateMetadata({ params }: { params: { state: string; city: string } }): Promise<Metadata> {
  const data = await load(params.state, params.city);
  if (!data) return {};
  const { page } = data;
  const near = [...page.facts.inCity, ...page.facts.inDistrict];
  return toolPageMetadata({
    title: `B.Arch College Predictor near ${page.city.name} ${nataCycleYear()}`.slice(0, 60),
    description: `${near.length} B.Arch college${near.length === 1 ? '' : 's'} in and around ${page.city.name} with last year's closing ${near[0]?.system === 'TNEA_BARCH' ? 'marks' : 'ranks'}. Check which you can get with your score.`,
    path: page.path,
    index: page.gate.index,
  });
}

export default async function PredictorCityPage({ params }: { params: { state: string; city: string } }) {
  const data = await load(params.state, params.city);
  if (!data) notFound();
  const { page, cities, colleges } = data;
  const tool = getToolSeo('counseling-college-predictor');
  const { city, state } = page;
  const near = [...page.facts.inCity, ...page.facts.inDistrict];
  const byMark = near[0]?.system === 'TNEA_BARCH';
  const year = near[0]?.year;
  const where = page.facts.inCity.length > 0 ? `in ${city.name}` : `in ${city.district ?? city.name} district`;

  const answer = `${near.length} B.Arch college${near.length === 1 ? '' : 's'} ${where} took students through ${byMark ? 'TNEA' : 'KEAM'} in ${year}. ${
    near[0]
      ? byMark
        ? `${near[0].name} closed at ${closing(near[0])} marks out of 400 in the open category.`
        : `${near[0].name} closed at rank ${closing(near[0])?.toLocaleString('en-IN')} in State Merit.`
      : ''
  } Enter your ${byMark ? 'cutoff' : 'rank'} to check your chances.`;

  return (
    <ToolPublicPage
      tool={tool}
      isToolHome={false}
      crumbs={[
        { name: 'Tools', path: '/tools' },
        { name: tool.name, path: tool.path },
        { name: state.name, path: `${GEO_BASE.collegePredictor}/${state.slug}` },
        { name: city.name, path: page.path },
      ]}
      h1={`B.Arch Colleges near ${city.name}: College Predictor`}
      answer={answer}
      demoTitle={`Check your chances in ${state.name}`}
      demo={<CollegePredictorDemo systems={demoSystems(colleges, state.slug)} />}
      jsonLd={[itemListSchema(`B.Arch colleges near ${city.name}`, near.map((c) => ({ name: c.name })))]}
      placeLinks={[
        {
          id: 'nearby',
          title: `Other cities in ${state.name}`,
          links: indexedCities(cities, state.slug).filter((c) => c.city.slug !== city.slug).map((c) => ({ href: c.path, label: c.city.name })),
        },
      ]}
      moreLinks={[
        { href: marketing.coachingCity(city.slug), label: `NATA coaching in ${city.name}` },
        { href: marketing.collegesState(state.slug), label: `B.Arch colleges in ${state.name}` },
        { href: `${GEO_BASE.examCentres}/${state.slug}/${city.slug}`, label: `NATA exam centre near ${city.name}` },
      ]}
    >
      <Section id="near" title={`B.Arch colleges ${where}`}>
        <DataTable
          caption={byMark ? `${year} lowest mark out of 400 allotted, open (OC) category` : `${year} last State Merit rank allotted`}
          head={['College', 'Place', byMark ? 'Closing marks' : 'Closing rank']}
          rows={near.map((c) => [c.name, c.city ?? c.district ?? '', closing(c) ?? ''])}
        />
      </Section>
      <p style={{ fontSize: '0.75rem', opacity: 0.8 }}>{GEONAMES_ATTRIBUTION}</p>
    </ToolPublicPage>
  );
}
