import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import ExamSpokeLayout from '@/components/exam-hub/sections/ExamSpokeLayout';
import { GuideNote } from '@/components/exam-hub/sections/GuideBlocks';
import { buildAlternates } from '@/lib/seo/metadata';
import { PGETA_NOTABLE_INSTITUTES } from '@/components/pgeta/data/pgetaContent';
import { ArticleSection, CheckList, CtaButton } from '@/design-system';

export const revalidate = 86400;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'PGETA 2026 Participating Institutes: 132 COA-Approved M.Arch Programs',
    description:
      'COA lists approximately 132 approved Master of Architecture programs that admit through PGETA 2026 scores. Notable institutions include Chandigarh College of Architecture, KRVIA Mumbai, MSAP Manipal, Rizvi College of Architecture, and Nirma University.',
    keywords:
      'PGETA participating institutes, PGEAT colleges, M.Arch colleges India, COA approved M.Arch list, PGETA accepting colleges',
    alternates: buildAlternates(locale, '/pgeta-2026/participating-institutes'),
  };
}

export default function PgetaParticipatingInstitutesPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <ExamSpokeLayout
      examName="PGETA 2026"
      examShortName="PGETA 2026"
      examHubHref="/pgeta-2026"
      spokeSlug="participating-institutes"
      topicTitle="PGETA 2026 participating institutes"
      topicSubtitle="COA lists approximately 132 approved Master of Architecture programs (as of 2022-23) that admit through PGETA scores. The complete list is on the COA approved-institutions page."
      related={[
        { label: 'Eligibility', href: '/pgeta-2026/eligibility' },
        { label: 'Score validity', href: '/pgeta-2026/score-validity' },
        { label: 'Fees + scholarship', href: '/pgeta-2026/fees' },
      ]}
    >
      <ArticleSection id="notable-institutions" title="Notable accepting institutions">
        <CheckList items={PGETA_NOTABLE_INSTITUTES} columnMin={300} />
        <div>
          <CtaButton variant="outline" size="md" href="https://www.coa.gov.in/pgInstitutionStatus.php" external>
            View full COA-approved list
          </CtaButton>
        </div>
      </ArticleSection>

      <ArticleSection
        id="specialisations"
        title="Specialisations available"
        intro="COA-approved M.Arch programs offer a range of specialisations. Confirm the specific tracks at each shortlisted institute before applying:"
      >
        <CheckList
          items={[
            'Urban Design',
            'Sustainable Architecture / Green Building',
            'Landscape Architecture',
            'Construction Management',
            'Heritage Conservation',
            'Interior Design',
            'Environmental Architecture',
            'Architectural and Settlement Conservation',
          ]}
        />
      </ArticleSection>

      <GuideNote title="How to verify acceptance">
        <CheckList
          variant="compact"
          items={[
            'Confirm COA approval at coa.gov.in/pgInstitutionStatus.php.',
            "Check the institute's M.Arch admission notification for the year. Some institutions also accept GATE scores or institution-specific test scores alongside PGETA.",
            'State governments may run parallel CETs (Maharashtra, for instance). Check state portals if you target a specific state.',
            'Email or call the M.Arch coordinator at your shortlisted institute to confirm PGETA cut-off and admission process for the cycle.',
          ]}
        />
      </GuideNote>
    </ExamSpokeLayout>
  );
}
