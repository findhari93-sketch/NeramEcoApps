import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import ExamSpokeLayout from '@/components/exam-hub/sections/ExamSpokeLayout';
import { GuideNote } from '@/components/exam-hub/sections/GuideBlocks';
import { scheduleTimeline } from '@/components/exam-hub/examGuides';
import { JsonLd } from '@/components/seo/JsonLd';
import { buildAlternates } from '@/lib/seo/metadata';
import { AAT_SCHEDULE } from '@/components/aat/data/aatContent';
import { ArticleSection, CheckList, Timeline } from '@/design-system';

export const revalidate = 86400;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'AAT 2026 Schedule: Registration June 1-2, Exam June 4, Result June 7',
    description:
      'Full AAT 2026 schedule with day-of-week and IST timings. Registration opens June 1, 2026 (10:00 IST), closes June 2 (17:00 IST). Exam Thursday June 4, 9:00 to 12:00 IST. Result Sunday June 7 at 17:00 IST.',
    keywords:
      'AAT 2026 date, AAT 2026 exam date, AAT registration dates, AAT 2026 result date, when is AAT 2026, AAT 2026 timetable',
    alternates: buildAlternates(locale, '/aat-2026/schedule'),
  };
}

export default function AatSchedulePage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  const eventSchema = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: 'Architecture Aptitude Test (AAT) 2026',
    startDate: '2026-06-04T09:00:00+05:30',
    endDate: '2026-06-04T12:00:00+05:30',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    location: {
      '@type': 'Place',
      name: 'Seven zonal IIT centres in India',
      address: { '@type': 'PostalAddress', addressCountry: 'IN' },
    },
    organizer: {
      '@type': 'Organization',
      name: 'JEE (Advanced) 2026 Board',
      url: 'https://jeeadv.ac.in',
    },
  };

  return (
    <>
      <JsonLd data={eventSchema} />
      <ExamSpokeLayout
        examName="AAT 2026"
        examShortName="AAT 2026"
        examHubHref="/aat-2026"
        spokeSlug="schedule"
        topicTitle="AAT 2026 schedule and important dates"
        topicSubtitle="The short answer: AAT 2026 is on Thursday, June 4, 2026 from 09:00 to 12:00 IST. Registration is a 48-hour window after JEE Advanced results."
        related={[
          { label: 'Eligibility', href: '/aat-2026/eligibility' },
          { label: 'Examination centres', href: '/aat-2026/centres' },
          { label: 'Drawing kit checklist', href: '/aat-2026/drawing-kit' },
        ]}
      >
        <ArticleSection id="timeline" title="Date-by-date timeline">
          <Timeline items={scheduleTimeline(AAT_SCHEDULE)} />
        </ArticleSection>

        <ArticleSection
          id="registration-window"
          title="Why the registration window is so short"
          intro="JEE (Advanced) 2026 results are declared on June 1, 2026, the same day AAT registration opens. The 48-hour window ensures only serious B.Arch aspirants register, while keeping the schedule tight enough to fit the AAT exam two days later. Plan ahead: keep your JEE (Advanced) credentials, photo, and signature uploads ready before results day so you do not lose minutes hunting for files."
        />

        <GuideNote title="Day-of-exam timing">
          <CheckList
            variant="compact"
            items={[
              'Reach the examination centre by 08:00 IST.',
              'Test starts at 09:00 IST sharp.',
              'Test ends at 12:00 IST. PwD candidates with eligible accommodation get one extra hour.',
              'Carry the printed JEE (Advanced) 2026 admit card and an original government photo ID.',
            ]}
          />
        </GuideNote>

        <ArticleSection
          id="result-format"
          title="Result format and what comes next"
          intro="On Sunday, June 7, 2026 at 17:00 IST, results are published as a Pass or Fail status only. No marks, percentile, or AAT rank is declared. From there, JoSAA counselling considers your JEE (Advanced) 2026 All India Rank for B.Arch seat allotment at IIT Roorkee, IIT Kharagpur, and IIT (BHU) Varanasi, conditional on AAT Pass."
        />
      </ExamSpokeLayout>
    </>
  );
}
