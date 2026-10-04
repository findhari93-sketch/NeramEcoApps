import type { Metadata } from 'next';
import ToolPublicPage from '@/components/tools/page/ToolPublicPage';
import { DataTable, Section } from '@/components/tools/page/parts';
import CutoffDemo from '@/features/tools/cutoff-calculator/CutoffDemo';
import { BOARD_CONFIG, type BoardType } from '@/lib/tools/cutoff-formula';
import { getToolSeo } from '@/lib/tools/tool-seo';
import { toolPageMetadata } from '@/lib/seo/tool-metadata';
import { MARKETING_URL } from '@/lib/seo/constants';

export const revalidate = 86400;

export function generateMetadata(): Metadata {
  const tool = getToolSeo('nata-cutoff-calculator');
  return toolPageMetadata({ title: tool.title, description: tool.description, path: tool.path, keywords: tool.keywords });
}

/** Worked examples: 85% in each board's usual maximum plus a NATA score of 110. */
const EXAMPLE_BOARDS: BoardType[] = ['CBSE', 'TN_STATE', 'KA_PUC', 'KERALA_HSE', 'MAHARASHTRA_HSC'];

export default function CutoffCalculatorPage() {
  const tool = getToolSeo('nata-cutoff-calculator');
  const rows = EXAMPLE_BOARDS.map((b) => {
    const { label, maxMarks } = BOARD_CONFIG[b];
    const scored = Math.round(maxMarks * 0.85);
    const board200 = Math.round((scored / maxMarks) * 200 * 100) / 100;
    return [label, `${scored} of ${maxMarks}`, board200, 110, Math.round((board200 + 110) * 100) / 100];
  });

  return (
    <ToolPublicPage
      tool={tool}
      crumbs={[
        { name: 'Tools', path: '/tools' },
        { name: tool.name, path: tool.path },
      ]}
      demo={<CutoffDemo />}
      moreLinks={[
        { href: `${MARKETING_URL}/nata-cutoff-trends-2015-2025`, label: 'NATA cutoff trends, 2015 to 2025' },
        { href: `${MARKETING_URL}/colleges`, label: 'B.Arch colleges across India' },
      ]}
    >
      <Section id="examples" title="Worked examples by board">
        <DataTable
          caption="85% in 12th plus a NATA score of 110 out of 200"
          head={['Board', '12th marks', 'Board out of 200', 'NATA score', 'Cutoff out of 400']}
          rows={rows}
        />
      </Section>
    </ToolPublicPage>
  );
}
