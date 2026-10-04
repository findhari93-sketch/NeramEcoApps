import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ToolPublicPage from '@/components/tools/page/ToolPublicPage';
import { DataTable, Section } from '@/components/tools/page/parts';
import RankDemo from '@/features/tools/rank-predictor/RankDemo';
import { getToolSeo } from '@/lib/tools/tool-seo';
import { loadRankBands } from '@/lib/tools/data/loaders';
import { demoRankSystems, SYSTEM_PAGES, type SystemSlug } from '@/lib/tools/data/rank-props';
import { GEO_BASE } from '@/lib/tools/geo-pages';
import { toolPageMetadata } from '@/lib/seo/tool-metadata';
import { datasetSchema } from '@/lib/seo/tool-schemas';
import { nataCycleYear } from '@/lib/tools/cycle';

export const revalidate = 86400;
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(SYSTEM_PAGES).map((system) => ({ system }));
}

async function load(slug: string) {
  if (!(slug in SYSTEM_PAGES)) return null;
  const meta = SYSTEM_PAGES[slug as SystemSlug];
  const sys = (await loadRankBands()).find((s) => s.code === meta.code);
  return { meta, sys: sys ?? null };
}

export async function generateMetadata({ params }: { params: { system: string } }): Promise<Metadata> {
  const data = await load(params.system);
  if (!data) return {};
  const tool = getToolSeo('counseling-rank-predictor');
  return toolPageMetadata({
    title: `${data.meta.short} B.Arch Rank Predictor ${nataCycleYear()}: Mark to Rank`,
    description: `Estimate your ${data.meta.short} B.Arch rank from your cutoff out of 400, using the real ${data.sys?.year ?? ''} rank list. Free ${data.meta.short} rank predictor.`,
    path: `${tool.path}/${params.system}`,
    index: !!data.sys && data.sys.bands.length > 0,
  });
}

export default async function RankSystemPage({ params }: { params: { system: string } }) {
  const data = await load(params.system);
  if (!data) notFound();
  const { meta, sys } = data;
  const tool = getToolSeo('counseling-rank-predictor');
  const path = `${tool.path}/${params.system}`;
  const top = sys?.bands[0];

  return (
    <ToolPublicPage
      tool={tool}
      isToolHome={false}
      crumbs={[
        { name: 'Tools', path: '/tools' },
        { name: tool.name, path: tool.path },
        { name: meta.short, path },
      ]}
      h1={`${meta.short} B.Arch Rank Predictor`}
      answer={
        sys && top
          ? `The ${meta.short} B.Arch ${sys.year} rank list had ${sys.total.toLocaleString('en-IN')} students. Those with ${top.from} or more out of 400 ranked in the top ${top.worstRank.toLocaleString('en-IN')}. Enter your cutoff to see the rank range for your mark.`
          : `${meta.short} B.Arch rank list data is not available right now.`
      }
      demoTitle={`Estimate your ${meta.short} rank`}
      demo={sys ? <RankDemo systems={demoRankSystems([sys])} /> : <p>Rank list data is not available right now.</p>}
      jsonLd={sys ? [datasetSchema({ name: `${meta.short} B.Arch ${sys.year} marks and ranks`, description: `Rank ranges by 10-mark band from the ${meta.short} B.Arch ${sys.year} rank list.`, path, temporalCoverage: String(sys.year), spatialCoverage: meta.stateName })] : []}
      moreLinks={[
        { href: `${GEO_BASE.collegePredictor}/${meta.stateSlug}`, label: `B.Arch college predictor for ${meta.stateName}` },
        { href: `/tools/counseling/insights/${params.system}`, label: `${meta.short} B.Arch counselling insights` },
      ]}
    >
      {sys && sys.bands.length > 0 && (
        <Section id="bands" title={`${meta.short} ${sys.year}: marks and ranks`}>
          <DataTable
            caption="Rank range of students in each mark band (out of 400)"
            head={['Marks', 'Best rank', 'Last rank', 'Students count']}
            rows={sys.bands.map((b) => [`${b.from} to ${b.to}`, b.bestRank.toLocaleString('en-IN'), b.worstRank.toLocaleString('en-IN'), b.count])}
          />
        </Section>
      )}
    </ToolPublicPage>
  );
}
