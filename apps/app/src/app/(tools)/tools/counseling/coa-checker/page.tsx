import type { Metadata } from 'next';
import ToolPublicPage from '@/components/tools/page/ToolPublicPage';
import { DataTable, Section } from '@/components/tools/page/parts';
import CoaDemo from '@/features/tools/coa-checker/CoaDemo';
import { getToolSeo } from '@/lib/tools/tool-seo';
import { coaPages } from '@/lib/tools/geo-pages';
import { demoCoa } from '@/lib/tools/data/demo-props';
import { marketing } from '@/lib/tools/marketing-links';
import { toolPageMetadata } from '@/lib/seo/tool-metadata';
import { datasetSchema } from '@/lib/seo/tool-schemas';
import { formatDate } from '@/components/tools/page/parts';

export const revalidate = 86400;

export function generateMetadata(): Metadata {
  const tool = getToolSeo('counseling-coa-checker');
  return toolPageMetadata({ title: tool.title, description: tool.description, path: tool.path, keywords: tool.keywords });
}

export default async function CoaCheckerPage() {
  const tool = getToolSeo('counseling-coa-checker');
  const { coa, states } = await coaPages();
  const checkedAt = coa.map((c) => c.checkedAt).filter(Boolean).sort().pop() ?? undefined;
  const intake = coa.reduce((n, c) => n + (c.intake ?? 0), 0);

  const answer =
    coa.length > 0
      ? `The Council of Architecture list we last read${checkedAt ? ` on ${formatDate(checkedAt)}` : ''} has ${coa.length} B.Arch institutions in ${states.length} states and union territories, with ${intake.toLocaleString('en-IN')} seats a year. Only a B.Arch from a COA approved college lets you register as an architect.`
      : tool.answer;

  return (
    <ToolPublicPage
      tool={tool}
      crumbs={[
        { name: 'Tools', path: '/tools' },
        { name: tool.name, path: tool.path },
      ]}
      answer={answer}
      updated={checkedAt}
      demo={<CoaDemo colleges={demoCoa(coa)} />}
      jsonLd={[
        datasetSchema({
          name: 'COA approved B.Arch institutions in India',
          description: 'Institutions on the Council of Architecture list, with city, state and sanctioned intake.',
          path: tool.path,
          dateModified: checkedAt,
          spatialCoverage: 'India',
          isBasedOn: 'https://www.coa.gov.in',
        }),
      ]}
      placeLinks={[{ id: 'by-state', title: 'COA approved colleges by state', links: states.map((s) => ({ href: s.path, label: s.state.name, note: `${s.facts.colleges.length}` })) }]}
      moreLinks={[{ href: marketing.allColleges(), label: 'Compare B.Arch colleges: fees, cutoffs, placements' }]}
    >
      {states.length > 0 && (
        <Section id="by-state-table" title="Approved B.Arch institutions by state">
          <DataTable
            caption="Count and yearly intake, from the COA list"
            head={['State', 'Institutions count', 'Intake seats']}
            rows={[...states]
              .sort((a, b) => b.facts.colleges.length - a.facts.colleges.length)
              .map((s) => [s.state.name, s.facts.colleges.length, s.facts.colleges.reduce((n, c) => n + (c.intake ?? 0), 0)])}
          />
        </Section>
      )}
    </ToolPublicPage>
  );
}
