import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { nataGuideNav, nataRelated } from '@/components/nata/guideNav';
import { ArticleSection, CheckList, CtaBand, CtaButton, DataTable, FaqList, GuideArticle, StepList } from '@/design-system';


export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA 2026 Admit Card: Download Steps, Details & Important Instructions',
    description:
      'How to download NATA 2026 admit card from nata.in. Step-by-step guide, important details on the admit card, documents to carry on exam day, and what to do if there are errors.',
    keywords:
      'NATA admit card, NATA 2026 admit card download, NATA hall ticket, NATA admit card correction, NATA exam day documents',
    alternates: buildAlternates(locale, '/nata-2026/admit-card'),
  };
}

interface PageProps {
  params: { locale: string };
}

const downloadSteps = [
  'Visit the official NATA website at nata.in.',
  'Click on "Download Admit Card" or "Candidate Login" on the homepage.',
  'Enter your NATA Application Number and Date of Birth.',
  'Complete the CAPTCHA verification if prompted.',
  'Verify all details displayed on the admit card carefully.',
  'Download and save the admit card as a PDF file.',
  'Take 2-3 color printouts on A4-size paper. Keep one copy at home as backup.',
];

const admitCardDetails = [
  'Candidate\'s full name and photograph',
  'NATA Application Number / Roll Number',
  'Date of Birth and Gender',
  'Exam Date and Time (Session 1 or Session 2)',
  'Exam Center name and full address',
  'Reporting time and gate closure time',
  'Category and sub-category of the candidate',
  'Important instructions for exam day',
  'Barcode / QR code for identity verification',
];

const documentsToCarry = [
  {
    item: 'Printed Admit Card (2 copies)',
    note: 'Color printout on A4 paper. One copy will be collected at the center.',
  },
  {
    item: 'Valid Government Photo ID (original)',
    note: 'Aadhaar Card, Passport, Voter ID, PAN Card, or Driving License. The name must match the admit card.',
  },
  {
    item: 'Passport-size Photographs (2 extra)',
    note: 'Same photograph as uploaded during registration. Carry extras in case of attendance sheet requirements.',
  },
  {
    item: 'Drawing Materials (for Part A)',
    note: 'Pencils (HB, 2B), erasers, dry colors (color pencils, pastels, crayons), and scale (up to 15 cm only). No geometry box.',
  },
  {
    item: 'Transparent Water Bottle',
    note: 'Only transparent/clear bottles are allowed inside the exam hall.',
  },
];

const importantDates = [
  {
    phase: 'Phase 1 Exam',
    examDate: 'April 2026 (Tentative)',
    admitCardRelease: 'Approximately 15 days before Phase 1 exam date',
  },
  {
    phase: 'Phase 2 Exam',
    examDate: 'July 2026 (Tentative)',
    admitCardRelease: 'Approximately 15 days before Phase 2 exam date',
  },
];

const correctionSteps = [
  'Log in to your NATA candidate portal at nata.in with your application number.',
  'Check if a correction window is open. CoA usually allows corrections for a limited period after admit card release.',
  'If the correction window is active, update the incorrect details and submit.',
  'If no correction window is available, immediately contact CoA at the helpline number or email provided on nata.in.',
  'Carry a letter explaining the discrepancy along with supporting documents (ID proof, application form copy) to the exam center.',
  'Inform the exam center invigilator about the error before the exam begins.',
];

const faqs = [
  {
    question: 'When will NATA 2026 admit cards be available for download?',
    answer:
      'NATA 2026 admit cards are typically released approximately 15 days before each exam phase. For Phase 1 (tentatively April 2026), expect admit cards in late March or early April. For Phase 2 (tentatively July 2026), expect admit cards in late June or early July. Check nata.in regularly for official announcements.',
  },
  {
    question: 'What should I do if my photo on the admit card is incorrect?',
    answer:
      'If the photograph on your admit card is incorrect or unclear, contact CoA immediately through the helpline on nata.in. If a correction window is open, re-upload the correct photo. If not, carry the correct photograph along with your original ID proof and a letter explaining the discrepancy to the exam center.',
  },
  {
    question: 'Can I enter the exam hall without the printed admit card?',
    answer:
      'No. The printed admit card is mandatory for entry into the exam hall. No candidate will be allowed to take the NATA exam without a valid, printed admit card. Digital copies on phones are NOT accepted. Always carry 2 printed copies, as one will be collected by the invigilator.',
  },
  {
    question: 'What if I lose my admit card before the exam?',
    answer:
      'If you lose your printed admit card, simply log in to nata.in again using your application number and date of birth, and download a fresh copy. The admit card remains available for download until after the exam date. Take new printouts immediately.',
  },
  {
    question: 'Is the admit card the same as the appointment card?',
    answer:
      'Yes. In NATA terminology, the "admit card" and "appointment card" refer to the same document. It is the official document issued by CoA that allows you entry into the exam center. It contains your exam details, center information, and photo.',
  },
];

export default function AdmitCardPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([{ name: 'Home', url: localeUrl('') }, { name: 'NATA 2026', url: localeUrl('/nata-2026') }, { name: 'Admit Card' }])} />
      <JsonLd data={generateFAQSchema(faqs)} />

      <GuideArticle
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'NATA 2026', href: '/nata-2026' }, { name: 'Admit Card' }]}
        eyebrow="NATA 2026 · Exam guide"
        title="NATA 2026 Admit Card"
        lede="NATA 2026 admit cards will be available for download from nata.in approximately 15 days before each exam date. You need your NATA application number and date of birth to download. The admit card is mandatory for entry to the exam center. No candidate will be allowed without it."
        verified="Updated March 13, 2026 · Source: Official NATA 2026 Brochure V1.0"
        nav={nataGuideNav('admit-card')}
        related={nataRelated(['dos-and-donts', 'important-dates', 'exam-centers', 'how-to-apply'])}
        back={{ label: 'Back to NATA 2026 guide', href: '/nata-2026' }}
      >
        <ArticleSection
          id="how-to-download"
          title="How to Download NATA 2026 Admit Card"
          intro="Follow these steps to download your NATA 2026 admit card from the official website."
        >
          <StepList items={downloadSteps.map((step) => ({ title: step }))} columnMin={220} />
        </ArticleSection>

        <ArticleSection
          id="admit-card-details"
          title="Details on the Admit Card"
          intro="Your NATA admit card contains the following important information. Verify every detail carefully after downloading."
        >
          <CheckList items={admitCardDetails} />
        </ArticleSection>

        <ArticleSection
          id="documents-to-carry"
          title="Documents to Carry on Exam Day"
          intro="Make sure you carry all required documents and materials to the exam center. Missing any of these may prevent you from taking the exam."
        >
          <CheckList items={documentsToCarry.map((doc) => ({ title: doc.item, body: doc.note }))} columnMin={600} />
        </ArticleSection>

        <ArticleSection
          id="errors"
          title="What to Do If There Are Errors"
          intro="If you find any incorrect details on your admit card (wrong name, photo, center, etc.), take immediate action."
        >
          <StepList items={correctionSteps.map((step) => ({ title: step }))} columnMin={220} />
        </ArticleSection>

        <ArticleSection
          id="important-dates"
          title="Important Dates for Admit Card Download"
          intro="NATA 2026 is conducted in two phases. Admit cards are released separately for each phase."
        >
          <DataTable
            caption="NATA 2026 admit card release by phase"
            hideCaption
            columns={['Phase', 'Exam Date', 'Admit Card Release']}
            mutedColumn={2}
            rows={importantDates.map((d) => [d.phase, d.examDate, d.admitCardRelease])}
          />
        </ArticleSection>

        <ArticleSection id="faq" title="FAQs: NATA 2026 Admit Card">
          <FaqList items={faqs} defaultOpen={-1} />
        </ArticleSection>
      </GuideArticle>

      <CtaBand
        title="Prepare for NATA 2026 with Neram Classes"
        lede="Be exam-ready with expert coaching and complete preparation support."
        actions={
          <>
            <CtaButton href="/apply">Start Free Trial</CtaButton>
            <CtaButton variant="link" href="/demo-class">
              Book a free demo class
            </CtaButton>
          </>
        }
      />
    </>
  );
}
