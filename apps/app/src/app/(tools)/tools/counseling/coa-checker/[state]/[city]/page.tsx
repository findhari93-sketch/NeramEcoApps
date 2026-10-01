import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import ToolPublicPage from '@/components/tools/page/ToolPublicPage';
import { DataTable, Section } from '@/components/tools/page/parts';
import CoaDemo from '@/features/tools/coa-checker/CoaDemo';
import { getToolSeo } from '@/lib/tools/tool-seo';
import { GEO_BASE, coaPages, indexedCities } from '@/lib/tools/geo-pages';
import { lookupCity } from '@/lib/tools/places';
import { demoCoa } from '@/lib/tools/data/demo-props';
import { marketing } from '@/lib/tools/marketing-links';
import { toolPageMetadata } from '@/lib/seo/tool-metadata';
import { itemListSchema } from '@/lib/seo/tool-schemas';

export const revalidate = 86400;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

async function load(stateSlug: string, citySlug: string) {
  const found = lookupCity(GEO_BASE.coaChecker, stateSlug, citySlug);
  if (found.kind === 'redirect') permanentRedirect(found.to);
  if (found.kind === 'missing') return null;
  const data = await coaPages();
  const page = data.cities.find((c) => c.city.slug === found.value.slug);
  return page ? { page, ...data } : null;
}

export async function generateMetadata({ params }: { params: { state: string; city: string } }): Promise<Metadata> {
  const data = await load(params.state, params.city);
  if (!data) return {};
  const { page } = data;
  const n = page.facts.inCity.length;
  return toolPageMetadata({
    title: `COA Approved Architecture Colleges in ${page.city.name}`.slice(0, 60),
    description: `${n} B.Arch institution${n === 1 ? '' : 's'} in ${page.city.name} on the Council of Architecture list, with intake. Check before you apply.`,
    path: page.path,
    index: page.gate.index,
  });
}

export default async function CoaCityPage({ params }: { params: { state: string; city: string } }) {
  const data = await load(params.state, params.city);
  if (!data) notFound();
  const { page, cities } = data;
  const tool = getToolSeo('counseling-coa-checker');
  const { city, state } = page;
  const list = page.facts.inCity;

  return (
    <ToolPublicPage
      tool={tool}
      isToolHome={false}
      crumbs={[
        { name: 'Tools', path: '/tools' },
        { name: tool.name, path: tool.path },
        { name: state.name, path: `${GEO_BASE.coaChecker}/${state.slug}` },
        { name: city.name, path: page.path },
      ]}
      h1={`COA Approved Architecture Colleges in ${city.name}`}
      answer={`${city.name} has ${list.length} B.Arch institution${list.length === 1 ? '' : 's'} on the Council of Architecture list: ${list.slice(0, 3).map((c) => c.name).join(', ')}${list.length > 3 ? ' and more' : ''}. ${state.name} has ${page.facts.stateCount} in all.`}
      demoTitle="Search the COA list"
      demo={<CoaDemo colleges={demoCoa(list)} placeholder={`A college in ${city.name}`} />}
      jsonLd={[itemListSchema(`COA approved B.Arch institutions in ${city.name}`, list.map((c) => ({ name: c.name, item: { '@type': 'CollegeOrUniversity', address: { '@type': 'PostalAddress', addressLocality: city.name, addressRegion: state.name, addressCountry: 'IN' } } })))]}
      placeLinks={[{ id: 'nearby', title: `Other cities in ${state.name}`, links: indexedCities(cities, state.slug).filter((c) => c.city.slug !== city.slug).map((c) => ({ href: c.path, label: c.city.name })) }]}
      moreLinks={[
        { href: marketing.coachingCity(city.slug), label: `NATA coaching in ${city.name}` },
        { href: `${GEO_BASE.examCentres}/${state.slug}/${city.slug}`, label: `NATA exam centre near ${city.name}` },
      ]}
    >
      <Section id="list" title={`B.Arch institutions in ${city.name}`}>
        <DataTable
          caption="As listed by the Council of Architecture. Confirm the current year on coa.gov.in."
          head={['Institution', 'University', 'Intake seats', 'Listed for']}
          rows={list.map((c) => [c.name, c.university ?? '', c.intake ?? '', c.period ?? ''])}
        />
      </Section>
    </ToolPublicPage>
  );
}
