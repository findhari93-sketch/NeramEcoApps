import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import ExamSpokeLayout from '@/components/exam-hub/sections/ExamSpokeLayout';
import { GuideNote, GuideP } from '@/components/exam-hub/sections/GuideBlocks';
import { buildAlternates } from '@/lib/seo/metadata';
import { AAT_PARTICIPATING_IITS } from '@/components/aat/data/aatContent';
import { ArticleSection, CheckList } from '@/design-system';

export const revalidate = 86400;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'IITs Offering B.Arch via AAT 2026: Roorkee, Kharagpur, BHU Varanasi',
    description:
      'Three IITs offer the 5-year B.Arch program through AAT 2026: IIT Roorkee, IIT Kharagpur, and IIT (BHU) Varanasi. Department details, NIRF rankings, and admission process via JoSAA.',
    keywords:
      'IIT B.Arch colleges, AAT participating IITs, IIT Roorkee architecture, IIT Kharagpur architecture, IIT BHU architecture, B.Arch IIT admission',
    alternates: buildAlternates(locale, '/aat-2026/participating-iits'),
  };
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export default function AatParticipatingIitsPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <ExamSpokeLayout
      examName="AAT 2026"
      examShortName="AAT 2026"
      examHubHref="/aat-2026"
      spokeSlug="participating-iits"
      topicTitle="IITs offering B.Arch via AAT 2026"
      topicSubtitle="Three IITs offer the 5-year B.Arch program through AAT 2026. Seats are allotted by JoSAA strictly on JEE (Advanced) 2026 All India Rank, with AAT Pass as the prerequisite."
      related={[
        { label: 'Eligibility', href: '/aat-2026/eligibility' },
        { label: 'Centres', href: '/aat-2026/centres' },
        { label: 'Schedule', href: '/aat-2026/schedule' },
      ]}
    >
      {AAT_PARTICIPATING_IITS.map((iit) => (
        <ArticleSection key={iit.name} id={slugify(iit.name)} eyebrow={iit.program} title={iit.name} intro={iit.note}>
          <GuideP muted>{iit.seats}</GuideP>
        </ArticleSection>
      ))}

      <ArticleSection id="seat-allotment" title="How seat allotment works">
        <CheckList
          columnMin={600}
          items={[
            'JoSAA conducts six rounds of counselling between June and July 2026.',
            'Only AAT-passed candidates are considered for B.Arch at the three IITs.',
            'Allotment uses category-wise JEE (Advanced) 2026 All India Rank, not AAT performance.',
            'You fill choices on the JoSAA portal; allotment is automatic per the seat matrix.',
            'Seat acceptance, document verification, and reporting deadlines are non-negotiable. Missing them forfeits the seat.',
          ]}
        />
      </ArticleSection>

      <GuideNote title="What if you do not get an IIT seat?">
        <GuideP muted>
          JoSAA also allots B.Arch seats at NITs, SPAs, and IIITs through JEE Main Paper 2A (no AAT required). NATA-based admissions at state and private B.Arch colleges remain open. Many architecture aspirants attempt all three (NATA, JEE Main Paper 2, AAT) to maximise options.
        </GuideP>
      </GuideNote>
    </ExamSpokeLayout>
  );
}
