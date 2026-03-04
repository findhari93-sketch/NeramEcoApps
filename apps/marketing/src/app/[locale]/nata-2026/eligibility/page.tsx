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

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA 2026 Eligibility Criteria — Who Can Apply?',
    description:
      'Complete NATA 2026 eligibility criteria for appearing in the exam and for B.Arch admission. Age limit, academic requirements, subject combinations, and category-wise details.',
    keywords:
      'NATA 2026 eligibility, NATA eligibility criteria, who can apply NATA, NATA age limit, NATA qualification, B.Arch eligibility',
    alternates: buildAlternates(locale, '/nata-2026/eligibility'),
  };
}

interface PageProps {
  params: { locale: string };
}

const faqs = [
  {
    question: 'Can I appear for NATA 2026 if I am in Class 12?',
    answer:
      'Yes, students appearing (currently studying) in Class 12 with Mathematics as a subject are eligible to appear for NATA 2026. The final result will be valid only after you pass 12th with the required marks.',
  },
  {
    question: 'Is there an age limit for NATA 2026?',
    answer:
      'There is no upper age limit to appear for NATA. However, for B.Arch admission eligibility through CoA, the candidate should have completed 17 years of age as on the date specified by CoA.',
  },
  {
    question: 'Can Commerce or Arts students apply for NATA?',
    answer:
      'No, to appear for NATA you must have studied Mathematics as a subject in 10+2. Students from Commerce or Arts stream without Mathematics are not eligible.',
  },
  {
    question: 'What is the minimum percentage required in 12th for NATA?',
    answer:
      'To appear for NATA, there is no minimum percentage. However, for B.Arch admission eligibility, you need at least 50% aggregate in 10+2 (45% for SC/ST/OBC/PwD) with Mathematics as a subject.',
  },
];

export default function EligibilityPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';

  return (
    <>
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: baseUrl },
          { name: 'NATA 2026', url: `${baseUrl}/${locale}/nata-2026` },
          { name: 'Eligibility' },
        ])}
      />
      <JsonLd data={generateFAQSchema(faqs)} />

      <Box>
        {/* Hero */}
        <Box sx={{ py: { xs: 8, md: 12 }, background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)', color: 'white' }}>
          <Container maxWidth="lg">
            <Chip label="NATA 2026" sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }} />
            <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', sm: '2.5rem', md: '3.5rem' } }}>
              NATA 2026 Eligibility Criteria
            </Typography>
            <Typography variant="h5" sx={{ mb: 2, opacity: 0.9, fontSize: { xs: '1.1rem', md: '1.5rem' } }}>
              To appear for NATA 2026, you must have passed or be appearing in 10+2 (or equivalent) with Mathematics as a subject. For B.Arch admission, additional marks criteria apply.
            </Typography>
          </Container>
        </Box>

        {/* Eligibility to Appear */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>
              Eligibility to Appear for NATA
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3, lineHeight: 1.8 }}>
              These criteria determine who can sit for the NATA exam. Meeting these criteria does NOT automatically make you eligible for B.Arch admission.
            </Typography>
            <Card sx={{ mb: 4 }}>
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                <List>
                  {[
                    'Must have passed or be appearing in 10+2 (or equivalent exam) from a recognized board.',
                    'Must have studied Mathematics as a mandatory subject in 10+2.',
                    'No minimum percentage required to appear for the NATA exam.',
                    'No upper age limit to appear for NATA.',
                    'Indian nationals, OCI, PIO holders, and foreign nationals are eligible.',
                    'Diploma holders (10+3 Diploma) with Mathematics are also eligible.',
                  ].map((item, idx) => (
                    <ListItem key={idx} sx={{ px: 0 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <Typography color="success.main" sx={{ fontWeight: 700 }}>✓</Typography>
                      </ListItemIcon>
                      <ListItemText primary={item} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Container>
        </Box>

        {/* Eligibility for B.Arch Admission */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>
              Eligibility for B.Arch Admission
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3, lineHeight: 1.8 }}>
              These criteria are for admission to B.Arch programs using NATA scores. They are more restrictive than the criteria to simply appear for the exam.
            </Typography>
            <Card sx={{ mb: 4 }}>
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                <List>
                  {[
                    'Must have passed 10+2 with at least 50% aggregate marks (45% for SC/ST/OBC/PwD).',
                    'Must have studied Mathematics as a mandatory subject.',
                    'Must have passed in Physics, Chemistry, and Mathematics individually.',
                    'Must have a valid NATA score (qualifying marks: minimum 20 in Part A, 20 in Part B, 60 overall).',
                    'Must be at least 17 years of age as on the date specified by CoA.',
                    'International Baccalaureate (IB) diploma holders with Maths are eligible.',
                    'Lateral entry: B.Sc. graduates with Mathematics in all years may be eligible for direct second year (check college norms).',
                  ].map((item, idx) => (
                    <ListItem key={idx} sx={{ px: 0 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <Typography color="primary.main" sx={{ fontWeight: 700 }}>&#x2713;</Typography>
                      </ListItemIcon>
                      <ListItemText primary={item} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Container>
        </Box>

        {/* CTA: Eligibility Checker Tool */}
        <Box sx={{ py: { xs: 4, md: 6 }, bgcolor: 'background.default', textAlign: 'center' }}>
          <Container maxWidth="md">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
              Not sure if you are eligible?
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Use our free Eligibility Checker tool to instantly check your eligibility for NATA 2026.
            </Typography>
            <Button variant="contained" size="large" component="a" href={`${APP_URL}/tools/nata/eligibility-checker`} target="_blank" rel="noopener noreferrer">
              Check Eligibility (Free)
            </Button>
          </Container>
        </Box>

        {/* Also Read */}
        <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>Also Read</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              {[
                { title: 'How to Apply for NATA 2026', slug: 'how-to-apply' },
                { title: 'NATA 2026 Syllabus', slug: 'syllabus' },
                { title: 'NATA 2026 Fee Structure', slug: 'fee-structure' },
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
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>FAQs — NATA 2026 Eligibility</Typography>
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
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>Expert coaching, free tools, and personalized guidance.</Typography>
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
