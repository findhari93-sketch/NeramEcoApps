import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Typography } from '@neram/ui';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { APP_URL } from '@/lib/seo/constants';
import { nataGuideNav, nataRelated } from '@/components/nata/guideNav';
import { ArticleSection, Callout, CtaBand, CtaButton, DataTable, FaqList, GuideArticle, InlineCta, tokens } from '@/design-system';


export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA 2026 Application Fee: Category-Wise Fee Details',
    description:
      'Complete NATA 2026 fee structure for all categories. General: Rs 1,750, SC/ST: Rs 1,250, Transgender: Rs 1,000, Outside India: Rs 15,000. Payment modes and multiple attempt fees explained.',
    keywords:
      'NATA 2026 fee, NATA application fee, NATA fee structure, NATA exam fee, NATA 2026 registration fee, NATA fee SC ST',
    alternates: buildAlternates(locale, '/nata-2026/fee-structure'),
  };
}

interface PageProps {
  params: { locale: string };
}

const feeData = [
  { category: 'General / OBC (NCL)', fee: '1,750', highlight: false },
  { category: 'SC / ST / EWS / PwD', fee: '1,250', highlight: false },
  { category: 'Transgender', fee: '1,000', highlight: false },
  { category: 'Candidates from Outside India', fee: '15,000', highlight: true },
];

const feeNotes = [
  'Fee is per test. Maximum 2 tests in Phase 1 or 1 test in Phase 2.',
  'Fee is non-refundable in all cases.',
  'Payment: Electronic Payment Gateway (EPG): Debit Card, Credit Card, Net Banking.',
  'Candidates initially opting for a single test may later opt for an additional test (not exceeding 2).',
  'Multiple applications by the same candidate with changed credentials will be rejected without refund.',
];

const faqs = [
  {
    question: 'What is the NATA 2026 application fee for General category?',
    answer:
      'The NATA 2026 application fee for General and OBC (NCL) category candidates is Rs 1,750 per test. Note: EWS candidates pay only Rs 1,250 (grouped with SC/ST/PwD). The fee is non-refundable.',
  },
  {
    question: 'Do I have to pay separately for each NATA attempt?',
    answer:
      'Yes, each test requires a separate fee payment. You can take maximum 2 tests in Phase 1 or 1 test in Phase 2. You can initially register for one test and later opt for an additional test.',
  },
  {
    question: 'What payment modes are accepted for NATA fee?',
    answer:
      'NATA fee can be paid online through debit card, credit card, net banking, or UPI. Cash payments and demand drafts are not accepted.',
  },
  {
    question: 'Is the NATA application fee refundable?',
    answer:
      'No, the NATA application fee is non-refundable. Even if you do not appear for the exam or your application is rejected, the fee will not be returned.',
  },
];

export default function FeeStructurePage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([{ name: 'Home', url: localeUrl('') }, { name: 'NATA 2026', url: localeUrl('/nata-2026') }, { name: 'Fee Structure' }])} />
      <JsonLd data={generateFAQSchema(faqs)} />

      <GuideArticle
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'NATA 2026', href: '/nata-2026' }, { name: 'Fee Structure' }]}
        eyebrow="NATA 2026 · Exam guide"
        title="NATA 2026 Application Fee"
        lede="The NATA 2026 application fee is Rs 1,750 for General/OBC (NCL), Rs 1,250 for SC/ST/EWS/PwD, Rs 1,000 for Transgender, and Rs 15,000 for outside India. Fee is per test, non-refundable."
        verified="Updated March 13, 2026 · Source: Official NATA 2026 Brochure V1.0"
        nav={nataGuideNav('fee-structure')}
        related={nataRelated(['how-to-apply', 'eligibility', 'important-dates', 'exam-pattern'])}
        back={{ label: 'Back to NATA 2026 guide', href: '/nata-2026' }}
      >
        <ArticleSection id="category-wise-fee" title="Category-Wise Fee Details">
          <DataTable
            caption="NATA 2026 application fee by category"
            hideCaption
            columns={['Category', 'Fee per Attempt (INR)']}
            rows={feeData.map((row) => [row.category, <strong key={row.category}>Rs {row.fee}</strong>])}
          />

          <Callout>
            <Typography component="h3" sx={{ m: 0, mb: 1, fontSize: '1.0625rem', fontWeight: 700 }}>
              Important Notes
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'flex', flexDirection: 'column', gap: 0.75, fontSize: '1rem', lineHeight: 1.6, color: tokens.inkMuted }}>
              {feeNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </Box>
          </Callout>
        </ArticleSection>

        <InlineCta
          eyebrow="Free tool"
          icon={<CalculateOutlinedIcon />}
          title="Calculate Your Total NATA Cost"
          body="Plan your budget with our free Cost Calculator. It covers application fee, coaching, and college admission costs."
          action={
            <CtaButton href={`${APP_URL}/tools/nata/cost-calculator`} external>
              Open Cost Calculator (Free)
            </CtaButton>
          }
        />

        <ArticleSection id="faq" title="FAQs: NATA 2026 Fee">
          <FaqList items={faqs} defaultOpen={-1} />
        </ArticleSection>
      </GuideArticle>

      <CtaBand
        title="Prepare for NATA 2026 with Neram Classes"
        lede="Affordable coaching with free tools and personalized guidance."
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
