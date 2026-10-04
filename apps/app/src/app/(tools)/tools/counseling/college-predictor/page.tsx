import type { Metadata } from 'next';
import ToolPublicPage from '@/components/tools/page/ToolPublicPage';
import { DataTable, Section } from '@/components/tools/page/parts';
import CollegePredictorDemo from '@/features/tools/college-predictor/CollegePredictorDemo';
import { getToolSeo } from '@/lib/tools/tool-seo';
import { predictorPages } from '@/lib/tools/geo-pages';
import { demoSystems } from '@/lib/tools/data/predictor-props';
import { marketing } from '@/lib/tools/marketing-links';
import { toolPageMetadata } from '@/lib/seo/tool-metadata';
import { datasetSchema } from '@/lib/seo/tool-schemas';

export const revalidate = 86400;

export function generateMetadata(): Metadata {
  const tool = getToolSeo('counseling-college-predictor');
  return toolPageMetadata({ title: tool.title, description: tool.description, path: tool.path, keywords: tool.keywords });
}

export default async function CollegePredictorPage() {
  const tool = getToolSeo('counseling-college-predictor');
  const { colleges, states } = await predictorPages();
  const systems = demoSystems(colleges);
  const withData = states.filter((s) => s.gate.index);

  return (
    <ToolPublicPage
      tool={tool}
      crumbs={[
        { name: 'Tools', path: '/tools' },
        { name: tool.name, path: tool.path },
      ]}
      demo={<CollegePredictorDemo systems={systems} />}
      jsonLd={systems.map((s) =>
        datasetSchema({
          name: `${s.label} B.Arch closing marks and ranks ${s.year}`,
          description: `Last mark or rank allotted at each B.Arch college in ${s.label} ${s.year}, open category.`,
          path: tool.path,
          temporalCoverage: String(s.year),
          isBasedOn: `${s.label} official allotment list`,
        })
      )}
      placeLinks={[
        {
          id: 'by-state',
          title: 'College predictor by state',
          links: states.map((s) => ({ href: s.path, label: s.state.name, note: s.facts.colleges.length > 0 ? `${s.facts.colleges.length} colleges` : undefined })),
        },
      ]}
      moreLinks={[
        { href: marketing.allColleges(), label: 'B.Arch colleges across India' },
        { href: marketing.tnea(), label: 'TNEA B.Arch counselling guide' },
      ]}
    >
      {withData.length > 0 && (
        <Section id="coverage" title="Counselling covered">
          <DataTable
            caption="Counselling with published allotment data, latest year"
            head={['Counselling', 'Year', 'Colleges']}
            rows={systems.map((s) => [s.label, s.year, s.colleges.length])}
          />
        </Section>
      )}
    </ToolPublicPage>
  );
}

