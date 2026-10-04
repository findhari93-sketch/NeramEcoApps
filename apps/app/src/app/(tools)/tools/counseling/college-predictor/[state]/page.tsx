import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ToolPublicPage from '@/components/tools/page/ToolPublicPage';
import { DataTable, Section } from '@/components/tools/page/parts';
import CollegePredictorDemo from '@/features/tools/college-predictor/CollegePredictorDemo';
import { getToolSeo } from '@/lib/tools/tool-seo';
import { GEO_BASE, indexedCities, predictorPages } from '@/lib/tools/geo-pages';
import { demoSystems } from '@/lib/tools/data/predictor-props';
import { marketing } from '@/lib/tools/marketing-links';
import { toolPageMetadata } from '@/lib/seo/tool-metadata';
import { itemListSchema } from '@/lib/seo/tool-schemas';
import { nataCycleYear } from '@/lib/tools/cycle';
import type { CutoffCollege } from '@/lib/tools/data/facts';

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  const { states } = await predictorPages();
  return states.map((s) => ({ state: s.state.slug }));
}

async function load(stateSlug: string) {
  const data = await predictorPages();
  const page = data.states.find((s) => s.state.slug === stateSlug);
  return page ? { page, ...data } : null;
}

const closing = (c: CutoffCollege) => (c.system === 'TNEA_BARCH' ? c.closingMarks?.OC : c.closingRank);

export async function generateMetadata({ params }: { params: { state: string } }): Promise<Metadata> {
  const data = await load(params.state);
  if (!data) return {};
  const { page } = data;
  const n = page.facts.colleges.length;
  return toolPageMetadata({
    title: `B.Arch College Predictor ${page.state.name} ${nataCycleYear()}`.slice(0, 60),
    description:
      n > 0
        ? `See the ${n} B.Arch colleges in ${page.state.name} you can get with your score, from last year's real closing marks and ranks.`
        : `B.Arch counselling in ${page.state.name}: ${page.facts.coaCount} COA approved colleges, how admission works and where to check your chances.`,
    path: page.path,
    index: page.gate.index,
  });
}

export default async function PredictorStatePage({ params }: { params: { state: string } }) {
  const data = await load(params.state);
  if (!data) notFound();
  const { page, cities, colleges } = data;
  const tool = getToolSeo('counseling-college-predictor');
  const { state } = page;
  const list = [...page.facts.colleges].sort((a, b) => (a.system === 'TNEA_BARCH' ? (closing(b) ?? 0) - (closing(a) ?? 0) : (closing(a) ?? 0) - (closing(b) ?? 0)));
  const systems = demoSystems(colleges, state.slug);
  const byMark = list[0]?.system === 'TNEA_BARCH';
  const year = list[0]?.year;

  const answer =
    list.length > 0
      ? `${list.length} B.Arch colleges in ${state.name} have published ${byMark ? 'closing marks' : 'closing ranks'} from ${year}. Enter your ${byMark ? 'cutoff out of 400' : 'rank'} to see which ones you would have got.`
      : `We do not have published allotment data for B.Arch counselling in ${state.name} yet. ${state.name} has ${page.facts.coaCount} COA approved B.Arch college${page.facts.coaCount === 1 ? '' : 's'}; for NITs and SPAs use the JoSAA predictor.`;

  return (
    <ToolPublicPage
      tool={tool}
      isToolHome={false}
      crumbs={[
        { name: 'Tools', path: '/tools' },
        { name: tool.name, path: tool.path },
        { name: state.name, path: page.path },
      ]}
      h1={`B.Arch College Predictor for ${state.name}`}
      answer={answer}
      demoTitle={systems.length > 0 ? `Check your chances in ${state.name}` : 'Try the predictor'}
      demo={<CollegePredictorDemo systems={systems.length > 0 ? systems : demoSystems(colleges)} />}
      jsonLd={list.length > 0 ? [itemListSchema(`B.Arch colleges in ${state.name} with closing ${byMark ? 'marks' : 'ranks'}`, list.map((c) => ({ name: c.name })))] : []}
      placeLinks={[
        {
          id: 'cities',
          title: `By city in ${state.name}`,
          links: indexedCities(cities, state.slug).map((c) => ({ href: c.path, label: c.city.name })),
        },
      ]}
      moreLinks={[
        { href: marketing.collegesState(state.slug), label: `B.Arch colleges in ${state.name}: fees and details` },
        { href: `${GEO_BASE.coaChecker}/${state.slug}`, label: `COA approved colleges in ${state.name}` },
      ]}
    >
      {list.length > 0 && (
        <Section id="closing" title={`${year} closing ${byMark ? 'marks' : 'ranks'} in ${state.name}`}>
          <DataTable
            caption={byMark ? 'Lowest mark out of 400 allotted in the open (OC) category' : 'Last State Merit rank allotted'}
            head={['College', 'Place', byMark ? 'Closing marks' : 'Closing rank']}
            rows={list.map((c) => [c.name, c.city ?? c.district ?? '', closing(c) ?? ''])}
          />
        </Section>
      )}
    </ToolPublicPage>
  );
}
