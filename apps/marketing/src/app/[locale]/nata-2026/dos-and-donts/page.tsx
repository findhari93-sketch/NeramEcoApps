import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@neram/ui';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import LastUpdatedBadge from '@/components/nata/LastUpdatedBadge';

export const revalidate = 86400;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: "NATA 2026 Exam Day Do's and Don'ts",
    description:
      "Complete NATA 2026 exam day do's and don'ts. What to bring, what NOT to bring, timing rules, malpractice warnings, and tips for a smooth exam experience.",
    keywords:
      "NATA 2026 dos and donts, NATA exam day rules, NATA what to bring, NATA exam tips, NATA 2026 exam day instructions",
    alternates: buildAlternates(locale, '/nata-2026/dos-and-donts'),
  };
}

interface PageProps {
  params: { locale: string };
}

const dos = [
  'Carry your appointment card (printed) to the exam center.',
  'Carry a valid government photo ID (Aadhaar, Passport, PAN, Voter ID).',
  'Bring your own drawing materials: pencils (HB/2B), erasers, dry colors (color pencils, pastels, crayons), and a scale (up to 15 cm only).',
  'Report at the exam center by 9:00 AM (Session 1) or 12:30 PM (Session 2). Late entry cutoff is 10:15 AM / 1:45 PM.',
  'Wear comfortable clothes (avoid clothing with large logos or text).',
  'Carry a transparent water bottle.',
  'Read all Part A drawing questions carefully — you have 90 minutes for 3 questions.',
  'For Part B (online), attempt all 50 questions — no negative marking for MCQ or NCQ.',
  'Keep your drawing sheets and 3D composition materials clean.',
  'Follow all instructions from the invigilator regarding the 3D composition kit provided at the center.',
];

const donts = [
  'Do NOT carry mobile phones, smartwatches, or any electronic devices.',
  'Do NOT carry calculators (even basic ones).',
  'Do NOT bring printed or written notes, textbooks, or reference materials.',
  'Do NOT bring a geometry box, compass, set squares, protractor, or any instruments other than pencils, erasers, dry colors, and scale (up to 15 cm).',
  'Do NOT bring blades, cutters, or sharp instruments.',
  'Do NOT use erasing fluid (correction fluid/whitener) on drawing sheets.',
  'Do NOT communicate with other candidates during the exam.',
  'Do NOT leave the exam hall without permission from the invigilator.',
  'Do NOT attempt to copy or use unfair means — leads to disqualification.',
  'Do NOT bring bags, wallets, or purses inside the exam hall.',
  'Do NOT write your name on the drawing sheet (use only the roll number).',
];

const faqs = [
  {
    question: 'Can I bring my own drawing sheets for NATA?',
    answer:
      'No, drawing sheets and base material for the 3D composition are provided by the exam center. You should NOT bring your own. You must bring only: pencils, erasers, dry colors (color pencils, pastels, crayons), and a scale up to 15 cm.',
  },
  {
    question: 'What happens if I arrive late for NATA exam?',
    answer:
      'Late entry is not allowed after the cutoff time. For Session 1, the late entry cutoff is 10:15 AM (exam starts 10:00 AM). For Session 2, the cutoff is 1:45 PM (exam starts 1:30 PM). If you arrive after the cutoff, you will not be permitted to take the exam and your fee will not be refunded.',
  },
  {
    question: 'Can I bring a geometry box or compass to NATA?',
    answer:
      'No. NATA 2026 explicitly prohibits geometry boxes, compasses, set squares, protractors, and blades. You are allowed ONLY pencils, erasers, dry colors (color pencils, pastels, crayons), and a scale up to 15 cm.',
  },
  {
    question: 'What if I get caught using unfair means in NATA?',
    answer:
      'Using unfair means (copying, carrying electronic devices, communicating with others) leads to immediate disqualification from the current attempt. Depending on severity, you may be banned from future attempts as well.',
  },
];

export default function DosAndDontsPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([{ name: 'Home', url: localeUrl('') }, { name: 'NATA 2026', url: localeUrl('/nata-2026') }, { name: "Do's & Don'ts" }])} />
      <JsonLd data={generateFAQSchema(faqs)} />

      <Box>
        {/* Hero */}
        <Box sx={{ py: { xs: 8, md: 12 }, background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)', color: 'white' }}>
          <Container maxWidth="lg">
            <Chip label="NATA 2026" sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }} />
            <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', sm: '2.5rem', md: '3.5rem' } }}>
              NATA 2026 Exam Day Do&apos;s and Don&apos;ts
            </Typography>
            <Typography variant="h5" sx={{ mb: 2, opacity: 0.9, fontSize: { xs: '1.1rem', md: '1.5rem' } }}>
              On NATA exam day, carry your appointment card, photo ID, and drawing materials (pencils, erasers, dry colors, scale up to 15 cm). Do NOT bring mobile phones, geometry boxes, or electronic devices. Report by 9:00 AM (Session 1) or 12:30 PM (Session 2).
            </Typography>
            <LastUpdatedBadge date="March 13, 2026" />
          </Container>
        </Box>

        {/* Do's and Don'ts */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="lg">
            <Grid container spacing={4}>
              {/* Do's */}
              <Grid item xs={12} md={6}>
                <Card sx={{ height: '100%', border: '2px solid', borderColor: 'success.main' }}>
                  <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                    <Chip label="DO" color="success" sx={{ mb: 2, fontWeight: 700 }} />
                    <Typography variant="h5" sx={{ fontWeight: 700, mb: 2, color: 'success.dark' }}>
                      What to Do
                    </Typography>
                    <List dense>
                      {dos.map((item, idx) => (
                        <ListItem key={idx} sx={{ px: 0 }}>
                          <ListItemIcon sx={{ minWidth: 28 }}>
                            <Typography color="success.main" sx={{ fontWeight: 700 }}>&#x2713;</Typography>
                          </ListItemIcon>
                          <ListItemText primary={item} primaryTypographyProps={{ variant: 'body2' }} />
                        </ListItem>
                      ))}
                    </List>
                  </CardContent>
                </Card>
              </Grid>

              {/* Don'ts */}
              <Grid item xs={12} md={6}>
                <Card sx={{ height: '100%', border: '2px solid', borderColor: 'error.main' }}>
                  <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                    <Chip label="DON'T" color="error" sx={{ mb: 2, fontWeight: 700 }} />
                    <Typography variant="h5" sx={{ fontWeight: 700, mb: 2, color: 'error.dark' }}>
                      What NOT to Do
                    </Typography>
                    <List dense>
                      {donts.map((item, idx) => (
                        <ListItem key={idx} sx={{ px: 0 }}>
                          <ListItemIcon sx={{ minWidth: 28 }}>
                            <Typography color="error.main" sx={{ fontWeight: 700 }}>&#x2717;</Typography>
                          </ListItemIcon>
                          <ListItemText primary={item} primaryTypographyProps={{ variant: 'body2' }} />
                        </ListItem>
                      ))}
                    </List>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* Also Read */}
        <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>Also Read</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              {[
                { title: 'NATA 2026 Exam Pattern', slug: 'exam-pattern' },
                { title: 'Important Dates', slug: 'important-dates' },
                { title: 'Exam Centers', slug: 'exam-centers' },
                { title: 'Photo & Signature Requirements', slug: 'photo-signature-requirements' },
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
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>FAQs — Exam Day Rules</Typography>
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
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>Be fully prepared for exam day with expert coaching.</Typography>
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
