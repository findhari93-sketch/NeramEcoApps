import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ToolPublicPage from '@/components/tools/page/ToolPublicPage';
import { DataTable, Section } from '@/components/tools/page/parts';
import InsightsDemo from '@/features/tools/insights/InsightsDemo';
import { getToolSeo } from '@/lib/tools/tool-seo';
import { loadCutoffColleges, loadRankBands } from '@/lib/tools/data/loaders';
import { demoInsights } from '@/lib/tools/data/insight-props';
import { SYSTEM_PAGES, type SystemSlug } from '@/lib/tools/data/rank-props';
import { GEO_BASE } from '@/lib/tools/geo-pages';
import { toolPageMetadata } from '@/lib/seo/tool-metadata';

export const revalidate = 86400;
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(SYSTEM_PAGES).map((system) => ({ system }));
}

async function load(slug: string) {
  if (!(slug in SYSTEM_PAGES)) return null;
  const meta = SYSTEM_PAGES[slug as SystemSlug];
  const [colleges, ranks] = await Promise.all([loadCutoffColleges(), loadRankBands()]);
  const insight = demoInsights(colleges, ranks).find((s) => s.code === meta.code) ?? null;
  const list = colleges.filter((c) => c.system === meta.code);
  return { meta, insight, list };
}

export async function generateMetadata({ params }: { params: { system: string } }): Promise<Metadata> {
  const data = await load(params.system);
  if (!data) return {};
  const tool = getToolSeo('counseling-insights');
  return toolPageMetadata({
    title: `${data.meta.short} B.Arch Counselling ${data.insight?.year ?? ''}: Seats and Cutoffs`.replace(/\s+/g, ' ').slice(0, 60),
    description: `${data.meta.short} B.Arch ${data.insight?.year ?? ''}: how many students were ranked, how many got seats and which colleges filled first, from the official lists.`,
    path: `${tool.path}/${params.system}`,
    index: !!data.insight,
  });
}

export default async function InsightsSystemPage({ params }: { params: { system: string } }) {
  const data = await load(params.system);
  if (!data) notFound();
  const { meta, insight, list } = data;
  const tool = getToolSeo('counseling-insights');
  const path = `${tool.path}/${params.system}`;
  const byMark = meta.code === 'TNEA_BARCH';

  const parts = insight
    ? [
        insight.rankList != null ? `${insight.rankList.toLocaleString('en-IN')} students were on the rank list` : null,
        insight.allotted != null ? `${insight.allotted.toLocaleString('en-IN')} B.Arch seats were allotted` : null,
        `across ${insight.colleges} colleges`,
      ].filter(Boolean)
    : [];

  return (
    <ToolPublicPage
      tool={tool}
      isToolHome={false}
      crumbs={[
        { name: 'Tools', path: '/tools' },
        { name: tool.name, path: tool.path },
        { name: meta.short, path },
      ]}
      h1={`${meta.short} B.Arch Counselling Insights`}
      answer={
        insight
          ? `In ${meta.short} B.Arch ${insight.year}, ${parts.join(', ')}. ${insight.first[0] ? `${insight.first[0][0]} filled first (${insight.first[0][1]}).` : ''}`
          : `${meta.short} B.Arch allotment data is not available right now.`
      }
      demoTitle={`${meta.short} at a glance`}
      demo={insight ? <InsightsDemo systems={[insight]} /> : <p>Data is not available right now.</p>}
      moreLinks={[
        { href: `/tools/counseling/rank-predictor/${params.system}`, label: `${meta.short} B.Arch rank predictor` },
        { href: `${GEO_BASE.collegePredictor}/${meta.stateSlug}`, label: `B.Arch college predictor for ${meta.stateName}` },
      ]}
    >
      {list.length > 0 && (
        <Section id="colleges" title={`${meta.short} ${insight?.year ?? ''} by college`}>
          <DataTable
            caption={byMark ? 'Seats allotted and the lowest open (OC) mark out of 400' : 'Last State Merit rank allotted'}
            head={byMark ? ['College', 'Place', 'Seats', 'Closing marks'] : ['College', 'Place', 'Closing rank']}
            rows={[...list]
              .sort((a, b) => (byMark ? (b.closingMarks?.OC ?? 0) - (a.closingMarks?.OC ?? 0) : (a.closingRank ?? 0) - (b.closingRank ?? 0)))
              .map((c) => (byMark ? [c.name, c.city ?? c.district ?? '', c.seats ?? '', c.closingMarks?.OC ?? ''] : [c.name, c.city ?? c.district ?? '', c.closingRank ?? '']))}
          />
        </Section>
      )}
    </ToolPublicPage>
  );
}
