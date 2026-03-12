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
    desc: 'Visit www.nata.in and click "New Registration". Enter your name, email, mobile number, and create a password. Verify your email and mobile to activate the account.',
  },
  {
    number: '02',
    title: 'Fill Personal & Academic Details',
    desc: 'Log in to the NATA portal and fill the application form. Enter your personal details (name, DOB, address, category), academic qualifications (10th and 12th marks), and parent/guardian details.',
  },
  {
    number: '03',
    title: 'Upload Documents',
    desc: 'Upload scanned copies of your photo (3.5x4.5 cm, 4-100 KB, JPG), signature (3.5x1.5 cm, 1-30 KB, JPG), 10th marksheet, and category certificate (if applicable). Ensure all uploads meet the specified size requirements.',
  },
  {
    number: '04',
    title: 'Pay Application Fee',
    desc: 'Pay the application fee online via debit card, credit card, net banking, or UPI. General: Rs 1,750 | SC/ST: Rs 1,250 | Transgender: Rs 1,000 | Outside India: Rs 15,000.',
  },
  {
    number: '05',
    title: 'Print Application Confirmation',
    desc: 'After successful payment, download and print the application confirmation page. Keep it safe — you will need it for verification later.',
  },
  {
    number: '06',
    title: 'Select Exam City Preference',
    desc: 'Choose up to 4 preferred exam center cities when the city selection window opens. Your actual center will be assigned based on availability in your chosen cities.',
  },
  {
    number: '07',
    title: 'Download Appointment Card',
    desc: 'Once your exam center and schedule are confirmed, download the appointment card from the NATA portal. This is your admit card for the exam day. Carry it along with a valid photo ID.',
  },
];

const faqs = [
  {
    question: 'What is the last date to apply for NATA 2026?',
    answer:
      'The application dates for NATA 2026 will be announced by the Council of Architecture. Generally, registration opens 2-3 months before the exam. Check the NATA 2026 Important Dates page for the latest schedule.',
  },
  {
    question: 'Can I apply for NATA 2026 after the deadline?',
    answer:
      'Late applications are generally not accepted. However, CoA sometimes extends the deadline with a late fee. It is best to apply well before the deadline.',
  },
  {
    question: 'How many times can I apply for NATA 2026?',
    answer:
      'You can register for up to 3 attempts in a single year. Each attempt requires a separate fee payment and city selection.',
  },
  {
    question: 'What documents are needed for NATA 2026 application?',
    answer:
      'You need a scanned photo (3.5x4.5 cm, JPG, 4-100 KB), signature (3.5x1.5 cm, JPG, 1-30 KB), 10th marksheet, and category certificate (if applicable). All documents must be clear and legible.',
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
