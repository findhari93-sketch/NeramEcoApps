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
    title: 'How to Apply for NATA 2026 — Step by Step Application Guide',
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
    desc: 'Pay the application fee online via Electronic Payment Gateway (EPG) — debit card, credit card, or net banking. General/OBC (NCL): Rs 1,750 | SC/ST/EWS/PwD: Rs 1,250 | Transgender: Rs 1,000 | Outside India: Rs 15,000. Fee is per test and non-refundable.',
  },
  {
    number: '05',
    title: 'Print Application Confirmation',
    desc: 'After successful payment, download and print the application confirmation page. Keep it safe — you will need it for verification later. You can initially register for one test and later opt for an additional test (max 2 in Phase 1).',
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

      <Box>
        {/* Hero */}
        <Box
          sx={{
            py: { xs: 8, md: 12 },
            background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)',
            color: 'white',
          }}
        >
          <Container maxWidth="lg">
            <Chip label="NATA 2026" sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }} />
            <Typography
              variant="h1"
              component="h1"
              gutterBottom
              sx={{ fontWeight: 700, fontSize: { xs: '2rem', sm: '2.5rem', md: '3.5rem' } }}
            >
              How to Apply for NATA 2026
            </Typography>
            <Typography variant="h5" sx={{ mb: 2, opacity: 0.9, fontSize: { xs: '1.1rem', md: '1.5rem' } }}>
              To apply for NATA 2026, visit www.nata.in, create an account, fill the application form, upload your photo and signature, pay the fee, and download your appointment card. The entire process takes about 30 minutes.
            </Typography>
            <LastUpdatedBadge date="March 13, 2026" />
          </Container>
        </Box>

        {/* Steps */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 6, fontWeight: 700 }}>
              7-Step Application Guide
            </Typography>

            {steps.map((step, index) => (
              <Card key={step.number} sx={{ mb: 3, position: 'relative', overflow: 'visible' }}>
                <CardContent sx={{ p: { xs: 3, md: 4 }, display: 'flex', gap: 3 }}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      bgcolor: 'primary.main',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '1.2rem',
                      flexShrink: 0,
                    }}
                  >
                    {step.number}
                  </Box>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                      {step.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                      {step.desc}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Container>
        </Box>

        {/* CTA: Image Crop Tool */}
        <Box sx={{ py: { xs: 4, md: 6 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md" sx={{ textAlign: 'center' }}>
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
              Need to crop your photo & signature?
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Use our free Image Crop tool to resize your photo and signature to NATA specifications.
            </Typography>
            <Button
              variant="contained"
              size="large"
              component="a"
              href={`${APP_URL}/tools/nata/image-crop`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Image Crop Tool (Free)
            </Button>
          </Container>
        </Box>

        {/* Also Read */}
        <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
              Also Read
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              {[
                { title: 'NATA 2026 Eligibility', slug: 'eligibility' },
                { title: 'Photo & Signature Requirements', slug: 'photo-signature-requirements' },
                { title: 'NATA 2026 Fee Structure', slug: 'fee-structure' },
                { title: 'Important Dates', slug: 'important-dates' },
              ].map((item) => (
                <Link key={item.slug} href={`/${locale}/nata-2026/${item.slug}`} style={{ textDecoration: 'none' }}>
                  <Card sx={{ p: 2, color: 'inherit', transition: 'box-shadow 0.2s', '&:hover': { boxShadow: 3 } }}>
                    <Typography variant="subtitle1" color="primary.main" sx={{ fontWeight: 600 }}>
                      {item.title} &rarr;
                    </Typography>
                  </Card>
                </Link>
              ))}
            </Box>
          </Container>
        </Box>

        {/* FAQ */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>
              FAQs — NATA 2026 Application
            </Typography>
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
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
              Expert coaching, free tools, and personalized guidance.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button variant="contained" size="large" component={Link} href="/apply" sx={{ background: '#ffffff', color: '#0d47a1', fontWeight: 700, px: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', '&:hover': { background: '#f0f0f0' } }}>
                Start Free Trial
              </Button>
              <Button variant="outlined" size="large" component={Link} href={`/${locale}/nata-2026`} sx={{ borderColor: 'white', color: 'white' }}>
                Back to NATA 2026 Guide
              </Button>
            </Box>
          </Container>
        </Box>
      </Box>
    </>
  );
}
