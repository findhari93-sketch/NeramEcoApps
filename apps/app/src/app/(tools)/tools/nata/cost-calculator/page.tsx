import type { Metadata } from 'next';
import ToolPublicPage from '@/components/tools/page/ToolPublicPage';
import { DataTable, Section } from '@/components/tools/page/parts';
import CostDemo from '@/features/tools/cost-calculator/CostDemo';
import { getToolSeo } from '@/lib/tools/tool-seo';
import { costPages, examCentrePages } from '@/lib/tools/geo-pages';
import { demoCentresByState, demoStates } from '@/lib/tools/data/demo-props';
import { NATA_FEES, NATA_FEE_YEAR } from '@/lib/tools/nata-fees';
import { toolPageMetadata } from '@/lib/seo/tool-metadata';

export const revalidate = 86400;

export function generateMetadata(): Metadata {
  const tool = getToolSeo('nata-cost-calculator');
  return toolPageMetadata({ title: tool.title, description: tool.description, path: tool.path, keywords: tool.keywords });
}

export default async function CostCalculatorPage() {
  const tool = getToolSeo('nata-cost-calculator');
  const [{ states }, pages] = await Promise.all([examCentrePages(), costPages()]);

  return (
    <ToolPublicPage
      tool={tool}
      crumbs={[
        { name: 'Tools', path: '/tools' },
        { name: tool.name, path: tool.path },
      ]}
      demo={<CostDemo states={demoStates()} centresByState={demoCentresByState(states)} />}
      placeLinks={[{ id: 'by-state', title: 'NATA cost by state', links: pages.filter((p) => p.gate.index).map((p) => ({ href: p.path, label: p.state.name })) }]}
    >
      <Section id="fees" title={`NATA ${NATA_FEE_YEAR} application fee`}>
        <DataTable
          caption="Per attempt, from the NATA brochure"
          head={['Category', 'Fee per attempt', 'Two attempts fee']}
          rows={Object.entries(NATA_FEES).map(([k, v]) => [k, `Rs ${v.toLocaleString('en-IN')}`, `Rs ${(v * 2).toLocaleString('en-IN')}`])}
        />
      </Section>
    </ToolPublicPage>
  );
}
