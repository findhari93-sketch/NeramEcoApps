import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import ExamSpokeLayout from '@/components/exam-hub/sections/ExamSpokeLayout';
import { GuideNote, GuideP } from '@/components/exam-hub/sections/GuideBlocks';
import { buildAlternates } from '@/lib/seo/metadata';
import { ArticleSection, CheckList } from '@/design-system';

export const revalidate = 86400;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'PGETA 2026 Score Validity, Result Format, and How Admissions Use It',
    description:
      'PGETA 2026 results are declared as percentile scores on July 7, 2026. Score is valid for the 2026-2027 admission cycle. Validity beyond one cycle depends on the participating institute. How M.Arch programs use PGETA scores.',
    keywords:
      'PGETA score validity, PGEAT result format, PGETA percentile, M.Arch admission process, PGETA cut-off',
    alternates: buildAlternates(locale, '/pgeta-2026/score-validity'),
  };
}

export default function PgetaScoreValidityPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <ExamSpokeLayout
      examName="PGETA 2026"
      examShortName="PGETA 2026"
      examHubHref="/pgeta-2026"
      spokeSlug="score-validity"
      topicTitle="PGETA 2026 score validity and result format"
      topicSubtitle="Results are declared on July 7, 2026 as percentile scores. The best score across your attempts is retained automatically. Validity is one academic year, with institute-specific extensions."
      related={[
        { label: 'Schedule', href: '/pgeta-2026/schedule' },
        { label: 'Participating institutes', href: '/pgeta-2026/participating-institutes' },
        { label: 'Eligibility', href: '/pgeta-2026/eligibility' },
      ]}
    >
      <ArticleSection id="result-format" title="Result format">
        <CheckList
          columnMin={600}
          items={[
            'Final results: July 7, 2026, on the PGETA portal.',
            'Format: percentile score, computed across all candidates who attempted any of the three tests.',
            'The system automatically retains your best score across the attempts you took.',
            'The exact percentile calculation method is detailed in the PGETA Information Brochure; verify before exam day.',
            'There is no national rank list. Each participating institute applies its own cut-off and ranking when admitting.',
          ]}
        />
      </ArticleSection>

      <ArticleSection
        id="score-validity"
        title="Score validity"
        intro="A PGETA 2026 score is valid for the 2026-2027 admission cycle by default. Some institutions accept the score for two cycles (2026-27 and 2027-28); this is at each institute's discretion and not centrally guaranteed. If you plan to defer admission by a year, confirm acceptance with the target M.Arch program before the deadline."
      />

      <GuideNote title="How M.Arch programs use PGETA scores">
        <CheckList
          variant="compact"
          items={[
            'Most COA-approved M.Arch programs use PGETA percentile as the primary admission filter.',
            'Institutes set their own minimum cut-off based on seats available and applicant pool that cycle.',
            'Many programs add an institutional component: portfolio review, written test, or interview.',
            'Scholarship eligibility (top 100 PGETA scorers, Rs 50,000 over 2 years) is institute-agnostic and disbursed via COA after M.Arch admission.',
            "State-level CETs (e.g., Maharashtra's M.Arch CET) may run in parallel; some students take both for maximum coverage.",
          ]}
        />
      </GuideNote>

      <GuideNote title="What if your score is borderline?">
        <GuideP muted>
          A weak Test 1 score is not the end of the cycle. You still have two more attempts (June 14, June 28) and the system retains the best score. Use Test 1 to identify your weakest module, spend two weeks on it, then re-attempt. Many serious candidates improve by 8 to 15 percentile points across attempts.
        </GuideP>
      </GuideNote>
    </ExamSpokeLayout>
  );
}
