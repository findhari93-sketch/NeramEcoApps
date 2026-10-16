import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box } from '@neram/ui';
import CropOutlinedIcon from '@mui/icons-material/CropOutlined';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { APP_URL } from '@/lib/seo/constants';
import { nataGuideNav, nataRelated } from '@/components/nata/guideNav';
import { ArticleSection, CtaBand, CtaButton, FaqList, GuideArticle, InfoCard, InlineCta } from '@/design-system';


export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'How to Apply for NATA 2026: Step by Step Application Guide',
    description:
      'Complete step-by-step guide to apply for NATA 2026. Create account, fill details, upload documents, pay fee, and download appointment card. Free image crop tool included.',
    keywords:
      'how to apply NATA 2026, NATA application process, NATA registration, NATA 2026 apply online, NATA application form',
    alternates: buildAlternates(locale, '/nata-2026/how-to-apply'),
  };
}

interface PageProps {
  params: { locale: string };
}

const steps = [
  {
    number: '01',
    title: 'Create Account on NATA Portal',
    desc: 'Visit www.nata.in and click "New Registration". Enter your name, email, mobile number, and create a password. Verify your email and mobile to activate the account. Registration opened on March 9, 2026.',
  },
  {
    number: '02',
    title: 'Fill Personal Details',
    desc: 'Log in to the NATA portal and complete your personal details: name, date of birth, address, category, parent/guardian information. Choose whether you want to register for Phase 1 (up to 2 tests, for CAP admissions) or Phase 2 (1 test, for vacant seats). You cannot appear in both phases.',
  },
  {
    number: '03',
    title: 'Upload Documents',
    desc: 'Upload scanned copies of your photo (3.5x4.5 cm, 4-100 KB, JPG/JPEG), signature (3.5x1.5 cm, 1-30 KB, JPG/JPEG), 10th marksheet, and category certificate (if applicable). Photo must be front-facing with both ears visible on white background.',
  },
  {
    number: '04',
    title: 'Pay Application Fee',
    desc: 'Pay the application fee online via Electronic Payment Gateway (EPG): debit card, credit card, or net banking. General/OBC (NCL): Rs 1,750 | SC/ST/EWS/PwD: Rs 1,250 | Transgender: Rs 1,000 | Outside India: Rs 15,000. Fee is per test and non-refundable.',
  },
  {
    number: '05',
    title: 'Print Application Confirmation',
    desc: 'After successful payment, download and print the application confirmation page. Keep it safe, as you will need it for verification later. You can initially register for one test and later opt for an additional test (max 2 in Phase 1).',
  },
  {
    number: '06',
    title: 'Select Exam City Preference',
    desc: 'Choose up to 4 preferred exam center cities from the list of 80+ cities across 25 states/UTs (and Dubai). Your actual center will be assigned based on availability in your chosen cities.',
  },
  {
    number: '07',
    title: 'Download Appointment Card',
    desc: 'Once your exam center and schedule are confirmed, download the appointment card from the NATA portal. This is your admit card for the exam day. Carry it along with a valid photo ID. Report at 9:00 AM (Session 1) or 12:30 PM (Session 2).',
  },
];

const faqs = [
  {
    question: 'When did NATA 2026 registration open?',
    answer:
      'NATA 2026 online registration opened on March 9, 2026 at www.nata.in. You can register for one or two tests during Phase 1 (April 4 – June 13), or one test during Phase 2 (August 7 & 8). Registration remains open during the exam period.',
  },
  {
    question: 'Can I apply for both Phase 1 and Phase 2?',
    answer:
      'No, you must choose either Phase 1 OR Phase 2. You cannot appear in both. Phase 1 allows up to 2 attempts and uses percentile scoring for CAP admissions. Phase 2 allows 1 attempt with raw scores for vacant seat admissions.',
  },
  {
    question: 'How many times can I take NATA 2026?',
    answer:
      'You can take a maximum of 2 tests in Phase 1, or 1 test in Phase 2. Each test requires a separate fee payment. You can initially register for one test and later opt for an additional test.',
  },
  {
    question: 'What documents are needed for NATA 2026 application?',
    answer:
      'You need a scanned photo (3.5x4.5 cm, JPG/JPEG, 4-100 KB, front-facing with both ears visible), signature (3.5x1.5 cm, JPG/JPEG, 1-30 KB), 10th marksheet, and category certificate (if applicable). All documents must be clear and legible.',
  },
];

export default function HowToApplyPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  const howToSchema = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'How to Apply for NATA 2026',
    description:
      'Step-by-step guide to complete NATA 2026 registration and application process on the official NATA portal.',
    totalTime: 'PT30M',
    step: steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.title,
      text: step.desc,
    })),
  };

  return (
    <>
      <JsonLd data={howToSchema} />
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: localeUrl('') },
          { name: 'NATA 2026', url: localeUrl('/nata-2026') },
          { name: 'How to Apply' },
        ])}
      />
      <JsonLd data={generateFAQSchema(faqs)} />

      <GuideArticle
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'NATA 2026', href: '/nata-2026' }, { name: 'How to Apply' }]}
        eyebrow="NATA 2026 · Exam guide"
        title="How to Apply for NATA 2026"
        lede="To apply for NATA 2026, visit www.nata.in, create an account, fill the application form, upload your photo and signature, pay the fee, and download your appointment card. The entire process takes about 30 minutes."
        verified="Updated March 13, 2026 · Source: Official NATA 2026 Brochure V1.0"
        nav={nataGuideNav('how-to-apply')}
        related={nataRelated(['eligibility', 'photo-signature-requirements', 'fee-structure', 'important-dates'])}
        back={{ label: 'Back to NATA 2026 guide', href: '/nata-2026' }}
      >
        <ArticleSection id="application-steps" title="7-Step Application Guide">
          <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {steps.map((step) => (
              <li key={step.number}>
                <InfoCard code={step.number} title={step.title} body={step.desc} />
              </li>
            ))}
          </Box>
        </ArticleSection>

        <InlineCta
          eyebrow="Free tool"
          icon={<CropOutlinedIcon />}
          title="Need to crop your photo & signature?"
          body="Use our free Image Crop tool to resize your photo and signature to NATA specifications."
          action={
            <CtaButton href={`${APP_URL}/tools/nata/image-crop`} external>
              Open Image Crop Tool (Free)
            </CtaButton>
          }
        />

        <ArticleSection id="faq" title="FAQs: NATA 2026 Application">
          <FaqList items={faqs} defaultOpen={-1} />
        </ArticleSection>
      </GuideArticle>

      <CtaBand
        title="Prepare for NATA 2026 with Neram Classes"
        lede="Expert coaching, free tools, and personalized guidance."
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
