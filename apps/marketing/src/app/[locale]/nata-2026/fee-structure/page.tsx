import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@neram/ui';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { APP_URL } from '@/lib/seo/constants';
import LastUpdatedBadge from '@/components/nata/LastUpdatedBadge';


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

      <Box>
        {/* Hero */}
        <Box sx={{ py: { xs: 8, md: 12 }, background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)', color: 'white' }}>
          <Container maxWidth="lg">
            <Chip label="NATA 2026" sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }} />
            <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', sm: '2.5rem', md: '3.5rem' } }}>
              NATA 2026 Application Fee
            </Typography>
            <Typography variant="h5" sx={{ mb: 2, opacity: 0.9, fontSize: { xs: '1.1rem', md: '1.5rem' } }}>
              The NATA 2026 application fee is Rs 1,750 for General/OBC (NCL), Rs 1,250 for SC/ST/EWS/PwD, Rs 1,000 for Transgender, and Rs 15,000 for outside India. Fee is per test, non-refundable.
            </Typography>
            <LastUpdatedBadge date="March 13, 2026" />
          </Container>
        </Box>

        {/* Fee Table */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 6, fontWeight: 700 }}>
              Category-Wise Fee Details
            </Typography>

            <Card sx={{ overflow: 'hidden' }}>
              {/* Header */}
              <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr', bgcolor: 'primary.main', color: 'white', p: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Category</Typography>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, textAlign: 'right' }}>Fee per Attempt (INR)</Typography>
              </Box>
              {/* Rows */}
              {feeData.map((row, index) => (
                <Box key={index} sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr', p: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: index % 2 === 0 ? 'grey.50' : 'white' }}>
                  <Typography variant="body1" sx={{ fontWeight: row.highlight ? 600 : 400 }}>{row.category}</Typography>
                  <Typography variant="body1" sx={{ textAlign: 'right', fontWeight: 700, color: 'primary.main' }}>
                    Rs {row.fee}
                  </Typography>
                </Box>
              ))}
            </Card>

            <Card sx={{ mt: 4, p: { xs: 3, md: 4 } }}>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>Important Notes</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                {'\u2022'} Fee is per test. Maximum 2 tests in Phase 1 or 1 test in Phase 2.{'\n'}
                {'\u2022'} Fee is non-refundable in all cases.{'\n'}
                {'\u2022'} Payment: Electronic Payment Gateway (EPG): Debit Card, Credit Card, Net Banking.{'\n'}
                {'\u2022'} Candidates initially opting for a single test may later opt for an additional test (not exceeding 2).{'\n'}
                {'\u2022'} Multiple applications by the same candidate with changed credentials will be rejected without refund.
              </Typography>
            </Card>
          </Container>
        </Box>

        {/* CTA: Cost Calculator */}
        <Box sx={{ py: { xs: 4, md: 6 }, bgcolor: 'grey.50', textAlign: 'center' }}>
          <Container maxWidth="md">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>Calculate Your Total NATA Cost</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Plan your budget with our free Cost Calculator. It covers application fee, coaching, and college admission costs.
            </Typography>
            <Button variant="contained" size="large" component="a" href={`${APP_URL}/tools/nata/cost-calculator`} target="_blank" rel="noopener noreferrer">
              Open Cost Calculator (Free)
            </Button>
          </Container>
        </Box>

        {/* Also Read */}
        <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>Also Read</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              {[
                { title: 'How to Apply for NATA 2026', slug: 'how-to-apply' },
                { title: 'NATA 2026 Eligibility', slug: 'eligibility' },
                { title: 'Important Dates', slug: 'important-dates' },
                { title: 'Exam Pattern', slug: 'exam-pattern' },
              ].map((item) => (
                <Link key={item.slug} href={`/${locale}/nata-2026/${item.slug}`} style={{ textDecoration: 'none' }}>
                  <Card sx={{ p: 2, color: 'inherit', transition: 'box-shadow 0.2s', '&:hover': { boxShadow: 3 } }}>
                    <Typography variant="subtitle1" color="primary.main" sx={{ fontWeight: 600 }}>{item.title} &rarr;</Typography>
                  </Card>
                </Link>
              ))}
            </Box>
          </Container>
        </Box>

        {/* FAQ */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>FAQs: NATA 2026 Fee</Typography>
            {faqs.map((faq, index) => (
              <Accordion key={index} disableGutters sx={{ '&:before': { display: 'none' }, mb: 1, borderRadius: 1, overflow: 'hidden' }}>
                <AccordionSummary expandIcon={<Typography sx={{ fontSize: '1.2rem', fontWeight: 600 }}>+</Typography>} sx={{ bgcolor: 'white', '&:hover': { bgcolor: 'grey.100' } }}>
                  <Typography sx={{ fontWeight: 600 }}>{faq.question}</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ bgcolor: 'white' }}>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>{faq.answer}</Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Container>
        </Box>

        {/* CTA Banner */}
        <Box sx={{ py: { xs: 6, md: 10 }, background: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 100%)', color: 'white', textAlign: 'center' }}>
          <Container maxWidth="md">
            <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '1.75rem', md: '2.5rem' } }}>
              Prepare for NATA 2026 with Neram Classes
            </Typography>
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>Affordable coaching with free tools and personalized guidance.</Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button variant="contained" size="large" component={Link} href="/apply" sx={{ background: '#ffffff', color: '#0d47a1', fontWeight: 700, px: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', '&:hover': { background: '#f0f0f0' } }}>Start Free Trial</Button>
              <Button variant="outlined" size="large" component={Link} href={`/${locale}/nata-2026`} sx={{ borderColor: 'white', color: 'white' }}>Back to NATA 2026 Guide</Button>
            </Box>
          </Container>
        </Box>
      </Box>
    </>
  );
}
