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
import { locations, type Location } from '@neram/database';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateCourseSchema, generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { BASE_URL, ORG_NAME, SOCIAL_PROFILES } from '@/lib/seo/constants';
import { buildAlternates } from '@/lib/seo/metadata';
import RelatedContent from '@/components/seo/RelatedContent';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Best Online NATA Coaching in Tamil Nadu 2026',
    description: 'Neram Classes offers the best online NATA coaching in Tamil Nadu with 99.9% success rate. Expert IIT/NIT faculty, live classes, daily drawing practice. Online & offline NATA 2026 preparation from Chennai, Coimbatore, Madurai & across India.',
    keywords: 'best online NATA coaching Tamil Nadu, NATA coaching Tamil Nadu, online NATA classes, NATA 2026 coaching, NATA preparation Tamil Nadu, NATA coaching Chennai, NATA coaching Coimbatore, best NATA coaching institute India, NATA online classes, Neram Classes NATA',
    alternates: buildAlternates(locale, '/coaching/nata-coaching'),
  };
}

interface PageProps {
  params: { locale: string };
}

const features = [
  { icon: '👨‍🏫', title: '50+ Expert Faculty', desc: 'Learn from IIT/NIT alumni and practicing architects' },
  { icon: '📚', title: '500+ Study Hours', desc: 'Comprehensive curriculum covering entire syllabus' },
  { icon: '✏️', title: 'Daily Drawing Practice', desc: '2+ hours of supervised drawing practice daily' },
  { icon: '📝', title: '100+ Mock Tests', desc: 'Regular assessments with detailed analysis' },
  { icon: '🎯', title: '99.9% Success Rate', desc: 'Proven track record of producing top rankers' },
  { icon: '💬', title: '24/7 Doubt Support', desc: 'Get your queries resolved anytime, anywhere' },
];

const courseDetails = [
  { label: 'Duration', value: '3-24 Months' },
  { label: 'Mode', value: 'Online & Offline' },
  { label: 'Batch Size', value: '20-25 Students' },
  { label: 'Language', value: 'English & Regional' },
];

const popularCities = [
  { city: 'Chennai', slug: 'chennai' },
  { city: 'Bangalore', slug: 'bangalore' },
  { city: 'Hyderabad', slug: 'hyderabad' },
  { city: 'Mumbai', slug: 'mumbai' },
  { city: 'Delhi', slug: 'delhi' },
  { city: 'Coimbatore', slug: 'coimbatore' },
  { city: 'Kochi', slug: 'kochi' },
  { city: 'Pune', slug: 'pune' },
  { city: 'Kolkata', slug: 'kolkata' },
  { city: 'Dubai', slug: 'dubai' },
  { city: 'Madurai', slug: 'madurai' },
  { city: 'Trichy', slug: 'trichy' },
];

export default function NataCoachingPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  const faqs = [
    { question: 'What is the best online NATA coaching in Tamil Nadu?', answer: 'Neram Classes is the top-rated online NATA coaching institute in Tamil Nadu with a 99.9% success rate. Based in Tamil Nadu, we offer live interactive online classes, daily drawing practice sessions, 100+ mock tests, and personal mentoring from IIT/NIT alumni faculty. Students from Chennai, Coimbatore, Madurai, Trichy, and across Tamil Nadu trust Neram Classes for NATA preparation.' },
    { question: 'How much does NATA coaching cost at Neram Classes?', answer: 'NATA coaching fees at Neram Classes range from ₹15,000 for a 3-month crash course to ₹35,000 for a 2-year program. We also offer a 1-year program starting at ₹25,000 (single payment). Scholarships and flexible payment options available. Our pricing is competitive compared to other NATA coaching institutes in Tamil Nadu.' },
    { question: 'Does Neram Classes offer online NATA classes?', answer: 'Yes, Neram Classes offers comprehensive online NATA coaching with live interactive sessions, recorded lectures, daily supervised drawing practice, and personal mentoring. Our online program delivers the same 99.9% success rate as our offline classes. Students can attend from anywhere in Tamil Nadu, India, or even abroad.' },
    { question: 'What is Neram Classes\' success rate for NATA?', answer: 'Neram Classes maintains a 99.9% success rate for NATA exam preparation. Over 10,000 students have successfully cleared NATA through our coaching programs. Our students consistently score 150+ marks, with many achieving top ranks in Tamil Nadu and across India. We have produced multiple state toppers and national rankers.' },
    { question: 'Can I join Neram Classes from outside Tamil Nadu?', answer: 'Absolutely! While Neram Classes is headquartered in Tamil Nadu, our online NATA coaching program is accessible from anywhere in India and internationally. We have students from 90+ cities including Chennai, Bangalore, Hyderabad, Mumbai, Delhi, and Gulf countries. All online students get the same curriculum, faculty access, and study materials as our Tamil Nadu students.' },
    { question: 'How long should I prepare for NATA 2026?', answer: 'Ideally, 12-24 months of dedicated preparation is recommended for NATA 2026. Neram Classes offers a 2-year program, a 1-year program, and a 3-month crash course for last-minute preparation. Early starters can join our 2-year foundation batch starting from Class 11. The key is consistent daily practice, especially for the drawing section which carries 80 marks.' },
  ];

  return (
    <>
      <JsonLd data={generateCourseSchema({
        name: 'NATA 2026 Coaching Program - Online & Offline Classes',
        description: 'Best online NATA coaching in Tamil Nadu. Comprehensive NATA 2026 preparation course with expert IIT/NIT alumni faculty. Covers Mathematics, General Aptitude, and Drawing. Online and offline classes available across Tamil Nadu and India.',
        url: `${BASE_URL}/coaching/nata-coaching`,
        modes: ['online', 'onsite'],
        price: 15000,
      })} />
      <JsonLd data={generateBreadcrumbSchema([
        { name: 'Home', url: BASE_URL },
        { name: 'Coaching', url: `${BASE_URL}/coaching` },
        { name: 'NATA Coaching' },
      ])} />
      <JsonLd data={generateFAQSchema(faqs)} />
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'EducationalOrganization',
        '@id': `${BASE_URL}/#coaching-nata`,
        name: ORG_NAME,
        url: BASE_URL,
        description: 'Best online NATA coaching institute in Tamil Nadu, India. Expert IIT/NIT alumni faculty, 99.9% success rate, 10,000+ successful students.',
        areaServed: [
          { '@type': 'State', name: 'Tamil Nadu' },
          { '@type': 'Country', name: 'India' },
        ],
        sameAs: SOCIAL_PROFILES,
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: 'NATA 2026 Coaching Programs',
          itemListElement: [
            {
              '@type': 'Course',
              name: 'NATA 2026 Crash Course',
              description: 'Intensive 3-month NATA preparation crash course for quick preparation. Covers Mathematics, General Aptitude, and Drawing.',
              provider: { '@type': 'EducationalOrganization', name: ORG_NAME, areaServed: 'Tamil Nadu, India' },
              educationalLevel: '12th Pass',
              timeRequired: 'P3M',
              teaches: ['Mathematics', 'General Aptitude', 'Drawing', 'Architecture Awareness'],
              hasCourseInstance: { '@type': 'CourseInstance', courseMode: ['online', 'onsite'] },
              offers: { '@type': 'Offer', price: '15000', priceCurrency: 'INR', availability: 'https://schema.org/InStock' },
            },
            {
              '@type': 'Course',
              name: 'NATA 1-Year Program',
              description: 'Comprehensive 12-month NATA coaching with complete syllabus coverage, daily drawing practice, and 100+ mock tests.',
              provider: { '@type': 'EducationalOrganization', name: ORG_NAME, areaServed: 'Tamil Nadu, India' },
              educationalLevel: '12th Pass',
              timeRequired: 'P12M',
              teaches: ['Mathematics', 'General Aptitude', 'Drawing', 'Architecture Awareness'],
              hasCourseInstance: { '@type': 'CourseInstance', courseMode: ['online', 'onsite'] },
              offers: { '@type': 'Offer', price: '25000', priceCurrency: 'INR', availability: 'https://schema.org/InStock' },
            },
            {
              '@type': 'Course',
              name: 'NATA 2-Year Program',
              description: '24-month NATA coaching with foundation + advanced preparation, 1-on-1 mentoring, and complete NATA & JEE Paper 2 coverage.',
              provider: { '@type': 'EducationalOrganization', name: ORG_NAME, areaServed: 'Tamil Nadu, India' },
              educationalLevel: '12th Pass',
              timeRequired: 'P24M',
              teaches: ['Mathematics', 'General Aptitude', 'Drawing', 'Architecture Awareness'],
              hasCourseInstance: { '@type': 'CourseInstance', courseMode: ['online', 'onsite'] },
              offers: { '@type': 'Offer', price: '30000', priceCurrency: 'INR', availability: 'https://schema.org/InStock' },
            },
          ],
        },
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: '4.8',
          reviewCount: '2500',
          bestRating: '5',
          worstRating: '1',
        },
      }} />
      <Box>
        {/* Hero Section */}
        <Box
          sx={{
            py: { xs: 8, md: 12 },
            background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)',
            color: 'white',
          }}
        >
          <Container maxWidth="lg">
            <Grid container spacing={4} alignItems="center">
              <Grid item xs={12} md={7}>
                <Chip label="NATA 2026" sx={{ bgcolor: 'white', color: 'primary.main', mb: 2 }} />
                <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2.5rem', md: '3.5rem' } }}>
                  Best Online NATA Coaching in Tamil Nadu & India
                </Typography>
                <Typography variant="h5" sx={{ mb: 4, opacity: 0.9 }}>
                  Join 10,000+ successful architects who started their journey with Neram Classes.
                  Online and offline classes available across 90+ cities.
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    size="large"
                    component={Link}
                    href="/apply"
                    sx={{ bgcolor: 'white', color: 'primary.main' }}
                  >
                    Enroll Now
                  </Button>
                  <Button
                    variant="outlined"
                    size="large"
                    component={Link}
                    href="/contact"
                    sx={{ borderColor: 'white', color: 'white' }}
                  >
                    Book Free Demo
                  </Button>
                </Box>
              </Grid>
              <Grid item xs={12} md={5}>
                <Card sx={{ bgcolor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
                  <CardContent sx={{ p: 4 }}>
                    <Typography variant="h6" gutterBottom sx={{ color: 'white' }}>Course Details</Typography>
                    {courseDetails.map((detail, idx) => (
                      <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                        <Typography variant="body2" sx={{ opacity: 0.8 }}>{detail.label}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{detail.value}</Typography>
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* Features Section */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
              Why Choose Our NATA Coaching?
            </Typography>
            <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 6 }}>
              Everything you need to crack NATA with a top rank
            </Typography>

            <Grid container spacing={4}>
              {features.map((feature, index) => (
                <Grid item xs={12} sm={6} md={4} key={index}>
                  <Card sx={{ height: '100%', textAlign: 'center', p: 3 }}>
                    <Typography variant="h2" sx={{ mb: 2 }}>{feature.icon}</Typography>
                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>{feature.title}</Typography>
                    <Typography variant="body2" color="text.secondary">{feature.desc}</Typography>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Syllabus Section */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 6, fontWeight: 700 }}>
              What We Cover
            </Typography>
            <Grid container spacing={4}>
              {[
                { title: 'Mathematics (40 Marks)', topics: ['Coordinate Geometry', 'Matrices & Determinants', 'Calculus', 'Trigonometry', 'Statistics & Probability'] },
                { title: 'General Aptitude (80 Marks)', topics: ['Logical Reasoning', 'Visual Reasoning', 'Spatial Ability', 'Architectural Awareness', 'General Knowledge'] },
                { title: 'Drawing Test (80 Marks)', topics: ['Perspective Drawing', 'Free Hand Sketching', '2D & 3D Compositions', 'Imaginative Drawing', 'Design Problems'] },
              ].map((section, index) => (
                <Grid item xs={12} md={4} key={index}>
                  <Card sx={{ height: '100%' }}>
                    <CardContent sx={{ p: 4 }}>
                      <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, color: 'primary.main' }}>
                        {section.title}
                      </Typography>
                      <List dense>
                        {section.topics.map((topic, idx) => (
                          <ListItem key={idx} sx={{ px: 0 }}>
                            <ListItemIcon sx={{ minWidth: 28 }}>
                              <Typography color="success.main">✓</Typography>
                            </ListItemIcon>
                            <ListItemText primary={topic} />
                          </ListItem>
                        ))}
                      </List>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Location Section */}
        <Box sx={{ py: { xs: 6, md: 10 } }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
              NATA Coaching Centers
            </Typography>
            <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 6 }}>
              Find NATA coaching near you - Available in 90+ cities
            </Typography>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 2 }}>
              {popularCities.map((city, index) => (
                <Chip
                  key={index}
                  label={`NATA Coaching in ${city.city}`}
                  component={Link}
                  href={`/coaching/nata-coaching/nata-coaching-centers-in-${city.slug}`}
                  clickable
                  sx={{
                    fontSize: '0.9rem',
                    py: 2.5,
                    px: 1,
                    '&:hover': { bgcolor: 'primary.main', color: 'white' },
                  }}
                />
              ))}
            </Box>

            <Box sx={{ textAlign: 'center', mt: 4 }}>
              <Button
                component={Link}
                href="/coaching/nata-coaching-center-in-tamil-nadu"
                variant="contained"
                size="large"
                sx={{ mr: 2, mb: 1 }}
              >
                NATA Coaching in Tamil Nadu — All 38 Districts
              </Button>
              <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
                Don&apos;t see your city? We offer online coaching accessible from anywhere!
              </Typography>
            </Box>
          </Container>
        </Box>

        {/* Browse All Cities Section */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ mb: 2, fontWeight: 700 }}
            >
              Browse NATA Coaching by City
            </Typography>
            <Typography
              variant="h6"
              align="center"
              color="text.secondary"
              sx={{ mb: 4 }}
            >
              Find NATA coaching in your city - {locations.length} cities across India and the Gulf
            </Typography>

            {(() => {
              // Group locations by stateDisplay
              const grouped: Record<string, Location[]> = {};
              for (const loc of locations) {
                const key = loc.stateDisplay;
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(loc);
              }
              // Sort states alphabetically
              const sortedStates = Object.keys(grouped).sort();

              return sortedStates.map((stateName) => (
                <Accordion
                  key={stateName}
                  disableGutters
                  sx={{
                    '&:before': { display: 'none' },
                    mb: 1,
                    borderRadius: 1,
                    overflow: 'hidden',
                  }}
                >
                  <AccordionSummary
                    expandIcon={
                      <Typography sx={{ fontSize: '1.2rem', fontWeight: 600 }}>+</Typography>
                    }
                    sx={{
                      bgcolor: 'white',
                      '&:hover': { bgcolor: 'grey.100' },
                    }}
                  >
                    <Typography sx={{ fontWeight: 600 }}>
                      {stateName}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ ml: 1, alignSelf: 'center' }}
                    >
                      ({grouped[stateName].length} {grouped[stateName].length === 1 ? 'city' : 'cities'})
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ bgcolor: 'white', pt: 0 }}>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {grouped[stateName].map((loc) => (
                        <Chip
                          key={loc.city}
                          label={loc.cityDisplay}
                          component={Link}
                          href={`/${locale}/coaching/nata-coaching/nata-coaching-centers-in-${loc.city}`}
                          clickable
                          size="medium"
                          sx={{
                            fontSize: '0.85rem',
                            '&:hover': {
                              bgcolor: 'primary.main',
                              color: 'white',
                            },
                          }}
                        />
                      ))}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              ));
            })()}
          </Container>
        </Box>

        {/* FAQ Section - Visible for crawlers and users */}
        <Box sx={{ py: { xs: 6, md: 10 } }}>
          <Container maxWidth="lg">
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ mb: 2, fontWeight: 700 }}
            >
              Frequently Asked Questions about NATA Coaching
            </Typography>
            <Typography
              variant="h6"
              align="center"
              color="text.secondary"
              sx={{ mb: 6 }}
            >
              Common questions about NATA 2026 coaching at Neram Classes, Tamil Nadu
            </Typography>

            {faqs.map((faq, index) => (
              <Accordion
                key={index}
                defaultExpanded={index === 0}
                disableGutters
                sx={{
                  '&:before': { display: 'none' },
                  mb: 1.5,
                  borderRadius: 1,
                  overflow: 'hidden',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <AccordionSummary
                  expandIcon={
                    <Typography sx={{ fontSize: '1.2rem', fontWeight: 600 }}>+</Typography>
                  }
                  sx={{
                    bgcolor: 'white',
                    '&:hover': { bgcolor: 'grey.50' },
                  }}
                >
                  <Typography sx={{ fontWeight: 600, fontSize: { xs: '0.95rem', md: '1.1rem' } }}>
                    {faq.question}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ bgcolor: 'white', pt: 0, pb: 3, px: 3 }}>
                  <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                    {faq.answer}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Container>
        </Box>

        {/* Related Content */}
        <RelatedContent
          heading="Helpful Resources for NATA"
          locale={locale}
          links={[
            { title: 'NATA Syllabus 2026', description: 'Complete section-wise syllabus breakdown', href: '/nata-syllabus' },
            { title: 'Best Books for NATA & JEE', description: 'Recommended study materials and reference books', href: '/best-books-nata-jee' },
            { title: 'JEE Paper 2 Preparation', description: 'Alternative path to top architecture colleges', href: '/jee-paper-2-preparation' },
            { title: 'NATA Preparation Guide', description: 'Step-by-step 6-month preparation strategy', href: '/nata-preparation-guide' },
          ]}
        />

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
            <Typography variant="h2" component="h2" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '1.75rem', md: '2.5rem' } }}>
              Start Your NATA Journey Today
            </Typography>
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
              Limited seats available for the upcoming batch. Enroll now!
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                size="large"
                component={Link}
                href="/apply"
                sx={{ bgcolor: 'white', color: 'primary.main' }}
              >
                Enroll Now
              </Button>
              <Button
                variant="outlined"
                size="large"
                component={Link}
                href="/nata-syllabus"
                sx={{ borderColor: 'white', color: 'white' }}
              >
                View Syllabus
              </Button>
            </Box>
          </Container>
        </Box>
      </Box>
    </>
  );
}
