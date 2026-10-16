import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import ExamSpokeLayout from '@/components/exam-hub/sections/ExamSpokeLayout';
import { GuideNote, GuideP } from '@/components/exam-hub/sections/GuideBlocks';
import { scheduleTimeline } from '@/components/exam-hub/examGuides';
import { buildAlternates } from '@/lib/seo/metadata';
import { PGETA_SCHEDULE } from '@/components/pgeta/data/pgetaContent';
import { ArticleSection, CheckList, Timeline } from '@/design-system';

export const revalidate = 86400;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'PGETA 2026 Schedule: Three Tests on May 31, June 14, June 28',
    description:
      'PGETA 2026 (also known as PGEAT) is conducted on three Sundays in 2026: May 31, June 14, and June 28, all 10:00 AM to 12:00 PM. Best score across attempts is retained. Final results July 7, 2026.',
    keywords:
      'PGETA 2026 dates, PGEAT 2026 dates, PGETA test 1, PGETA test 2, PGETA test 3, when is PGETA, PGETA result date',
    alternates: buildAlternates(locale, '/pgeta-2026/schedule'),
  };
}

export default function PgetaSchedulePage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <ExamSpokeLayout
      examName="PGETA 2026"
      examShortName="PGETA 2026"
      examHubHref="/pgeta-2026"
      spokeSlug="schedule"
      topicTitle="PGETA 2026 schedule, three test dates"
      topicSubtitle="Three Sunday tests, all 10:00 AM to 12:00 PM. You may attempt all three; the best score is automatically retained for admission."
      related={[
        { label: 'Eligibility', href: '/pgeta-2026/eligibility' },
        { label: 'Fees', href: '/pgeta-2026/fees' },
        { label: 'Score validity', href: '/pgeta-2026/score-validity' },
      ]}
    >
      <ArticleSection id="timeline" title="Date-by-date timeline">
        <Timeline items={scheduleTimeline(PGETA_SCHEDULE)} />
      </ArticleSection>

      <ArticleSection id="three-attempt-system" title="How the three-attempt system works">
        <CheckList
          columnMin={600}
          items={[
            'Each test is independent: same syllabus, same pattern, fresh question paper.',
            'You can attempt one, two, or all three. Skipping a test does not penalise you.',
            'The system automatically retains your best score across the attempts you took.',
            'Each attempt requires a separate registration and a separate fee.',
            'Final results consolidating the best score are declared on July 7, 2026.',
          ]}
        />
      </ArticleSection>

      <GuideNote title="Should you attempt all three?">
        <GuideP muted>
          Most strong candidates attempt at least two tests. Use Test 1 (May 31) as a real-conditions diagnostic, identify weak modules, and focus the next two weeks on those. Test 2 (June 14) and Test 3 (June 28) become opportunities to push your best score upwards. Treat each test fee as an investment in admission, not a sunk cost.
        </GuideP>
      </GuideNote>
    </ExamSpokeLayout>
  );
}
