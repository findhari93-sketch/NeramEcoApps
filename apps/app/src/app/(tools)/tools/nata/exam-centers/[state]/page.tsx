import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GEONAMES_ATTRIBUTION, STATES } from '@neram/geo';
import ToolPublicPage from '@/components/tools/page/ToolPublicPage';
import { DataTable, Section } from '@/components/tools/page/parts';
import ExamCentresDemo from '@/features/tools/exam-centers/ExamCentresDemo';
import { getToolSeo } from '@/lib/tools/tool-seo';
import { examCentrePages, indexedCities } from '@/lib/tools/geo-pages';
import { demoCentres, demoCities, demoStates } from '@/lib/tools/data/demo-props';
import { marketing } from '@/lib/tools/marketing-links';
import { toolPageMetadata } from '@/lib/seo/tool-metadata';
import { itemListSchema } from '@/lib/seo/tool-schemas';
import { nataCycleYear } from '@/lib/tools/cycle';

export const revalidate = 86400;
export const dynamicParams = false;

export function generateStaticParams() {
  return STATES.map((s) => ({ state: s.slug }));
}

async function load(stateSlug: string) {
  const { centres, states, cities } = await examCentrePages();
  const page = states.find((s) => s.state.slug === stateSlug);
  return page ? { page, centres, cities } : null;
}

export async function generateMetadata({ params }: { params: { state: string } }): Promise<Metadata> {
  const data = await load(params.state);
  if (!data) return {};
  const { page } = data;
  const n = page.facts.centres.length;
  const y = nataCycleYear();
  return toolPageMetadata({
    title: `NATA Exam Centres in ${page.state.name} ${y}: ${n > 0 ? `${n} Test Cit${n === 1 ? 'y' : 'ies'}` : 'Nearest Cities'}`.slice(0, 60),
    description:
      n > 0
        ? `NATA test cities in ${page.state.name}: ${page.facts.centres.map((c) => c.label).slice(0, 5).join(', ')}. Find the nearest one to your town with distance in km.`
        : `There is no NATA test city in ${page.state.name}. See the nearest test cities in neighbouring states and how far they are.`,
    path: page.path,
    index: page.gate.index,
  });
}

export default async function ExamCentresStatePage({ params }: { params: { state: string } }) {
  const data = await load(params.state);
  if (!data) notFound();
  const { page, centres, cities } = data;
  const tool = getToolSeo('nata-exam-centers');
  const { state } = page;
  const list = page.facts.centres;
  const year = Math.max(0, ...centres.map((c) => c.year));
  const cityLinks = indexedCities(cities, state.slug);

  const answer =
    list.length > 0
      ? `${state.name} had ${list.length} NATA ${year} test cit${list.length === 1 ? 'y' : 'ies'}: ${list.map((c) => c.label).join(', ')}. Pick your town below to see which one is nearest.`
      : `${state.name} had no NATA ${year} test city. The nearest from ${state.capital} ${page.facts.nearestToCapital.length > 0 ? `are ${page.facts.nearestToCapital.map((n) => `${n.centre.label} (${n.km} km)`).join(', ')}` : 'are in neighbouring states'}.`;

  return (
    <ToolPublicPage
      tool={tool}
      isToolHome={false}
      crumbs={[
        { name: 'Tools', path: '/tools' },
        { name: tool.name, path: tool.path },
        { name: state.name, path: page.path },
      ]}
      h1={`NATA Exam Centres in ${state.name}`}
      answer={answer}
      updated={list.map((c) => c.updatedAt).filter(Boolean).sort().pop() ?? undefined}
      demoTitle={`Find the nearest test city in ${state.name}`}
      demo={<ExamCentresDemo centres={demoCentres(centres)} cities={demoCities()} states={demoStates()} initialState={state.slug} />}
      faqs={[
        {
          q: `How many NATA exam centres are there in ${state.name}?`,
          a: list.length > 0 ? `${list.length} test cit${list.length === 1 ? 'y' : 'ies'} in NATA ${year}: ${list.map((c) => c.label).join(', ')}.` : `None in NATA ${year}. Students from ${state.name} write NATA in a neighbouring state's test city.`,
        },
        ...tool.faqs.slice(0, 2),
      ]}
      jsonLd={
        list.length > 0
          ? [itemListSchema(`NATA test cities in ${state.name}`, list.map((c) => ({ name: c.label, item: { '@type': 'Place', geo: { '@type': 'GeoCoordinates', latitude: c.lat, longitude: c.lng } } })))]
          : []
      }
      placeLinks={[{ id: 'cities', title: `Nearest test city from towns in ${state.name}`, links: cityLinks.map((c) => ({ href: c.path, label: c.city.name })) }]}
      moreLinks={[
        { href: marketing.coachingState(state.slug), label: `NATA coaching in ${state.name}` },
        { href: marketing.collegesState(state.slug), label: `B.Arch colleges in ${state.name}` },
      ]}
    >
      {list.length > 0 && (
        <Section id="test-cities" title={`Test cities in ${state.name}`}>
          <DataTable
            caption="Venues are our estimate from past years until admit cards are out."
            head={['Test city', 'Likely venue', 'Status']}
            rows={list.map((c) => [c.label, c.venues[0] ?? 'To be announced', c.confirmed ? 'Confirmed' : 'Probable'])}
          />
        </Section>
      )}
      <p style={{ fontSize: '0.75rem', opacity: 0.8 }}>{GEONAMES_ATTRIBUTION}</p>
    </ToolPublicPage>
  );
}
