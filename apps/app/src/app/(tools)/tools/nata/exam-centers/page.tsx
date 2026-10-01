import type { Metadata } from 'next';
import ToolPublicPage from '@/components/tools/page/ToolPublicPage';
import { DataTable, Section } from '@/components/tools/page/parts';
import ExamCentresDemo from '@/features/tools/exam-centers/ExamCentresDemo';
import { getToolSeo } from '@/lib/tools/tool-seo';
import { examCentrePages } from '@/lib/tools/geo-pages';
import { demoCentres, demoCities, demoStates } from '@/lib/tools/data/demo-props';
import { marketing } from '@/lib/tools/marketing-links';
import { toolPageMetadata } from '@/lib/seo/tool-metadata';
import { datasetSchema } from '@/lib/seo/tool-schemas';
import { STATES_BY_NAME } from '@/lib/tools/places';

export const revalidate = 86400;

export function generateMetadata(): Metadata {
  const tool = getToolSeo('nata-exam-centers');
  return toolPageMetadata({ title: tool.title, description: tool.description, path: tool.path, keywords: tool.keywords });
}

export default async function ExamCentresPage() {
  const tool = getToolSeo('nata-exam-centers');
  const { centres, states } = await examCentrePages();
  const india = centres.filter((c) => c.stateSlug !== 'international');
  const abroad = centres.length - india.length;
  const statesWith = states.filter((s) => s.facts.centres.length > 0);
  const year = Math.max(0, ...centres.map((c) => c.year));
  const updated = centres.map((c) => c.updatedAt).filter(Boolean).sort().pop() ?? undefined;

  const answer =
    centres.length > 0
      ? `The NATA ${year} brochure listed ${india.length} test cities in ${statesWith.length} states and union territories${abroad > 0 ? `, plus ${abroad} abroad` : ''}. Pick your state and city below to see the three nearest and how far they are.`
      : tool.answer;

  return (
    <ToolPublicPage
      tool={tool}
      crumbs={[
        { name: 'Tools', path: '/tools' },
        { name: tool.name, path: tool.path },
      ]}
      answer={answer}
      updated={updated}
      demo={<ExamCentresDemo centres={demoCentres(centres)} cities={demoCities()} states={demoStates()} />}
      jsonLd={[
        datasetSchema({
          name: `NATA ${year} test cities in India`,
          description: `Every NATA ${year} test city with its state and location, from the NATA brochure.`,
          path: tool.path,
          dateModified: updated ?? undefined,
          temporalCoverage: String(year),
          spatialCoverage: 'India',
          isBasedOn: 'NATA information brochure, Council of Architecture',
        }),
      ]}
      placeLinks={[
        {
          id: 'by-state',
          title: 'NATA test cities by state',
          links: STATES_BY_NAME.map((s) => {
            const page = states.find((p) => p.state.slug === s.slug)!;
            const n = page.facts.centres.length;
            return { href: page.path, label: s.name, note: n > 0 ? `${n}` : undefined };
          }),
        },
      ]}
      moreLinks={[{ href: marketing.examCentresInfo(), label: 'NATA exam centres: rules and reporting time' }]}
    >
      {statesWith.length > 0 && (
        <Section id="test-cities" title={`NATA ${year} test cities`}>
          <DataTable
            caption={`${india.length} test cities in India, by state`}
            head={['State', 'Test cities', 'Count']}
            rows={statesWith.map((s) => [s.state.name, s.facts.centres.map((c) => c.label).join(', '), s.facts.centres.length])}
          />
        </Section>
      )}
    </ToolPublicPage>
  );
}
