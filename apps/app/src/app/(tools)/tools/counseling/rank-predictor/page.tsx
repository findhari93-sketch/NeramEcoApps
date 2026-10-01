import type { Metadata } from 'next';
import ToolPublicPage from '@/components/tools/page/ToolPublicPage';
import RankDemo from '@/features/tools/rank-predictor/RankDemo';
import { getToolSeo } from '@/lib/tools/tool-seo';
import { loadRankBands } from '@/lib/tools/data/loaders';
import { demoRankSystems, systemSlugFor, SYSTEM_PAGES } from '@/lib/tools/data/rank-props';
import { toolPageMetadata } from '@/lib/seo/tool-metadata';

export const revalidate = 86400;

export function generateMetadata(): Metadata {
  const tool = getToolSeo('counseling-rank-predictor');
  return toolPageMetadata({ title: tool.title, description: tool.description, path: tool.path, keywords: tool.keywords });
}

export default async function RankPredictorPage() {
  const tool = getToolSeo('counseling-rank-predictor');
  const systems = await loadRankBands();
  return (
    <ToolPublicPage
      tool={tool}
      crumbs={[
        { name: 'Tools', path: '/tools' },
        { name: tool.name, path: tool.path },
      ]}
      demo={<RankDemo systems={demoRankSystems(systems)} />}
      placeLinks={[
        {
          id: 'by-counselling',
          title: 'Rank predictor by counselling',
          links: systems
            .map((s) => systemSlugFor(s.code))
            .filter((s): s is keyof typeof SYSTEM_PAGES => !!s)
            .map((slug) => ({ href: `${tool.path}/${slug}`, label: `${SYSTEM_PAGES[slug].short} B.Arch rank predictor` })),
        },
      ]}
    />
  );
}
