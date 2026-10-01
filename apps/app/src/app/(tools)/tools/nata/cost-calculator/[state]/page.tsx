import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { STATES } from '@neram/geo';
import ToolPublicPage from '@/components/tools/page/ToolPublicPage';
import { DataTable, Section } from '@/components/tools/page/parts';
import CostDemo from '@/features/tools/cost-calculator/CostDemo';
import { getToolSeo } from '@/lib/tools/tool-seo';
import { GEO_BASE, costPages, examCentrePages } from '@/lib/tools/geo-pages';
import { demoCentresByState, demoStates } from '@/lib/tools/data/demo-props';
import { NATA_FEES, NATA_FEE_YEAR } from '@/lib/tools/nata-fees';
import { marketing } from '@/lib/tools/marketing-links';
import { toolPageMetadata } from '@/lib/seo/tool-metadata';
import { nataCycleYear } from '@/lib/tools/cycle';

export const revalidate = 86400;
export const dynamicParams = false;

export function generateStaticParams() {
  return STATES.map((s) => ({ state: s.slug }));
}

async function load(stateSlug: string) {
  const [pages, ec] = await Promise.all([costPages(), examCentrePages()]);
  const page = pages.find((p) => p.state.slug === stateSlug);
  return page ? { page, pages, ec } : null;
}

export async function generateMetadata({ params }: { params: { state: string } }): Promise<Metadata> {
  const data = await load(params.state);
  if (!data) return {};
  const { page } = data;
  return toolPageMetadata({
    title: `NATA Exam Cost from ${page.state.name} ${nataCycleYear()}: Fee and Travel`.slice(0, 60),
    description: `NATA fee per attempt and where students from ${page.state.name} write the exam: ${page.facts.centres.length > 0 ? `${page.facts.centres.length} test cities in the state` : 'the nearest test cities in neighbouring states'}.`,
    path: page.path,
    index: page.gate.index,
  });
}

export default async function CostStatePage({ params }: { params: { state: string } }) {
  const data = await load(params.state);
  if (!data) notFound();
  const { page, ec } = data;
  const tool = getToolSeo('nata-cost-calculator');
  const { state } = page;
  const inState = page.facts.centres;
  const general = NATA_FEES['General/OBC(N-CL)'];

  const where =
    inState.length > 0
      ? `Students from ${state.name} can write it in ${inState.length} test cit${inState.length === 1 ? 'y' : 'ies'} in the state (${inState.slice(0, 4).map((c) => c.label).join(', ')}${inState.length > 4 ? ' and more' : ''}), so travel is usually short.`
      : `${state.name} had no test city, so plan travel to ${page.facts.nearestToCapital.map((n) => `${n.centre.label} (${n.km} km from ${state.capital})`).join(' or ')}.`;

  return (
    <ToolPublicPage
      tool={tool}
      isToolHome={false}
      crumbs={[
        { name: 'Tools', path: '/tools' },
        { name: tool.name, path: tool.path },
        { name: state.name, path: page.path },
      ]}
      h1={`NATA Exam Cost from ${state.name}`}
      answer={`The NATA ${NATA_FEE_YEAR} fee was Rs ${general.toLocaleString('en-IN')} per attempt for General and OBC (NCL) candidates. ${where}`}
      demoTitle="Work out your fee"
      demo={<CostDemo states={demoStates()} centresByState={demoCentresByState(ec.states)} initialState={state.slug} />}
      moreLinks={[
        { href: `${GEO_BASE.examCentres}/${state.slug}`, label: `NATA exam centres in ${state.name}` },
        { href: marketing.coachingState(state.slug), label: `NATA coaching in ${state.name}` },
      ]}
    >
      <Section id="fees" title={`NATA ${NATA_FEE_YEAR} fee per attempt`}>
        <DataTable
          caption="From the NATA brochure"
          head={['Category', 'Fee per attempt']}
          rows={Object.entries(NATA_FEES).map(([k, v]) => [k, `Rs ${v.toLocaleString('en-IN')}`])}
        />
      </Section>
    </ToolPublicPage>
  );
}
