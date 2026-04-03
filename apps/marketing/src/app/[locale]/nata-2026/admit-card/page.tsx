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
import { APP_URL } from '@/lib/seo/constants';
import LastUpdatedBadge from '@/components/nata/LastUpdatedBadge';
import Breadcrumbs from '@/components/seo/Breadcrumbs';


export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA 2026 Admit Card — Download Steps, Details & Important Instructions',
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
  'Take 2–3 color printouts on A4-size paper. Keep one copy at home as backup.',
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
  'Check if a correction window is open — CoA usually allows corrections for a limited period after admit card release.',
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
      'No. The printed admit card is mandatory for entry into the exam hall. No candidate will be allowed to take the NATA exam without a valid, printed admit card. Digital copies on phones are NOT accepted. Always carry 2 printed copies — one will be collected by the invigilator.',
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

      <Box>
        {/* Hero */}
        <Box sx={{ py: { xs: 8, md: 12 }, background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)', color: 'white' }}>
          <Container maxWidth="lg">
            <Breadcrumbs
              variant="light"
              items={[
                { name: 'Home', href: `/${locale}` },
                { name: 'NATA 2026', href: `/${locale}/nata-2026` },
                { name: 'Admit Card' },
              ]}
            />
            <Chip label="NATA 2026" sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }} />
            <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', sm: '2.5rem', md: '3.5rem' } }}>
              NATA 2026 Admit Card
            </Typography>
            <Typography variant="h5" sx={{ mb: 2, opacity: 0.9, fontSize: { xs: '1.1rem', md: '1.5rem' } }}>
              NATA 2026 admit cards will be available for download from nata.in approximately 15 days before each exam date. You need your NATA application number and date of birth to download. The admit card is mandatory for entry to the exam center — no candidate will be allowed without it.
            </Typography>
            <LastUpdatedBadge date="March 13, 2026" />
          </Container>
        </Box>

        {/* How to Download */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
              How to Download NATA 2026 Admit Card
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.8 }}>
              Follow these steps to download your NATA 2026 admit card from the official website.
            </Typography>

            <Card>
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                <List>
                  {downloadSteps.map((step, idx) => (
                    <ListItem key={idx} sx={{ px: 0 }}>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <Chip label={idx + 1} size="small" color="primary" sx={{ fontWeight: 700, minWidth: 28 }} />
                      </ListItemIcon>
                      <ListItemText primary={step} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Container>
        </Box>

        {/* Details on the Admit Card */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
              Details on the Admit Card
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.8 }}>
              Your NATA admit card contains the following important information. Verify every detail carefully after downloading.
            </Typography>

            <Card>
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                <List dense>
                  {admitCardDetails.map((detail, idx) => (
                    <ListItem key={idx} sx={{ px: 0 }}>
                      <ListItemIcon sx={{ minWidth: 28 }}>
                        <Typography color="primary.main" sx={{ fontWeight: 700 }}>&#x2713;</Typography>
                      </ListItemIcon>
                      <ListItemText primary={detail} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Container>
        </Box>

        {/* Documents to Carry on Exam Day */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
              Documents to Carry on Exam Day
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.8 }}>
              Make sure you carry all required documents and materials to the exam center. Missing any of these may prevent you from taking the exam.
            </Typography>

            {documentsToCarry.map((doc, idx) => (
              <Card key={idx} sx={{ mb: 2 }}>
                <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>{doc.item}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>{doc.note}</Typography>
                </CardContent>
              </Card>
            ))}
          </Container>
        </Box>

        {/* What to Do If There Are Errors */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
              What to Do If There Are Errors
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.8 }}>
              If you find any incorrect details on your admit card (wrong name, photo, center, etc.), take immediate action.
            </Typography>

            <Card>
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                <List>
                  {correctionSteps.map((step, idx) => (
                    <ListItem key={idx} sx={{ px: 0 }}>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <Chip label={idx + 1} size="small" color="warning" sx={{ fontWeight: 700, minWidth: 28 }} />
                      </ListItemIcon>
                      <ListItemText primary={step} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Container>
        </Box>

        {/* Important Dates for Admit Card Download */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
              Important Dates for Admit Card Download
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.8 }}>
              NATA 2026 is conducted in two phases. Admit cards are released separately for each phase.
            </Typography>

            {importantDates.map((date, idx) => (
              <Card key={idx} sx={{ mb: 2 }}>
                <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                  <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.main', mb: 1 }}>{date.phase}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, lineHeight: 1.8 }}>
                    <strong>Exam Date:</strong> {date.examDate}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                    <strong>Admit Card Release:</strong> {date.admitCardRelease}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Container>
        </Box>

        {/* Also Read */}
        <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>Also Read</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              {[
                { title: "Do's & Don'ts", slug: 'dos-and-donts' },
                { title: 'Important Dates', slug: 'important-dates' },
                { title: 'Exam Centers', slug: 'exam-centers' },
                { title: 'How to Apply', slug: 'how-to-apply' },
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
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>FAQs — NATA 2026 Admit Card</Typography>
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
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>Be exam-ready with expert coaching and complete preparation support.</Typography>
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
