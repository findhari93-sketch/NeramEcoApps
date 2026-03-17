import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  Button,
} from '@neram/ui';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateCenterLocalBusinessSchema,
  generateFAQSchema,
  generateBreadcrumbSchema,
  generateCourseSchema,
} from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { locales } from '@/i18n';
import CenterDetailPageContent from '@/components/CenterDetailPageContent';
import { getCenterBySeoSlug, getAllCenterSeoSlugs } from '@neram/database/queries';
import type { OfflineCenter } from '@neram/database';

const baseUrl = 'https://neramclasses.com';

// ─── Static Params ──────────────────────────────────────────────────────────

export async function generateStaticParams() {
  try {
    const slugs = await getAllCenterSeoSlugs();
    const params: Array<{ locale: string; slug: string }> = [];
    for (const locale of locales) {
      for (const slug of slugs) {
        params.push({ locale, slug });
      }
    }
    return params;
  } catch {
    return [];
  }
}

// ─── Metadata ───────────────────────────────────────────────────────────────

export async function generateMetadata({
  params: { locale, slug },
}: {
  params: { locale: string; slug: string };
}): Promise<Metadata> {
  let center: OfflineCenter | null = null;
  try {
    center = await getCenterBySeoSlug(slug);
  } catch {
    // Fall back to generic metadata
  }

  const cityName = center?.city || slug.replace(/nata-coaching-center-in-/g, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const nearbyCities = center?.nearby_cities || [];
  const nearbyText = nearbyCities.length > 0 ? ` Students from ${nearbyCities.slice(0, 3).join(', ')} welcome.` : '';

  const title = `Best NATA Coaching Center in ${cityName} 2026 - Neram Classes`;
  const description = center
    ? `Visit Neram Classes ${center.name} at ${center.address}, ${center.city}. Expert NATA & JEE Paper 2 coaching with IIT/NIT alumni faculty. Online & offline classes.${nearbyText} Call ${center.contact_phone || '+91-9176137043'}.`
    : `Neram Classes NATA coaching center in ${cityName}. Expert architecture entrance exam preparation with IIT/NIT alumni faculty.`;

  const nearbyKeywords = nearbyCities.slice(0, 4).map((c) => `NATA coaching near ${c}`).join(', ');

  return {
    title,
    description,
    keywords: `NATA coaching ${cityName}, NATA classes ${cityName}, best NATA coaching in ${cityName}, JEE Paper 2 coaching ${cityName}, architecture coaching ${cityName}, NATA coaching near me ${cityName}${nearbyKeywords ? `, ${nearbyKeywords}` : ''}`,
    alternates: buildAlternates(locale, `/contact/${slug}`),
    openGraph: {
      title,
      description,
      type: 'website',
      url: locale === 'en' ? `${baseUrl}/contact/${slug}` : `${baseUrl}/${locale}/contact/${slug}`,
    },
  };
}

// ─── FAQ Builder ────────────────────────────────────────────────────────────

function buildCenterFAQs(center: OfflineCenter) {
  const city = center.city;
  const nearby = center.nearby_cities || [];
  const nearbyMention = nearby.length > 0
    ? nearby.slice(0, 3).join(', ')
    : 'nearby areas';

  return [
    {
      question: `What is the fee for NATA coaching in ${city}?`,
      answer: `Our NATA course fees at ${city} range from ₹15,000 to ₹35,000 depending on the course duration (3, 12, or 24 months) and mode (online/offline). Contact us at ${center.contact_phone || '+91-9176137043'} for detailed fee structure and scholarship options.`,
    },
    {
      question: `Is there an offline NATA coaching center in ${city}?`,
      answer: `Yes, Neram Classes has a fully-equipped offline coaching center in ${city} at ${center.address}. We offer both online and offline classes with dedicated drawing studios, projectors, and a supportive learning environment.`,
    },
    {
      question: `What are the batch timings at Neram Classes ${city}?`,
      answer: `We offer flexible batch timings at our ${city} center — morning (9 AM - 12 PM), evening (4 PM - 7 PM), and weekend batches (Saturday 9 AM - 2 PM). This allows school and college students to attend without missing their regular classes.`,
    },
    {
      question: `Do you provide study materials for NATA preparation?`,
      answer: `Yes, comprehensive study materials, previous year question papers, drawing practice sheets, and online resources are all included in the course fee. Our materials are curated by IIT/NIT alumni faculty and updated every year.`,
    },
    {
      question: `Can students from ${nearbyMention} join this center?`,
      answer: `Absolutely! Our ${city} center welcomes students from ${nearbyMention} and surrounding areas. Many of our current students commute from nearby towns. We also offer online classes for those who can't travel daily.`,
    },
    {
      question: `What is the success rate of Neram Classes?`,
      answer: `Neram Classes has a 99.9% success rate in NATA and JEE Paper 2 exams. Our students consistently secure top ranks, with many getting admitted to prestigious architecture colleges like SPA Delhi, SPA Bhopal, NIT Trichy, and IIT Kharagpur.`,
    },
    {
      question: `Do you offer online NATA coaching from ${city}?`,
      answer: `Yes, we offer live interactive online NATA coaching from our ${city} center. Online students get the same faculty, study materials, mock tests, and doubt-clearing sessions as offline students. This is ideal for students from ${nearbyMention} who can't attend in person.`,
    },
    {
      question: `How to reach Neram Classes ${city}?`,
      answer: `Our ${city} center is located at ${center.address}, ${center.city}, ${center.state}. You can use Google Maps for directions. We are easily accessible from ${nearbyMention} by bus or train. Contact us at ${center.contact_phone || '+91-9176137043'} for detailed directions.`,
    },
  ];
}

// ─── Features Data ──────────────────────────────────────────────────────────

const features = [
  'Expert faculty from IIT/NIT background',
  'Small batch sizes (max 25 students)',
  'Comprehensive study material included',
  'Daily drawing practice sessions',
  'Weekly mock tests with analysis',
  '24/7 doubt resolution support',
  'Personal mentoring from toppers',
  'Online & offline modes available',
];

const coursePlans = [
  {
    name: 'Crash Course',
    duration: '3 Months',
    mode: 'Online/Offline',
    highlights: ['Intensive revision', 'Mock test series', 'Drawing practice'],
  },
  {
    name: '1-Year Program',
    duration: '12 Months',
    mode: 'Online/Offline',
    highlights: ['Complete syllabus', 'Daily drawing practice', '100+ mock tests'],
  },
  {
    name: '2-Year Program',
    duration: '24 Months',
    mode: 'Online/Offline',
    highlights: ['Foundation + Advanced', '1-on-1 mentoring', 'All resources'],
  },
];

// ─── Page Component ─────────────────────────────────────────────────────────

export default async function CenterDetailPage({
  params: { locale, slug },
}: {
  params: { locale: string; slug: string };
}) {
  setRequestLocale(locale);

  let center: OfflineCenter | null = null;
  try {
    center = await getCenterBySeoSlug(slug);
  } catch {
    // handled below
  }

  if (!center) {
    notFound();
  }

  const cityDisplay = center.city;
  const nearbyCities = center.nearby_cities || [];
  const faqs = buildCenterFAQs(center);
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  // ─── JSON-LD Schemas ────────────────────────────────────────────────────

  const centerSchema = generateCenterLocalBusinessSchema({
    name: center.name,
    url: localeUrl(`/contact/${slug}`),
    phone: center.contact_phone || undefined,
    email: center.contact_email || undefined,
    address: center.address,
    city: center.city,
    state: center.state,
    pincode: center.pincode || undefined,
    country: center.country,
    latitude: center.latitude ?? undefined,
    longitude: center.longitude ?? undefined,
    rating: center.rating,
    review_count: center.review_count,
    nearby_cities: nearbyCities,
    operating_hours: center.operating_hours as Record<string, { open: string; close: string } | null> | undefined,
  });

  const faqSchema = generateFAQSchema(faqs);

  const courseSchema = generateCourseSchema({
    name: `NATA Coaching in ${cityDisplay}`,
    description: `Comprehensive NATA and JEE Paper 2 preparation course at Neram Classes ${cityDisplay}. Expert IIT/NIT alumni faculty, study materials, and mock tests included.`,
    url: localeUrl(`/contact/${slug}`),
    modes: ['online', 'onsite'],
  });

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: locale === 'en' ? baseUrl : `${baseUrl}/${locale}` },
    { name: 'Contact', url: localeUrl('/contact') },
    { name: center.name },
  ]);

  return (
    <>
      <JsonLd data={[centerSchema, faqSchema, courseSchema, breadcrumbSchema]} />

      {/* ── Interactive Section (map, form, buttons) ─────────────────── */}
      <CenterDetailPageContent center={center} />

      {/* ── Server-Rendered SEO Content (crawlable by Google + AI) ─── */}

      {/* About This Center */}
      <Box sx={{ py: { xs: 5, md: 8 } }}>
        <Container maxWidth="lg">
          <Grid container spacing={6}>
            <Grid item xs={12} md={7}>
              <Typography variant="h2" component="h2" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2rem' } }}>
                About NATA Coaching in {cityDisplay}
              </Typography>
              <Typography variant="body1" paragraph>
                {cityDisplay} is home to many aspiring architects who dream of getting into top architecture colleges
                in India. The National Aptitude Test in Architecture (NATA) is the gateway to premier B.Arch programs
                across the country. At Neram Classes {cityDisplay}, we provide expert coaching to help students crack NATA
                with top ranks.
              </Typography>
              <Typography variant="body1" paragraph>
                Our {cityDisplay} center is equipped with modern facilities including dedicated drawing studios,
                projectors, and a supportive learning environment. With a team of experienced faculty from IIT and NIT
                backgrounds, we have consistently produced top rankers in NATA and JEE Paper 2 every year.
              </Typography>
              <Typography variant="body1" paragraph>
                Whether you are a 12th-pass student or a repeater, our structured curriculum covers all three NATA sections —
                Mathematics, General Aptitude, and Drawing — with equal emphasis. We offer flexible batch timings and
                both online and offline modes to suit every student&apos;s needs.
              </Typography>
            </Grid>
            <Grid item xs={12} md={5}>
              <Card>
                <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                  <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
                    Why Choose Neram Classes in {cityDisplay}?
                  </Typography>
                  <List>
                    {features.map((feature, idx) => (
                      <ListItem key={idx} sx={{ px: 0, py: 0.5 }}>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <Typography color="success.main">✓</Typography>
                        </ListItemIcon>
                        <ListItemText primary={feature} primaryTypographyProps={{ variant: 'body2' }} />
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Courses Section */}
      <Box sx={{ py: { xs: 5, md: 8 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2rem' }, mb: 4 }}>
            NATA Courses Offered in {cityDisplay}
          </Typography>
          <Grid container spacing={3}>
            {coursePlans.map((plan, index) => (
              <Grid item xs={12} md={4} key={index}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ p: { xs: 3, md: 4 }, textAlign: 'center' }}>
                    <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>{plan.name}</Typography>
                    <Typography variant="h4" color="primary" sx={{ fontWeight: 700, my: 2 }}>{plan.duration}</Typography>
                    <Chip label={plan.mode} size="small" variant="outlined" sx={{ mb: 3 }} />
                    <List dense>
                      {plan.highlights.map((highlight, idx) => (
                        <ListItem key={idx} sx={{ justifyContent: 'center', px: 0 }}>
                          <ListItemIcon sx={{ minWidth: 24 }}>
                            <Typography color="success.main">✓</Typography>
                          </ListItemIcon>
                          <ListItemText primary={highlight} />
                        </ListItem>
                      ))}
                    </List>
                    <Button variant="outlined" fullWidth sx={{ mt: 2 }} component={Link} href={`/${locale}/apply`}>
                      Enquire Now
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Nearby Cities Section */}
      {nearbyCities.length > 0 && (
        <Box sx={{ py: { xs: 5, md: 8 } }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2rem' } }}>
              NATA Coaching for Students from {cityDisplay} and Nearby Areas
            </Typography>
            <Typography variant="body1" paragraph>
              Our {cityDisplay} center serves students from {nearbyCities.join(', ')}, and surrounding areas
              in {center.state}. Whether you are from {nearbyCities[0]} or {nearbyCities[nearbyCities.length - 1]},
              our convenient location and flexible timings make it easy to attend NATA coaching classes at our center.
            </Typography>
            <Typography variant="body1" paragraph>
              Many of our current students commute from nearby towns for weekend and evening batches. For students
              who cannot travel daily, we offer comprehensive online NATA coaching with the same expert faculty,
              study materials, and mock test series.
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
              {nearbyCities.map((nearby) => (
                <Chip
                  key={nearby}
                  label={`NATA coaching near ${nearby}`}
                  variant="outlined"
                  color="primary"
                  size="small"
                />
              ))}
            </Box>
          </Container>
        </Box>
      )}

      {/* FAQ Section */}
      <Box sx={{ py: { xs: 5, md: 8 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2rem' }, mb: 4 }}>
            Frequently Asked Questions — NATA Coaching in {cityDisplay}
          </Typography>
          <Grid container spacing={3}>
            {faqs.map((faq, index) => (
              <Grid item xs={12} md={6} key={index}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ p: 3 }}>
                    <Typography variant="h6" component="h3" gutterBottom sx={{ fontWeight: 600 }}>
                      {faq.question}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {faq.answer}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* CTA Section */}
      <Box
        sx={{
          py: { xs: 6, md: 10 },
          bgcolor: 'primary.main',
          color: 'white',
          textAlign: 'center',
        }}
      >
        <Container maxWidth="md">
          <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2.2rem' } }}>
            Ready to Start Your Architecture Journey in {cityDisplay}?
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9, fontSize: { xs: '1rem', md: '1.25rem' } }}>
            Join the best NATA coaching in {cityDisplay} and transform your dream into reality.
            Expert IIT/NIT faculty, proven results, and comprehensive preparation.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="large"
              component={Link}
              href={`/${locale}/apply`}
              sx={{ bgcolor: 'white', color: 'primary.main', '&:hover': { bgcolor: 'grey.100' }, minHeight: 48 }}
            >
              Enroll Now
            </Button>
            <Button
              variant="outlined"
              size="large"
              component={Link}
              href={`/${locale}/demo-class`}
              sx={{ borderColor: 'white', color: 'white', minHeight: 48 }}
            >
              Book Free Demo
            </Button>
            <Button
              variant="outlined"
              size="large"
              href={`tel:${center.contact_phone || '+919176137043'}`}
              sx={{ borderColor: 'white', color: 'white', minHeight: 48 }}
            >
              Call: {center.contact_phone || '+91-9176137043'}
            </Button>
          </Box>
        </Container>
      </Box>
    </>
  );
}
