import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ToolPublicPage from '@/components/tools/page/ToolPublicPage';
import { DataTable, Section } from '@/components/tools/page/parts';
import CoaDemo from '@/features/tools/coa-checker/CoaDemo';
import { getToolSeo } from '@/lib/tools/tool-seo';
import { GEO_BASE, coaPages, indexedCities } from '@/lib/tools/geo-pages';
import { demoCoa } from '@/lib/tools/data/demo-props';
import { marketing } from '@/lib/tools/marketing-links';
import { toolPageMetadata } from '@/lib/seo/tool-metadata';
import { itemListSchema } from '@/lib/seo/tool-schemas';

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  const { states } = await coaPages();
  return states.map((s) => ({ state: s.state.slug }));
}

async function load(stateSlug: string) {
  const data = await coaPages();
  const page = data.states.find((s) => s.state.slug === stateSlug);
  return page ? { page, ...data } : null;
}

export async function generateMetadata({ params }: { params: { state: string } }): Promise<Metadata> {
  const data = await load(params.state);
  if (!data) return {};
  const { page } = data;
  const n = page.facts.colleges.length;
  return toolPageMetadata({
    title: `COA Approved Architecture Colleges in ${page.state.name}`.slice(0, 60),
    description: `${n} B.Arch institution${n === 1 ? '' : 's'} in ${page.state.name} on the Council of Architecture list, with city and intake. Check a college before you apply.`,
    path: page.path,
    index: page.gate.index,
  });
}

export default async function CoaStatePage({ params }: { params: { state: string } }) {
  const data = await load(params.state);
  if (!data) notFound();
  const { page, cities } = data;
  const tool = getToolSeo('counseling-coa-checker');
  const { state } = page;
  const list = page.facts.colleges;
  const intake = list.reduce((n, c) => n + (c.intake ?? 0), 0);
  const topCities = [...new Set(list.map((c) => c.city).filter(Boolean))].slice(0, 4);

  return (
    <ToolPublicPage
      tool={tool}
      isToolHome={false}
      crumbs={[
        { name: 'Tools', path: '/tools' },
        { name: tool.name, path: tool.path },
        { name: state.name, path: page.path },
      ]}
      h1={`COA Approved Architecture Colleges in ${state.name}`}
      answer={`${state.name} has ${list.length} B.Arch institution${list.length === 1 ? '' : 's'} on the Council of Architecture list${intake ? `, with ${intake.toLocaleString('en-IN')} seats a year` : ''}${topCities.length ? `, in ${topCities.join(', ')} and more` : ''}. Search any college below.`}
      demoTitle={`Search colleges in ${state.name}`}
      demo={<CoaDemo colleges={demoCoa(list)} placeholder={`A college in ${state.name}`} />}
      jsonLd={[itemListSchema(`COA approved B.Arch institutions in ${state.name}`, list.map((c) => ({ name: c.name, item: { '@type': 'CollegeOrUniversity', address: { '@type': 'PostalAddress', addressLocality: c.city, addressRegion: state.name, addressCountry: 'IN' } } })))]}
      placeLinks={[{ id: 'cities', title: `By city in ${state.name}`, links: indexedCities(cities, state.slug).map((c) => ({ href: c.path, label: c.city.name, note: `${c.facts.inCity.length}` })) }]}
      moreLinks={[
        { href: marketing.collegesState(state.slug), label: `B.Arch colleges in ${state.name}: fees and cutoffs` },
        { href: `${GEO_BASE.collegePredictor}/${state.slug}`, label: `College predictor for ${state.name}` },
      ]}
    >
      <Section id="list" title={`All ${list.length} institutions`}>
        <DataTable
          caption="As listed by the Council of Architecture. Confirm the current year on coa.gov.in."
          head={['Institution', 'City', 'Intake seats', 'Listed for']}
          rows={list.map((c) => [c.name, c.city, c.intake ?? '', c.period ?? ''])}
        />
      </Section>
    </ToolPublicPage>
  );
}
