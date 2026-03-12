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

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA 2026 Important Dates — Registration, Exam & Result Schedule',
    description:
      'NATA 2026 important dates for all 3 attempts — registration start/end, exam dates, result dates, and counselling schedule. Updated as announced by CoA.',
    keywords:
      'NATA 2026 dates, NATA exam date 2026, NATA 2026 registration date, NATA result date, NATA 2026 schedule, NATA important dates',
    alternates: buildAlternates(locale, '/nata-2026/important-dates'),
  };
}

interface PageProps {
  params: { locale: string };
}

const dateEvents = [
  { event: 'NATA 2026 Notification Released', date: 'Expected: January 2026', status: 'upcoming' },
  { event: 'Online Registration Opens', date: 'Expected: February 2026', status: 'upcoming' },
  { event: 'Attempt 1 — Registration Deadline', date: 'Expected: March 2026', status: 'upcoming' },
  { event: 'Attempt 1 — City Slip Download', date: 'Expected: March 2026', status: 'upcoming' },
  { event: 'Attempt 1 — Appointment Card Download', date: 'Expected: April 2026', status: 'upcoming' },
  { event: 'Attempt 1 — Exam Date', date: 'Expected: April 2026', status: 'upcoming' },
  { event: 'Attempt 1 — Result Declaration', date: 'Expected: May 2026', status: 'upcoming' },
  { event: 'Attempt 2 — Registration Deadline', date: 'Expected: May 2026', status: 'upcoming' },
  { event: 'Attempt 2 — Exam Date', date: 'Expected: June 2026', status: 'upcoming' },
  { event: 'Attempt 2 — Result Declaration', date: 'Expected: June 2026', status: 'upcoming' },
  { event: 'Attempt 3 — Registration Deadline', date: 'Expected: June 2026', status: 'upcoming' },
  { event: 'Attempt 3 — Exam Date', date: 'Expected: July 2026', status: 'upcoming' },
  { event: 'Attempt 3 — Result Declaration', date: 'Expected: July/August 2026', status: 'upcoming' },
  { event: 'Score Card Download', date: 'Expected: August 2026', status: 'upcoming' },
  { event: 'Counselling Process Begins', date: 'Expected: August/September 2026', status: 'upcoming' },
];

const faqs = [
  {
    question: 'When is NATA 2026 exam date?',
    answer:
      'The exact NATA 2026 exam dates have not been announced yet. Based on previous years, Attempt 1 is expected in April 2026, Attempt 2 in June 2026, and Attempt 3 in July 2026. Check the official NATA website for confirmed dates.',
  },
  {
    question: 'How many attempts are there in NATA 2026?',
    answer:
      'NATA 2026 will have 3 attempts. You can appear for any or all attempts. The best score among all attempts will be considered for admission.',
  },
  {
    question: 'When will NATA 2026 registration start?',
    answer:
      'NATA 2026 registration is expected to start in February 2026. The notification will be published on www.nata.in. We will update this page as soon as the official dates are announced.',
  },
  {
    question: 'When will NATA 2026 results be declared?',
    answer:
      'Results are typically declared within 2-3 weeks after each attempt. Based on previous patterns, Attempt 1 results are expected in May 2026. Score cards can be downloaded from the NATA portal.',
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

      <Box>
        {/* Hero */}
        <Box sx={{ py: { xs: 8, md: 12 }, background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)', color: 'white' }}>
          <Container maxWidth="lg">
            <Chip label="NATA 2026" sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }} />
            <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', sm: '2.5rem', md: '3.5rem' } }}>
              NATA 2026 Important Dates
            </Typography>
            <Typography variant="h5" sx={{ mb: 2, opacity: 0.9, fontSize: { xs: '1.1rem', md: '1.5rem' } }}>
              NATA 2026 is expected to have 3 attempts between April and July 2026. Registration typically opens 2-3 months before the first attempt. Below are the expected dates based on the NATA 2025 schedule.
            </Typography>
          </Container>
        </Box>

        {/* Timeline */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 6, fontWeight: 700 }}>
              NATA 2026 Schedule
            </Typography>

            <Card sx={{ bgcolor: 'warning.light', mb: 4, p: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'center' }}>
                Note: These are expected dates based on NATA 2025 pattern. Official dates will be updated once announced by CoA.
              </Typography>
            </Card>

            {dateEvents.map((event, index) => (
              <Box key={index} sx={{ display: 'flex', gap: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: 'primary.light', color: 'primary.contrastText', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>
                  {index + 1}
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{event.event}</Typography>
                  <Typography variant="body2" color="text.secondary">{event.date}</Typography>
                </Box>
                <Chip label="Expected" size="small" variant="outlined" sx={{ alignSelf: 'center' }} />
              </Box>
            ))}
          </Container>
        </Box>

        {/* Also Read */}
        <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>Also Read</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              {[
                { title: 'How to Apply for NATA 2026', slug: 'how-to-apply' },
                { title: 'NATA 2026 Fee Structure', slug: 'fee-structure' },
                { title: 'Exam Centers', slug: 'exam-centers' },
                { title: 'Scoring & Results', slug: 'scoring-and-results' },
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
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>FAQs — NATA 2026 Dates</Typography>
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
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>Start early. Expert coaching for all 3 attempts.</Typography>
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
