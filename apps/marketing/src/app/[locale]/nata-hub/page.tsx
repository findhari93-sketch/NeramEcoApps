import { Metadata } from 'next';
import { buildAlternates } from '@/lib/seo/metadata';
import { Box } from '@neram/ui';
import { setRequestLocale } from 'next-intl/server';
import { getTNEAColleges } from '@/lib/college-hub/queries';
import CollegeListingCard from '@/components/college-hub/CollegeListingCard';
import { CtaBand, CtaButton, FaqList, PageHero, Section, StepList } from '@/design-system';

export const revalidate = 86400;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    alternates: buildAlternates(locale, '/nata-hub'),
    title: 'NATA 2026: B.Arch Colleges Accepting NATA Score',
    description:
      'Complete list of B.Arch colleges in India accepting NATA scores. Compare fees, cutoffs, placements. All COA-approved architecture colleges with NATA admission.',
    keywords: ['NATA colleges', 'B.Arch NATA', 'NATA score colleges', 'architecture colleges NATA'],
  };
}

const FAQ_ITEMS = [
  {
    question: 'Which colleges accept NATA score for B.Arch admission?',
    answer:
      'Most private and state-aided B.Arch colleges across India accept NATA scores. Central government institutions (NITs, SPAs) use JEE Paper 2 via JoSAA. State colleges under TNEA (Tamil Nadu), KCET (Karnataka), etc., accept NATA as per their respective counseling norms.',
  },
  {
    question: 'What is the minimum NATA score for admission to top B.Arch colleges?',
    answer:
      'Top colleges typically require 120-140+ out of 200 in NATA. For COA approval, you need a minimum 50% in 10+2 PCM/PCB and a qualifying NATA score. Management quota may have lower cutoffs.',
  },
  {
    question: 'Is NATA mandatory for all B.Arch colleges?',
    answer:
      'Yes. COA (Council of Architecture) mandates NATA or JEE Paper 2 score for all B.Arch admissions since 2019. No B.Arch college can admit students without a valid architecture entrance exam score.',
  },
];

const STATS = [
  { label: 'Colleges Accept NATA (across India)', value: '550+' },
  { label: 'COA Approved (all listed colleges)', value: '100%' },
  { label: 'NATA Score Range (exam out of 200)', value: '40-200' },
  { label: 'Exam Frequency (Jan-Apr, Apr-Jun)', value: '2x/year' },
];

const STEPS = [
  {
    title: 'Appear in NATA',
    body: 'Register on nata.in, appear in the online test. NATA 2026 is conducted twice. Best score is considered.',
  },
  {
    title: 'Score Card',
    body: 'Download score card valid for current academic year. Minimum qualifying score is required for COA approval.',
  },
  {
    title: 'Apply to Colleges',
    body: 'Apply directly to colleges (management quota) or through state counseling systems (TNEA, KCET, etc.).',
  },
  {
    title: 'Counseling and Allotment',
    body: 'Get seat allotted based on NATA score and academics. Pay fees, submit documents, and confirm admission.',
  },
];

export default async function NATAHubPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const colleges = await getTNEAColleges();

  return (
    <>
      <PageHero
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'NATA Colleges' }]}
        eyebrow="NATA 2026"
        title="NATA B.Arch Colleges in India"
        lede="National Aptitude Test in Architecture (NATA) is conducted by the Council of Architecture. Browse all B.Arch colleges accepting NATA score, compare fees, cutoffs, and placements."
        actions={
          <>
            <CtaButton href="/colleges" size="lg">
              Browse All Colleges
            </CtaButton>
            <CtaButton variant="outline" href="/nata-2026" size="lg">
              NATA 2026 Guide
            </CtaButton>
          </>
        }
        stats={STATS}
      />

      <Section id="how-nata-admission-works" tone="light" gap={3} header={{ title: 'How NATA Admission Works', align: 'start', size: 'article' }}>
        <StepList items={STEPS} columnMin={240} />
      </Section>

      <Section
        id="tamil-nadu-colleges"
        tone="white"
        gap={3}
        header={{
          title: 'Tamil Nadu B.Arch Colleges (TNEA + NATA)',
          lede: `${colleges.length} colleges listed in Tamil Nadu. Admission through TNEA counseling and NATA score.`,
          align: 'start',
          size: 'article',
        }}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 2 }}>
          {colleges.slice(0, 12).map((college) => (
            <CollegeListingCard key={college.id} college={college} />
          ))}
        </Box>
        {colleges.length > 12 && (
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <CtaButton variant="outline" href="/colleges/tamil-nadu">
              View All {colleges.length} Tamil Nadu Colleges
            </CtaButton>
          </Box>
        )}
      </Section>

      <Section id="faq" tone="light" width="narrow" header={{ eyebrow: 'Questions', title: 'Frequently Asked Questions' }}>
        <FaqList items={FAQ_ITEMS} />
      </Section>

      <CtaBand
        title="Find your NATA college"
        lede="Read the NATA 2026 guide, then compare every B.Arch college that accepts your score."
        actions={
          <>
            <CtaButton href="/nata-2026">NATA 2026 Guide</CtaButton>
            <CtaButton variant="link" href="/colleges">
              Browse All Colleges
            </CtaButton>
          </>
        }
      />
    </>
  );
}
