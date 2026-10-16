import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box } from '@neram/ui';
import { nataGuideNav, nataRelated } from '@/components/nata/guideNav';
import { ArticleSection, Callout, CtaBand, CtaButton, FaqList, GuideArticle, Timeline, type TimelineState, tokens } from '@/design-system';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';


export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA 2026 Important Dates: Registration, Exam & Result Schedule',
    description:
      'NATA 2026 important dates for all 3 attempts: registration start/end, exam dates, result dates, and counselling schedule. Updated as announced by CoA.',
    keywords:
      'NATA 2026 dates, NATA exam date 2026, NATA 2026 registration date, NATA result date, NATA 2026 schedule, NATA important dates',
    alternates: buildAlternates(locale, '/nata-2026/important-dates'),
  };
}

interface PageProps {
  params: { locale: string };
}

const dateEvents = [
  { event: 'NATA 2026 Brochure Released (V1.0)', date: 'March 8, 2026', status: 'completed' },
  { event: 'Online Registration Opens (www.nata.in)', date: 'March 9, 2026', status: 'active' },
  { event: 'Phase 1: Exam Period Begins', date: 'April 4, 2026', status: 'confirmed' },
  { event: 'Phase 1: Exams on Fridays (1 session) & Saturdays (2 sessions)', date: 'April 4 – June 13, 2026', status: 'confirmed' },
  { event: 'Phase 1: Exam Period Ends', date: 'June 13, 2026', status: 'confirmed' },
  { event: 'Phase 1: Percentile Score Card Issued', date: 'After June 13, 2026', status: 'confirmed' },
  { event: 'Centralized Admission Counselling (CAP), Various States', date: 'June–August 2026 (varies by state)', status: 'upcoming' },
  { event: 'Phase 2: Exam Dates (for vacant seats)', date: 'August 7 & 8, 2026', status: 'confirmed' },
  { event: 'Phase 2: Raw Score Card Issued', date: 'After August 8, 2026', status: 'confirmed' },
  { event: 'Admission Against Vacant Seats', date: 'August–September 2026', status: 'upcoming' },
];

/** Brochure status to a Timeline dot: completed = done, active = now, confirmed and upcoming = next. */
const timelineState: Record<string, TimelineState> = {
  completed: 'done',
  active: 'now',
  confirmed: 'next',
  upcoming: 'next',
};

const faqs = [
  {
    question: 'When is NATA 2026 exam date?',
    answer:
      'NATA 2026 Phase 1 exams run from April 4 to June 13, 2026 on designated Fridays (1 afternoon session) and Saturdays (2 sessions), except public holidays. Phase 2 is on August 7 & 8, 2026.',
  },
  {
    question: 'How many attempts are there in NATA 2026?',
    answer:
      'You can take up to 2 attempts in Phase 1 (for CAP admissions) OR 1 attempt in Phase 2 (for vacant seats). You cannot appear in both phases. Your best raw score in Phase 1 is used for percentile calculation.',
  },
  {
    question: 'When did NATA 2026 registration start?',
    answer:
      'NATA 2026 online registration opened on March 9, 2026 at www.nata.in. You can register for one or two tests during Phase 1, or one test during Phase 2.',
  },
  {
    question: 'When will NATA 2026 results be declared?',
    answer:
      'A Statement of Marks with the raw score is issued after every attempt. The Final Scorecard with Percentile Score is issued after all Phase 1 sessions end (after June 13, 2026). Phase 2 results have raw scores only.',
  },
];

export default function ImportantDatesPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([{ name: 'Home', url: localeUrl('') }, { name: 'NATA 2026', url: localeUrl('/nata-2026') }, { name: 'Important Dates' }])} />
      <JsonLd data={generateFAQSchema(faqs)} />

      <GuideArticle
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'NATA 2026', href: '/nata-2026' }, { name: 'Important Dates' }]}
        eyebrow="NATA 2026 · Exam guide"
        title="NATA 2026 Important Dates"
        lede="NATA 2026 registration opened March 9, 2026. Phase 1 exams run April 4 – June 13, 2026 on Fridays & Saturdays. Phase 2 is on August 7 & 8, 2026 for vacant seats."
        verified="Updated March 13, 2026 · Source: Official NATA 2026 Brochure V1.0"
        nav={nataGuideNav('important-dates')}
        related={nataRelated(['how-to-apply', 'fee-structure', 'exam-centers', 'scoring-and-results'])}
        back={{ label: 'Back to NATA 2026 guide', href: '/nata-2026' }}
      >
        <ArticleSection id="schedule" title="NATA 2026 Schedule">
          <Callout>
            These dates are confirmed from the official NATA 2026 Brochure V1.0 (released March 8, 2026). Session-wise schedule will be published on www.nata.in.
          </Callout>
          <Timeline
            items={dateEvents.map((event) => ({
              label: event.event,
              date: event.date,
              state: timelineState[event.status] ?? 'next',
              note: event.status === 'confirmed' ? 'Confirmed' : undefined,
            }))}
          />
        </ArticleSection>

        <ArticleSection id="faq" title="FAQs: NATA 2026 Dates">
          <FaqList items={faqs} defaultOpen={-1} />
        </ArticleSection>
      </GuideArticle>

      <CtaBand
        title="Prepare for NATA 2026 with Neram Classes"
        lede="Start early. Expert coaching for all 3 attempts."
        actions={
          <>
            <CtaButton href="/apply">Start Free Trial</CtaButton>
            <CtaButton variant="link" href="/nata-2026">
              Back to NATA 2026 Guide
            </CtaButton>
          </>
        }
      />
    </>
  );
}
