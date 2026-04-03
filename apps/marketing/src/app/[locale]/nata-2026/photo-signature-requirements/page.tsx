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
    title: 'NATA 2026 Photo & Signature Upload Requirements',
    description:
      'Exact NATA 2026 photo and signature specifications. Photo: 3.5x4.5 cm, 4-100 KB, JPG. Signature: 3.5x1.5 cm, 1-30 KB, JPG. Free crop tool included.',
    keywords:
      'NATA 2026 photo size, NATA signature size, NATA photo upload, NATA photo requirements, NATA 2026 image specifications',
    alternates: buildAlternates(locale, '/nata-2026/photo-signature-requirements'),
  };
}

interface PageProps {
  params: { locale: string };
}

const photoSpecs = [
  { label: 'Dimensions', value: '3.5 cm x 4.5 cm' },
  { label: 'File Size', value: '4 KB to 100 KB' },
  { label: 'Format', value: 'JPG / JPEG only' },
  { label: 'Background', value: 'White or light-colored' },
  { label: 'Face Coverage', value: '80% of the frame' },
  { label: 'Pose', value: 'Front-facing, both ears visible' },
  { label: 'Recency', value: 'Taken within last 6 months' },
];

const signatureSpecs = [
  { label: 'Dimensions', value: '3.5 cm x 1.5 cm' },
  { label: 'File Size', value: '1 KB to 30 KB' },
  { label: 'Format', value: 'JPG / JPEG only' },
  { label: 'Ink Color', value: 'Black or dark blue ink' },
  { label: 'Background', value: 'White paper' },
  { label: 'Style', value: 'Running hand (not block letters)' },
];

const faqs = [
  {
    question: 'What happens if my NATA photo does not meet the specifications?',
    answer:
      'If your photo does not meet the specifications, your application may be rejected during verification. Use a proper passport-size photo with white background, and ensure the file size is between 4-100 KB in JPG format.',
  },
  {
    question: 'Can I upload a selfie for NATA application?',
    answer:
      'No, selfies are not recommended. The photo should be a passport-size photograph taken at a studio or with proper lighting. The face should cover 80% of the frame with a white background.',
  },
  {
    question: 'How do I reduce my photo file size to under 100 KB?',
    answer:
      'Use our free Image Crop tool at app.neramclasses.com/tools/nata/image-crop which automatically resizes and compresses your photo to meet NATA specifications. You can also use image editing software to resize and compress.',
  },
  {
    question: 'Should the signature be on white paper?',
    answer:
      'Yes, sign with black or dark blue ink on a plain white paper. Scan or photograph the signature and crop it to 3.5x1.5 cm. Ensure the file size is between 1-30 KB in JPG format.',
  },
];

export default function PhotoSignaturePage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([{ name: 'Home', url: localeUrl('') }, { name: 'NATA 2026', url: localeUrl('/nata-2026') }, { name: 'Photo & Signature Requirements' }])} />
      <JsonLd data={generateFAQSchema(faqs)} />

      <Box>
        {/* Hero */}
        <Box sx={{ py: { xs: 8, md: 12 }, background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)', color: 'white' }}>
          <Container maxWidth="lg">
            <Chip label="NATA 2026" sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }} />
            <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2rem', sm: '2.5rem', md: '3.5rem' } }}>
              NATA 2026 Photo & Signature Requirements
            </Typography>
            <Typography variant="h5" sx={{ mb: 2, opacity: 0.9, fontSize: { xs: '1.1rem', md: '1.5rem' } }}>
              Your NATA 2026 application requires a passport-size photo (3.5x4.5 cm, 4-100 KB, JPG) and a signature scan (3.5x1.5 cm, 1-30 KB, JPG). Both must be on white background.
            </Typography>
            <LastUpdatedBadge date="March 13, 2026" />
          </Container>
        </Box>

        {/* Specifications */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="lg">
            <Grid container spacing={4}>
              {/* Photo */}
              <Grid item xs={12} md={6}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                    <Typography variant="h4" sx={{ mb: 1 }}>📷</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>Photograph Specifications</Typography>
                    {photoSpecs.map((row, idx) => (
                      <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', py: 1.5, borderBottom: idx < photoSpecs.length - 1 ? '1px solid' : 'none', borderColor: 'divider' }}>
                        <Typography variant="body2" color="text.secondary">{row.label}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.value}</Typography>
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              </Grid>

              {/* Signature */}
              <Grid item xs={12} md={6}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                    <Typography variant="h4" sx={{ mb: 1 }}>✍️</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>Signature Specifications</Typography>
                    {signatureSpecs.map((row, idx) => (
                      <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', py: 1.5, borderBottom: idx < signatureSpecs.length - 1 ? '1px solid' : 'none', borderColor: 'divider' }}>
                        <Typography variant="body2" color="text.secondary">{row.label}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.value}</Typography>
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* CTA: Image Crop Tool */}
        <Box sx={{ py: { xs: 4, md: 6 }, bgcolor: 'grey.50', textAlign: 'center' }}>
          <Container maxWidth="md">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>Crop & Resize Your Photo and Signature</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Use our free Image Crop tool to resize your photo and signature to exact NATA specifications. No software needed.
            </Typography>
            <Button variant="contained" size="large" component="a" href={`${APP_URL}/tools/nata/image-crop`} target="_blank" rel="noopener noreferrer">
              Open Image Crop Tool (Free)
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
                { title: 'NATA 2026 Fee Structure', slug: 'fee-structure' },
                { title: "Do's & Don'ts", slug: 'dos-and-donts' },
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
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 4, fontWeight: 700 }}>FAQs — Photo & Signature</Typography>
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
