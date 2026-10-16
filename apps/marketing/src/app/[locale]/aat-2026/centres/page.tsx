import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import ExamSpokeLayout from '@/components/exam-hub/sections/ExamSpokeLayout';
import { GuideNote, GuideP } from '@/components/exam-hub/sections/GuideBlocks';
import { buildAlternates } from '@/lib/seo/metadata';
import { AAT_CENTRES } from '@/components/aat/data/aatContent';
import { ArticleSection, CheckList } from '@/design-system';

export const revalidate = 86400;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'AAT 2026 Centres: 7 Zonal IITs (Bombay, Delhi, Guwahati, Kanpur, Kharagpur, Madras, Roorkee)',
    description:
      'AAT 2026 is conducted at seven zonal IIT centres across India. Official centre list at jeeadv.ac.in/aat_centre_list.html. Choose your preferred centre during registration; final allocation by the conducting body.',
    keywords:
      'AAT 2026 centres, AAT exam centres, AAT zonal IITs, AAT centre list, AAT IIT Bombay, AAT IIT Delhi, AAT IIT Roorkee',
    alternates: buildAlternates(locale, '/aat-2026/centres'),
  };
}

export default function AatCentresPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <ExamSpokeLayout
      examName="AAT 2026"
      examShortName="AAT 2026"
      examHubHref="/aat-2026"
      spokeSlug="centres"
      topicTitle="AAT 2026 examination centres"
      topicSubtitle="AAT 2026 is conducted at seven zonal IIT centres in India. The official centre list is published at jeeadv.ac.in/aat_centre_list.html."
      related={[
        { label: 'Schedule', href: '/aat-2026/schedule' },
        { label: 'Drawing kit', href: '/aat-2026/drawing-kit' },
        { label: 'Eligibility', href: '/aat-2026/eligibility' },
      ]}
    >
      <ArticleSection id="zonal-centres" title="The 7 zonal IIT centres">
        <CheckList items={[...AAT_CENTRES]} columnMin={200} />
        <GuideP muted>IIT Roorkee is the coordinating institute for AAT 2026.</GuideP>
      </ArticleSection>

      <ArticleSection id="centre-allocation" title="How centre allocation works">
        <CheckList
          columnMin={600}
          items={[
            'During AAT registration on jeeadv.ac.in, you select your preferred centre from the seven options.',
            'The final centre is allotted by the conducting body, subject to capacity. Most candidates get their first preference.',
            'Once allotted, the centre is fixed; no changes are entertained.',
            'Your allotted centre appears on your JEE (Advanced) admit card, which doubles as the AAT admit card.',
            'Plan travel and accommodation early. Major IIT cities have limited budget-friendly stays during exam season.',
          ]}
        />
      </ArticleSection>

      <GuideNote title="Day-of-exam logistics">
        <CheckList
          variant="compact"
          items={[
            'Reach the centre by 08:00 IST. The exam starts at 09:00 IST sharp.',
            'Carry the printed JEE (Advanced) 2026 admit card and an original government photo ID (Aadhaar, Passport, Driving License, Voter ID).',
            'Mobile phones, smart watches, calculators, and electronic devices are not allowed inside the centre.',
            'Bring your own drawing kit. Centres do not provide pencils, erasers, or geometry boxes.',
            'Do a dry run of the route the previous evening. Account for local traffic, especially in Delhi, Bombay, and Madras.',
          ]}
        />
      </GuideNote>
    </ExamSpokeLayout>
  );
}
