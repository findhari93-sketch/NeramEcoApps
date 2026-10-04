import type { Metadata } from 'next';
import ToolPublicPage from '@/components/tools/page/ToolPublicPage';
import { DataTable, Section } from '@/components/tools/page/parts';
import JosaaDemo, { type DemoJosaa } from '@/features/tools/josaa-predictor/JosaaDemo';
import { getToolSeo } from '@/lib/tools/tool-seo';
import { loadJosaaClosing } from '@/lib/tools/data/loaders';
import { marketing } from '@/lib/tools/marketing-links';
import { toolPageMetadata } from '@/lib/seo/tool-metadata';
import { datasetSchema } from '@/lib/seo/tool-schemas';

export const revalidate = 86400;

export function generateMetadata(): Metadata {
  const tool = getToolSeo('counseling-josaa-predictor');
  return toolPageMetadata({ title: tool.title, description: tool.description, path: tool.path, keywords: tool.keywords });
}

export default async function JosaaPage() {
  const tool = getToolSeo('counseling-josaa-predictor');
  const all = await loadJosaaClosing();
  // Other-state quota for NITs, all-India for the rest: what most students compete in.
  const open = all.filter((r) => r.quota === 'OS' || r.quota === 'AI');
  const best = new Map<string, (typeof open)[number]>();
  for (const r of open) {
    const prev = best.get(r.institute);
    if (!prev || r.closingRank > prev.closingRank) best.set(r.institute, r);
  }
  const rows = [...best.values()].sort((a, b) => a.closingRank - b.closingRank);
  const demo: DemoJosaa[] = rows.map((r) => [r.institute, r.type ?? '', r.state ?? '', r.closingRank]);
  const year = rows[0]?.year ?? 0;
  const round = rows[0]?.round ?? 0;

  return (
    <ToolPublicPage
      tool={tool}
      crumbs={[
        { name: 'Tools', path: '/tools' },
        { name: tool.name, path: tool.path },
      ]}
      answer={rows.length > 0 ? `${tool.answer} In JoSAA ${year}, ${rows.length} institutes offered B.Arch; the open category, other-state closing ranks in round ${round} ran from ${rows[0].closingRank.toLocaleString('en-IN')} to ${rows[rows.length - 1].closingRank.toLocaleString('en-IN')}.` : tool.answer}
      demo={<JosaaDemo rows={demo} year={year} round={round} />}
      jsonLd={
        rows.length > 0
          ? [datasetSchema({ name: `JoSAA ${year} B.Arch closing ranks`, description: `Final round closing ranks for B.Arch at JoSAA institutes, open category, ${year}.`, path: tool.path, temporalCoverage: String(year), isBasedOn: 'https://josaa.nic.in' })]
          : []
      }
      moreLinks={[{ href: marketing.josaa(), label: 'JoSAA B.Arch counselling guide' }]}
    >
      {rows.length > 0 && (
        <Section id="closing" title={`JoSAA ${year} B.Arch closing ranks`}>
          <DataTable
            caption={`Round ${round}, open category, gender-neutral, other-state or all-India quota`}
            head={['Institute', 'Type', 'Closing rank']}
            rows={rows.map((r) => [r.institute, r.type ?? '', r.closingRank.toLocaleString('en-IN')])}
          />
        </Section>
      )}
    </ToolPublicPage>
  );
}
