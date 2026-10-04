import type { Metadata } from 'next';
import ToolPublicPage from '@/components/tools/page/ToolPublicPage';
import InsightsDemo from '@/features/tools/insights/InsightsDemo';
import { getToolSeo } from '@/lib/tools/tool-seo';
import { loadCutoffColleges, loadRankBands } from '@/lib/tools/data/loaders';
import { demoInsights } from '@/lib/tools/data/insight-props';
import { SYSTEM_PAGES, systemSlugFor } from '@/lib/tools/data/rank-props';
import { toolPageMetadata } from '@/lib/seo/tool-metadata';

export const revalidate = 86400;

export function generateMetadata(): Metadata {
  const tool = getToolSeo('counseling-insights');
  return toolPageMetadata({ title: tool.title, description: tool.description, path: tool.path, keywords: tool.keywords });
}

export default async function InsightsPage() {
  const tool = getToolSeo('counseling-insights');
  const [colleges, ranks] = await Promise.all([loadCutoffColleges(), loadRankBands()]);
  const systems = demoInsights(colleges, ranks);
  return (
    <ToolPublicPage
      tool={tool}
      crumbs={[
        { name: 'Tools', path: '/tools' },
        { name: tool.name, path: tool.path },
      ]}
      demo={<InsightsDemo systems={systems} />}
      placeLinks={[
        {
          id: 'by-counselling',
          title: 'Insights by counselling',
          links: systems
            .map((s) => systemSlugFor(s.code))
            .filter((s): s is keyof typeof SYSTEM_PAGES => !!s)
            .map((slug) => ({ href: `${tool.path}/${slug}`, label: `${SYSTEM_PAGES[slug].short} B.Arch counselling` })),
        },
      ]}
    />
  );
}
