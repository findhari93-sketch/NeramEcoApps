import type { Metadata } from 'next';
import ToolPublicPage from '@/components/tools/page/ToolPublicPage';
import { DataTable, Section } from '@/components/tools/page/parts';
import EligibilityDemo from '@/features/tools/eligibility-checker/EligibilityDemo';
import { getToolSeo } from '@/lib/tools/tool-seo';
import { toolPageMetadata } from '@/lib/seo/tool-metadata';
import { MARKETING_URL } from '@/lib/seo/constants';

export const revalidate = 86400;

export function generateMetadata(): Metadata {
  const tool = getToolSeo('nata-eligibility-checker');
  return toolPageMetadata({ title: tool.title, description: tool.description, path: tool.path, keywords: tool.keywords });
}

export default function EligibilityCheckerPage() {
  const tool = getToolSeo('nata-eligibility-checker');
  return (
    <ToolPublicPage
      tool={tool}
      crumbs={[
        { name: 'Tools', path: '/tools' },
        { name: tool.name, path: tool.path },
      ]}
      demo={<EligibilityDemo />}
      moreLinks={[
        { href: `${MARKETING_URL}/nata-2026/eligibility`, label: 'NATA eligibility explained' },
        { href: `${MARKETING_URL}/counseling/concepts/eligibility-45-vs-50-rule`, label: 'The 45% and 50% rules in counselling' },
      ]}
    >
      <Section id="rules" title="The rules at a glance">
        <DataTable
          caption="Council of Architecture rules for B.Arch admission"
          head={['Route', 'Subjects', 'Minimum marks']}
          rows={[
            ['12th (10+2)', 'Physics and Mathematics, plus one of Chemistry, Biology, Computer Science, IT, Informatics Practices, Engineering Graphics, Business Studies or a technical vocational subject', '45% aggregate'],
            ['10+3 Diploma', 'Mathematics as a subject', '45% aggregate'],
          ]}
        />
      </Section>
    </ToolPublicPage>
  );
}
