import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { GEONAMES_ATTRIBUTION, INDIAN_CITIES } from '@neram/geo';
import ToolPublicPage from '@/components/tools/page/ToolPublicPage';
import { DataTable, Section } from '@/components/tools/page/parts';
import ExamCentresDemo from '@/features/tools/exam-centers/ExamCentresDemo';
import { getToolSeo } from '@/lib/tools/tool-seo';
import { GEO_BASE, examCentrePages, indexedCities } from '@/lib/tools/geo-pages';
import { lookupCity } from '@/lib/tools/places';
import { demoCentres, demoCities, demoStates } from '@/lib/tools/data/demo-props';
import { marketing } from '@/lib/tools/marketing-links';
import { toolPageMetadata } from '@/lib/seo/tool-metadata';
import { itemListSchema } from '@/lib/seo/tool-schemas';
import { nataCycleYear } from '@/lib/tools/cycle';

export const revalidate = 86400;
export const dynamicParams = true;

/** Only the biggest cities are built ahead; the rest render on first visit (ISR). */
export function generateStaticParams() {
  return INDIAN_CITIES.filter((c) => c.tier === 1).map((c) => ({ state: c.stateSlug, city: c.slug }));
}

async function load(stateSlug: string, citySlug: string) {
  const found = lookupCity(GEO_BASE.examCentres, stateSlug, citySlug);
  if (found.kind === 'redirect') permanentRedirect(found.to);
  if (found.kind === 'missing') return null;
  const { centres, cities } = await examCentrePages();
  const page = cities.find((c) => c.city.slug === found.value.slug);
  return page ? { page, centres, cities } : null;
}

const kmText = (km: number | null, inCity: boolean) => (inCity ? 'in the city' : `${km} km away`);

export async function generateMetadata({ params }: { params: { state: string; city: string } }): Promise<Metadata> {
  const data = await load(params.state, params.city);
  if (!data) return {};
  const { page } = data;
  const first = page.facts.near[0];
  const y = nataCycleYear();
  return toolPageMetadata({
    title: `NATA Exam Centre near ${page.city.name} ${y}: Nearest Test City`.slice(0, 60),
    description: first
      ? first.inThisCity
        ? `${page.city.name} is itself a NATA test city. See the venue, the next nearest test cities with distance in km, and plan your exam day.`
        : `The nearest NATA test city to ${page.city.name} is ${first.centre.label}, ${kmText(first.km, false)}. See the next nearest options and plan your exam day.`
      : `Find the NATA test cities nearest to ${page.city.name}, ${page.state.name}, with distance in km.`,
    path: page.path,
    index: page.gate.index,
  });
}

export default async function ExamCentresCityPage({ params }: { params: { state: string; city: string } }) {
  const data = await load(params.state, params.city);
  if (!data) notFound();
  const { page, centres, cities } = data;
  const tool = getToolSeo('nata-exam-centers');
  const { city, state } = page;
  const near = page.facts.near;
  const first = near[0];
  const year = Math.max(0, ...centres.map((c) => c.year));

  const next = near[1] ? ` The next nearest is ${near[1].centre.label} (${near[1].km} km, straight line).` : '';
  const answer = first
    ? first.inThisCity
      ? `${city.name} is itself a NATA ${year} test city, so you can write the exam without travelling.${next}`
      : `The nearest NATA ${year} test city to ${city.name} is ${first.centre.label}, about ${first.km} km away in a straight line.${next}`
    : tool.answer;

  const otherCities = indexedCities(cities, state.slug).filter((c) => c.city.slug !== city.slug).slice(0, 24);

  return (
    <ToolPublicPage
      tool={tool}
      isToolHome={false}
      crumbs={[
        { name: 'Tools', path: '/tools' },
        { name: tool.name, path: tool.path },
        { name: state.name, path: `${GEO_BASE.examCentres}/${state.slug}` },
        { name: city.name, path: page.path },
      ]}
      h1={`NATA Exam Centre near ${city.name}`}
      answer={answer}
      demoTitle="Check another town"
      demo={
        <ExamCentresDemo
          centres={demoCentres(centres)}
          cities={demoCities()}
          states={demoStates()}
          initialState={state.slug}
          initialCity={city.slug}
        />
      }
      faqs={[
        {
          q: `Which is the nearest NATA exam centre to ${city.name}?`,
          a: first ? `${first.centre.label}, ${kmText(first.km, first.inThisCity)} in a straight line.${first.centre.confirmed ? '' : ' The exact venue is confirmed on your admit card.'}` : 'See the list above.',
        },
        {
          q: `Is there a NATA exam centre in ${city.name}?`,
          a: first?.inThisCity ? `Yes, ${city.name} was a NATA ${year} test city.` : `No, ${city.name} was not a NATA ${year} test city. The nearest is ${first?.centre.label}.`,
        },
        ...tool.faqs.slice(0, 2),
      ]}
      jsonLd={[
        itemListSchema(
          `NATA test cities nearest to ${city.name}`,
          near.map((n) => ({ name: n.centre.label, item: { '@type': 'Place', geo: { '@type': 'GeoCoordinates', latitude: n.centre.lat, longitude: n.centre.lng } } }))
        ),
      ]}
      placeLinks={[{ id: 'nearby', title: `Other towns in ${state.name}`, links: otherCities.map((c) => ({ href: c.path, label: c.city.name })) }]}
      moreLinks={[
        { href: marketing.coachingCity(city.slug), label: `NATA coaching in ${city.name}` },
        { href: marketing.collegesState(state.slug), label: `B.Arch colleges in ${state.name}` },
      ]}
    >
      <Section id="nearest" title={`Nearest test cities to ${city.name}`}>
        <DataTable
          caption="Straight-line distance. Check road or train time before you choose."
          head={['Test city', 'State', 'Distance km', 'Status']}
          rows={near.map((n) => [
            n.centre.label,
            n.centre.stateSlug === state.slug ? state.name : n.centre.stateSlug.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
            n.inThisCity ? 0 : n.km ?? '',
            n.centre.confirmed ? 'Confirmed' : 'Probable',
          ])}
        />
      </Section>
      <p style={{ fontSize: '0.75rem', opacity: 0.8 }}>{GEONAMES_ATTRIBUTION}</p>
    </ToolPublicPage>
  );
}
