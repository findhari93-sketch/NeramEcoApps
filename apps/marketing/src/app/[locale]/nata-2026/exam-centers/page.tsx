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
    title: 'NATA 2026 Exam Centers — State-Wise City List',
    description:
      'Complete list of NATA 2026 exam centers across India, organized state-wise. Find the nearest NATA exam center city for Part A (offline) and Part B (online).',
    keywords:
      'NATA 2026 exam centers, NATA exam center list, NATA center city wise, NATA 2026 test centers, NATA exam center near me',
    alternates: buildAlternates(locale, '/nata-2026/exam-centers'),
  };
}

interface PageProps {
  params: { locale: string };
}

const examCenters: Record<string, string[]> = {
  'Andhra Pradesh': ['Amaravati', 'Guntur', 'Kakinada', 'Kurnool', 'Nellore', 'Tirupati', 'Vijayawada', 'Visakhapatnam'],
  'Assam': ['Guwahati', 'Silchar'],
  'Bihar': ['Gaya', 'Muzaffarpur', 'Patna'],
  'Chhattisgarh': ['Bhilai', 'Raipur'],
  'Delhi': ['New Delhi'],
  'Goa': ['Panaji'],
  'Gujarat': ['Ahmedabad', 'Rajkot', 'Surat', 'Vadodara'],
  'Haryana': ['Faridabad', 'Gurugram', 'Karnal'],
  'Himachal Pradesh': ['Shimla'],
  'Jharkhand': ['Dhanbad', 'Jamshedpur', 'Ranchi'],
  'Karnataka': ['Bengaluru', 'Hubballi', 'Mangaluru', 'Mysuru'],
  'Kerala': ['Ernakulam', 'Kozhikode', 'Thiruvananthapuram', 'Thrissur'],
  'Madhya Pradesh': ['Bhopal', 'Gwalior', 'Indore', 'Jabalpur'],
  'Maharashtra': ['Aurangabad', 'Mumbai', 'Nagpur', 'Nashik', 'Pune'],
  'Meghalaya': ['Shillong'],
  'Odisha': ['Bhubaneswar', 'Rourkela'],
  'Punjab': ['Amritsar', 'Jalandhar', 'Ludhiana', 'Mohali'],
  'Rajasthan': ['Jaipur', 'Jodhpur', 'Udaipur'],
  'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Salem', 'Tiruchirappalli'],
  'Telangana': ['Hyderabad', 'Warangal'],
  'Tripura': ['Agartala'],
  'Uttar Pradesh': ['Agra', 'Allahabad', 'Bareilly', 'Gorakhpur', 'Kanpur', 'Lucknow', 'Meerut', 'Noida', 'Varanasi'],
  'Uttarakhand': ['Dehradun', 'Roorkee'],
  'West Bengal': ['Durgapur', 'Kolkata', 'Siliguri'],
  'Chandigarh': ['Chandigarh'],
  'Jammu & Kashmir': ['Jammu', 'Srinagar'],
  'Puducherry': ['Puducherry'],
};

const faqs = [
  {
    question: 'How many exam centers are there for NATA 2026?',
    answer:
      'NATA 2026 exam centers are spread across 100+ cities in India. The exact number may vary per attempt. You can select up to 4 preferred city choices during application.',
  },
  {
    question: 'Can I change my NATA exam center after applying?',
    answer:
      'City preference changes may be allowed during a specific window before the exam. However, once the appointment card is issued with the final center, changes are generally not permitted.',
  },
  {
    question: 'Are Part A and Part B conducted at the same center?',
    answer:
      'Yes, both Part A (offline drawing) and Part B (online MCQ/NCQ) are conducted at the same exam center on the same day. Part A is first (morning), followed by Part B.',
  },
  {
    question: 'Is NATA conducted outside India?',
    answer:
      'As per previous years, NATA is conducted only within India. International candidates need to travel to India for the exam. Check the official NATA website for the latest updates on international centers.',
  },
];

export default function ExamCentersPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const sortedStates = Object.keys(examCenters).sort();

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([{ name: 'Home', url: baseUrl }, { name: 'NATA 2026', url: `${baseUrl}/${locale}/nata-2026` }, { name: 'Exam Centers' }])} />
      <JsonLd data={generateFAQSchema(faqs)} />

      <Box>
        {/* Hero */}
        <Box sx={{ py: { xs: 8, md: 12 }, background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)', color: 'white' }}>
          <Container maxWidth="lg">
            <Chip label="NATA 2026" sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }} />
            <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', sm: '2.5rem', md: '3.5rem' } }}>
              NATA 2026 Exam Centers
            </Typography>
            <Typography variant="h5" sx={{ mb: 2, opacity: 0.9, fontSize: { xs: '1.1rem', md: '1.5rem' } }}>
              NATA 2026 exam centers are available in 100+ cities across India. You can choose up to 4 preferred cities during registration. Here is the state-wise list of exam center cities.
            </Typography>
          </Container>
        </Box>

        {/* State-wise Centers */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
              State-Wise Exam Center Cities
            </Typography>
            <Typography variant="body1" align="center" color="text.secondary" sx={{ mb: 6 }}>
              {sortedStates.length} states/UTs | {Object.values(examCenters).flat().length} cities
            </Typography>

            {sortedStates.map((state) => (
              <Accordion key={state} disableGutters sx={{ '&:before': { display: 'none' }, mb: 1, borderRadius: 1, overflow: 'hidden' }}>
                <AccordionSummary expandIcon={<Typography sx={{ fontSize: '1.2rem', fontWeight: 600 }}>+</Typography>} sx={{ bgcolor: 'white', '&:hover': { bgcolor: 'grey.100' } }}>
                  <Typography sx={{ fontWeight: 600 }}>{state}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ ml: 1, alignSelf: 'center' }}>
                    ({examCenters[state].length} {examCenters[state].length === 1 ? 'city' : 'cities'})
                  </Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ bgcolor: 'white', pt: 0 }}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {examCenters[state].map((city) => (
                      <Chip key={city} label={city} size="medium" sx={{ fontSize: '0.85rem' }} />
                    ))}
                  </Box>
                </AccordionDetails>
              </Accordion>
            ))}
          </Container>
        </Box>

        {/* CTA: Exam Centers Tool */}
        <Box sx={{ py: { xs: 4, md: 6 }, bgcolor: 'grey.50', textAlign: 'center' }}>
          <Container maxWidth="md">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>Find Your Nearest Exam Center</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Use our free Exam Centers tool with interactive maps and center details.
            </Typography>
            <Button variant="contained" size="large" component="a" href={`${APP_URL}/tools/nata/exam-centers`} target="_blank" rel="noopener noreferrer">
              Open Exam Centers Tool (Free)
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
                { title: 'Important Dates', slug: 'important-dates' },
                { title: "Do's & Don'ts", slug: 'dos-and-donts' },
                { title: 'NATA 2026 Fee Structure', slug: 'fee-structure' },
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
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>FAQs — NATA 2026 Exam Centers</Typography>
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
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>Expert coaching and free tools for NATA preparation.</Typography>
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
