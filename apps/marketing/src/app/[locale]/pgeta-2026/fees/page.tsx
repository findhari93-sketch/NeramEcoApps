import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import ExamSpokeLayout from '@/components/exam-hub/sections/ExamSpokeLayout';
import { GuideP } from '@/components/exam-hub/sections/GuideBlocks';
import { buildAlternates } from '@/lib/seo/metadata';
import { PGETA_FEES, PGETA_SCHOLARSHIP } from '@/components/pgeta/data/pgetaContent';
import { ArticleSection, CheckList, DataTable, FactGrid, TopicCard } from '@/design-system';

export const revalidate = 86400;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'PGETA 2026 Fees and Scholarships: Rs 1,750 to Rs 1,000 per Attempt',
    description:
      'PGETA 2026 registration fee: Rs 1,750 (General/OBC), Rs 1,250 (SC/ST/EWS/PwD), Rs 1,000 (Transgender). COA awards a Rs 50,000 scholarship over two years to top-100 scorers admitted to COA-approved M.Arch programs.',
    keywords:
      'PGETA fees, PGEAT fees, PGETA registration fee, PGETA scholarship, COA M.Arch scholarship, top 100 PGETA',
    alternates: buildAlternates(locale, '/pgeta-2026/fees'),
  };
}

export default function PgetaFeesPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <ExamSpokeLayout
      examName="PGETA 2026"
      examShortName="PGETA 2026"
      examHubHref="/pgeta-2026"
      spokeSlug="fees"
      topicTitle="PGETA 2026 fees and scholarships"
      topicSubtitle="Per-attempt fees vary by category. Each of the three test dates needs a separate registration. COA also funds a top-100 scholarship for admitted candidates."
      related={[
        { label: 'Schedule', href: '/pgeta-2026/schedule' },
        { label: 'Eligibility', href: '/pgeta-2026/eligibility' },
        { label: 'Participating institutes', href: '/pgeta-2026/participating-institutes' },
      ]}
    >
      <ArticleSection id="registration-fees" title="Registration fees, per attempt">
        <DataTable
          caption="PGETA 2026 registration fee by category"
          hideCaption
          columns={['Category', 'Fee']}
          rows={PGETA_FEES.map((fee) => [fee.category, fee.amount])}
        />
        <GuideP muted>
          Payment online via debit card, credit card, or net banking. Each of the three test dates requires a separate fee.
        </GuideP>
      </ArticleSection>

      <ArticleSection id="scholarship" eyebrow="Scholarship" title={PGETA_SCHOLARSHIP.title}>
        <FactGrid items={[{ label: 'Amount', value: PGETA_SCHOLARSHIP.amount }]} />
        <TopicCard title="Conditions" items={PGETA_SCHOLARSHIP.conditions} />
      </ArticleSection>

      <ArticleSection id="total-cost" title="Total cost planning">
        <CheckList
          columnMin={600}
          items={[
            'One attempt at General/OBC fee: Rs 1,750.',
            'Three attempts (recommended for serious candidates): up to Rs 5,250 in fees.',
            'Add travel and accommodation if your CBT centre is in another city.',
            'Top-100 scholarship offsets two years of M.Arch tuition for high scorers.',
            'Many M.Arch programs also offer institution-level merit waivers; check each shortlisted college.',
          ]}
        />
      </ArticleSection>
    </ExamSpokeLayout>
  );
}
