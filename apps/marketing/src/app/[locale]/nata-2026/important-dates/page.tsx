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
import LastUpdatedBadge from '@/components/nata/LastUpdatedBadge';

// ISR: Revalidate hourly — dates change during exam season
export const revalidate = 3600;

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
  { event: 'NATA 2026 Brochure Released (V1.0)', date: 'March 8, 2026', status: 'completed' },
  { event: 'Online Registration Opens (www.nata.in)', date: 'March 9, 2026', status: 'active' },
  { event: 'Phase 1 — Exam Period Begins', date: 'April 4, 2026', status: 'confirmed' },
  { event: 'Phase 1 — Exams on Fridays (1 session) & Saturdays (2 sessions)', date: 'April 4 – June 13, 2026', status: 'confirmed' },
  { event: 'Phase 1 — Exam Period Ends', date: 'June 13, 2026', status: 'confirmed' },
  { event: 'Phase 1 — Percentile Score Card Issued', date: 'After June 13, 2026', status: 'confirmed' },
  { event: 'Centralized Admission Counselling (CAP) — Various States', date: 'June–August 2026 (varies by state)', status: 'upcoming' },
  { event: 'Phase 2 — Exam Dates (for vacant seats)', date: 'August 7 & 8, 2026', status: 'confirmed' },
  { event: 'Phase 2 — Raw Score Card Issued', date: 'After August 8, 2026', status: 'confirmed' },
  { event: 'Admission Against Vacant Seats', date: 'August–September 2026', status: 'upcoming' },
];

const faqs = [
  {
    question: 'When is NATA 2026 exam date?',
    answer:
      'NATA 2026 Phase 1 exams run from April 4 to June 13, 2026 on designated Fridays (1 afternoon session) and Saturdays (2 sessions), except public holidays. Phase 2 is on August 7 & 8, 2026.',
  },
  {
    question: 'How many attempts are there in NATA 2026?',
    answer:
      'You can take up to 2 attempts in Phase 1 (for CAP admissions) OR 1 attempt in Phase 2 (for vacant seats). You cannot appear in both phases. Your best raw score in Phase 1 is used for percentile calculation.',
  },
  {
    question: 'When did NATA 2026 registration start?',
    answer:
      'NATA 2026 online registration opened on March 9, 2026 at www.nata.in. You can register for one or two tests during Phase 1, or one test during Phase 2.',
  },
  {
    question: 'When will NATA 2026 results be declared?',
    answer:
      'A Statement of Marks with the raw score is issued after every attempt. The Final Scorecard with Percentile Score is issued after all Phase 1 sessions end (after June 13, 2026). Phase 2 results have raw scores only.',
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
              NATA 2026 registration opened March 9, 2026. Phase 1 exams run April 4 – June 13, 2026 on Fridays & Saturdays. Phase 2 is on August 7 & 8, 2026 for vacant seats.
            </Typography>
            <LastUpdatedBadge date="March 13, 2026" />
          </Container>
        </Box>

        {/* Timeline */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 6, fontWeight: 700 }}>
              NATA 2026 Schedule
            </Typography>

            <Card sx={{ bgcolor: 'success.light', mb: 4, p: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'center' }}>
                These dates are confirmed from the official NATA 2026 Brochure V1.0 (released March 8, 2026). Session-wise schedule will be published on www.nata.in.
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
                <Chip label={event.status === 'completed' ? 'Done' : event.status === 'active' ? 'Live' : event.status === 'confirmed' ? 'Confirmed' : 'Upcoming'} size="small" color={event.status === 'completed' ? 'success' : event.status === 'active' ? 'warning' : event.status === 'confirmed' ? 'primary' : 'default'} variant={event.status === 'upcoming' ? 'outlined' : 'filled'} sx={{ alignSelf: 'center' }} />
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
