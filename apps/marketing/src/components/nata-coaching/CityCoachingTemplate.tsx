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
  Stack,
  Divider,
} from '@neram/ui';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateOrganizationSchema,
  generateCourseSchema,
  generateBreadcrumbSchema,
  generateFAQSchema,
  generateLocalBusinessSchema,
} from '@/lib/seo/schemas';
import { BASE_URL } from '@/lib/seo/constants';
import { NataAssistanceForm } from '@/components/nata/NataAssistanceForm';
import type { CityData } from './city-data';

interface Props {
  city: CityData;
  locale?: string;
}

const courses = [
  { name: 'NATA Crash Course', duration: '3 Months', priceDisplay: '15,000' },
  { name: '1-Year NATA Program', duration: '12 Months', priceDisplay: '25,000' },
  { name: '2-Year NATA Program', duration: '24 Months', priceDisplay: '30,000' },
];

const features = [
  'Live classes by NIT, IIT, SPA alumni faculty',
  'Daily 2-hour drawing practice with critique',
  'Max 25 students per batch (individual attention)',
  '100+ full-length mock tests with analysis',
  'Recorded lectures for unlimited revision',
  '24/7 WhatsApp doubt resolution',
  '99.9% success rate across 17+ years',
  'Free AI study app (cutoff calculator, college predictor)',
];

export default function CityCoachingTemplate({ city, locale = 'en' }: Props) {
  const pageUrl = `${BASE_URL}/nata-coaching/${city.slug}`;

  const faqs = [
    {
      question: `Is NATA online coaching from ${city.displayName} as effective as offline coaching?`,
      answer: `Yes. Neram Classes NATA online coaching delivers the same 99.9% success rate as our offline batches. Students from ${city.displayName} attend live interactive sessions with NIT/IIT alumni faculty, get daily drawing critique via video, and access all 100+ mock tests, with no travel required.`,
    },
    {
      question: `What is the fee for NATA online coaching in ${city.displayName}?`,
      answer: `Fees are uniform nationally and start at Rs. 15,000 for the 3-month NATA crash course, Rs. 25,000 for the 1-year program, and Rs. 30,000 for the 2-year program. EMI options and need-based scholarships are available for ${city.displayName} students.`,
    },
    {
      question: `Where is the NATA 2026 exam centre near ${city.displayName}?`,
      answer: `${city.nataExamCenters.length > 0 ? `Publicly listed NATA exam centres serving ${city.displayName} include ${city.nataExamCenters.join(', ')}.` : `Check the Council of Architecture (CoA) NATA portal for exam centres near ${city.displayName}.`} Exact centre allocation is confirmed on the admit card.`,
    },
    {
      question: `Which architecture colleges do ${city.displayName} students target after NATA?`,
      answer: `${city.displayName} students commonly aim for ${city.topArchColleges.slice(0, 4).join(', ')}, along with national institutes like SPA Delhi, NIT Trichy, NIT Calicut, and CEPT Ahmedabad. Our college predictor tool gives personalised admission chances for any NATA score.`,
    },
    {
      question: `When do new NATA online batches start for ${city.displayName} students?`,
      answer: 'New batches start every month, with separate morning, evening, and weekend slots. Reserve a seat from the upcoming batches list on the main coaching page. Each batch is capped at 25 students.',
    },
    {
      question: `Can I switch to offline coaching later if I move to Chennai or Bangalore from ${city.displayName}?`,
      answer: 'Yes. Neram Classes runs a hybrid online + offline model. Enrolled students can switch attendance mode anytime without an extra fee. If you relocate to Chennai, Bangalore, or Coimbatore, your progress carries over to the new mode.',
    },
    {
      question: `Is NATA coaching available in Tamil for ${city.displayName} students?`,
      answer: 'Yes. Neram Classes is the only NATA institute offering coaching in 5 languages: English, Tamil, Hindi, Kannada, and Malayalam. Tamil-medium aspirants from across Tamil Nadu can choose a Tamil-language batch during enrolment.',
    },
  ];

  return (
    <>
      <JsonLd data={generateOrganizationSchema()} />
      <JsonLd
        data={generateCourseSchema({
          name: `NATA Online Coaching in ${city.displayName} 2026`,
          description: `Best NATA online coaching for students in ${city.displayName}, ${city.state}. Live classes by NIT, IIT, SPA alumni faculty, daily drawing practice, 100+ mock tests, 99.9% success rate.`,
          url: pageUrl,
          modes: ['online'],
          price: 15000,
        })}
      />
      <JsonLd
        data={generateLocalBusinessSchema({
          city: city.slug,
          cityDisplay: city.displayName,
          state: city.state.toLowerCase().replace(/\s+/g, '-'),
          stateDisplay: city.state,
          slug: city.slug,
        })}
      />
      <JsonLd data={generateFAQSchema(faqs)} />
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: BASE_URL },
          { name: 'NATA Online Coaching', url: `${BASE_URL}/nata-online-coaching` },
          { name: city.displayName },
        ])}
      />

      <Box>
        {/* Hero */}
        <Box
          sx={{
            py: { xs: 7, md: 11 },
            background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)',
            color: 'white',
          }}
        >
          <Container maxWidth="lg">
            <Chip
              label={`NATA 2026: ${city.displayName} Aspirants`}
              sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }}
            />
            <Typography
              variant="h1"
              component="h1"
              gutterBottom
              sx={{ fontWeight: 700, fontSize: { xs: '2rem', md: '3rem' }, lineHeight: 1.2 }}
            >
              NATA Online Coaching in {city.displayName}
              {city.displayNameTamil ? ` (${city.displayNameTamil})` : ''}
            </Typography>
            <Typography variant="h5" sx={{ mb: 4, opacity: 0.92, lineHeight: 1.6, maxWidth: 820 }}>
              Live classes for {city.displayName} architecture aspirants. Taught by NIT, IIT, and SPA
              alumni faculty. 99.9% success rate, max 25 students per batch, daily drawing practice.
            </Typography>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <Button
                variant="contained"
                size="large"
                component={Link}
                href="/demo-class"
                sx={{ bgcolor: 'white', color: 'primary.main', fontWeight: 600, px: 4, minHeight: 48 }}
              >
                Book Free Demo
              </Button>
              <Button
                variant="outlined"
                size="large"
                component={Link}
                href="/apply"
                sx={{ borderColor: 'white', color: 'white', fontWeight: 600, px: 4, minHeight: 48 }}
              >
                Enroll Now
              </Button>
            </Stack>
          </Container>
        </Box>

        {/* Inline lead capture — keeps the visitor on the city page instead of
            hopping to /apply. defaultDistrict pre-fills, so {city.displayName}
            aspirants type only name + phone. */}
        <Box sx={{ py: { xs: 5, md: 7 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="md">
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2rem' }, mb: 1.5 }}
            >
              Get a free NATA study plan for {city.displayName}
            </Typography>
            <Typography
              variant="h6"
              align="center"
              color="text.secondary"
              sx={{ mb: 4, maxWidth: 620, mx: 'auto' }}
            >
              A {city.displayName} NATA mentor will call you back with a personalised study plan,
              fee details, and demo class slot, free of cost.
            </Typography>
            <NataAssistanceForm
              locale={locale}
              defaultDistrict={city.displayName}
              source={`nata-coaching/${city.slug}`}
            />
          </Container>
        </Box>

        {/* AEO answer block */}
        <Box sx={{ py: { xs: 5, md: 7 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography
              variant="h2"
              component="h2"
              gutterBottom
              sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2rem' } }}
            >
              NATA online coaching for {city.displayName} students
            </Typography>
            <Typography variant="body1" sx={{ lineHeight: 1.8, color: 'text.secondary', fontSize: '1.05rem', mb: 2 }}>
              {city.intro}
            </Typography>
            {city.neramPresence && (
              <Typography variant="body1" sx={{ lineHeight: 1.8, color: 'text.secondary', fontSize: '1.05rem' }}>
                {city.neramPresence}
              </Typography>
            )}
            {city.yearlyAspirantsLabel && (
              <Chip
                label={city.yearlyAspirantsLabel}
                sx={{ mt: 3, bgcolor: 'primary.50', color: 'primary.dark', fontWeight: 600 }}
              />
            )}
          </Container>
        </Box>

        {/* Why Neram for this city */}
        <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 5 }}>
              Why {city.displayName} aspirants choose Neram Classes
            </Typography>
            <Grid container spacing={3}>
              {features.map((feature) => (
                <Grid item xs={12} sm={6} md={4} key={feature}>
                  <Card sx={{ height: '100%', p: 2.5, display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        bgcolor: 'success.main',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      +
                    </Box>
                    <Typography variant="body1" sx={{ lineHeight: 1.6 }}>
                      {feature}
                    </Typography>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Fees */}
        <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'background.default' }}>
          <Container maxWidth="lg">
            <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
              NATA online coaching fees for {city.displayName}
            </Typography>
            <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 5, maxWidth: 700, mx: 'auto' }}>
              Uniform pricing nationally. EMI and scholarship options are available for {city.displayName} students.
            </Typography>
            <Grid container spacing={3} justifyContent="center">
              {courses.map((course, index) => (
                <Grid item xs={12} md={4} key={course.name}>
                  <Card
                    sx={{
                      height: '100%',
                      border: index === 1 ? '2px solid' : '1px solid',
                      borderColor: index === 1 ? 'primary.main' : 'grey.300',
                      position: 'relative',
                    }}
                  >
                    {index === 1 && (
                      <Chip
                        label="Most Popular"
                        size="small"
                        sx={{
                          position: 'absolute',
                          top: 16,
                          right: 16,
                          bgcolor: 'primary.main',
                          color: 'white',
                          fontWeight: 600,
                        }}
                      />
                    )}
                    <CardContent sx={{ p: 4 }}>
                      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
                        {course.name}
                      </Typography>
                      <Typography
                        variant="h3"
                        component="div"
                        sx={{ fontWeight: 700, color: 'primary.main', mb: 1 }}
                      >
                        Rs. {course.priceDisplay}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Duration: {course.duration} (EMI available)
                      </Typography>
                      <Button
                        variant={index === 1 ? 'contained' : 'outlined'}
                        fullWidth
                        size="large"
                        component={Link}
                        href="/apply"
                        sx={{ fontWeight: 600, minHeight: 48 }}
                      >
                        Enroll Now
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Local context: exam centres + colleges + served areas */}
        <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Grid container spacing={4}>
              <Grid item xs={12} md={4}>
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
                  NATA exam centres in {city.displayName}
                </Typography>
                <List dense>
                  {city.nataExamCenters.map((centre) => (
                    <ListItem key={centre} sx={{ px: 0 }}>
                      <ListItemIcon sx={{ minWidth: 28 }}>
                        <Typography color="primary.main" sx={{ fontWeight: 700 }}>
                          ·
                        </Typography>
                      </ListItemIcon>
                      <ListItemText primary={centre} />
                    </ListItem>
                  ))}
                </List>
                <Typography variant="caption" color="text.secondary">
                  Exact centre allotment is confirmed on the NATA admit card. Always check the Council of
                  Architecture (CoA) portal for the latest list.
                </Typography>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
                  Top architecture colleges {city.displayName} students target
                </Typography>
                <List dense>
                  {city.topArchColleges.map((college) => (
                    <ListItem key={college} sx={{ px: 0 }}>
                      <ListItemIcon sx={{ minWidth: 28 }}>
                        <Typography color="primary.main" sx={{ fontWeight: 700 }}>
                          ·
                        </Typography>
                      </ListItemIcon>
                      <ListItemText primary={college} />
                    </ListItem>
                  ))}
                </List>
                <Box sx={{ mt: 2 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    component={Link}
                    href="/tools/college-predictor"
                    sx={{ fontWeight: 600 }}
                  >
                    Try College Predictor
                  </Button>
                </Box>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
                  Areas served in {city.displayName}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {city.servedAreas.map((area) => (
                    <Chip key={area} label={area} size="small" variant="outlined" />
                  ))}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                  Online classes are accessible from every area in {city.displayName}. No commute required.
                </Typography>
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* FAQ */}
        <Box sx={{ py: { xs: 6, md: 9 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ mb: 2, fontWeight: 700 }}
            >
              {city.displayName} NATA Online Coaching FAQ
            </Typography>
            <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 5 }}>
              Common questions from {city.displayName} aspirants
            </Typography>
            {faqs.map((faq) => (
              <Accordion
                key={faq.question}
                disableGutters
                sx={{
                  '&:before': { display: 'none' },
                  mb: 1,
                  borderRadius: 1,
                  overflow: 'hidden',
                }}
              >
                <AccordionSummary
                  expandIcon={<Typography sx={{ fontSize: '1.2rem', fontWeight: 600 }}>+</Typography>}
                  sx={{ bgcolor: 'white', minHeight: 48, '&:hover': { bgcolor: 'grey.100' } }}
                >
                  <Typography sx={{ fontWeight: 600 }}>{faq.question}</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ bgcolor: 'white' }}>
                  <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                    {faq.answer}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Container>
        </Box>

        {/* Related links */}
        <Box sx={{ py: { xs: 5, md: 7 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Typography variant="h3" component="h2" align="center" gutterBottom sx={{ fontWeight: 700, mb: 4 }}>
              More NATA online coaching resources
            </Typography>
            <Grid container spacing={3}>
              {[
                {
                  title: 'NATA Online Coaching (main page)',
                  href: '/nata-online-coaching',
                  desc: 'Live batches, course fees, comparison with classroom coaching, and 20+ FAQs.',
                },
                {
                  title: 'NATA 2026 Complete Guide',
                  href: '/nata-2026',
                  desc: 'Eligibility, syllabus, exam pattern, important dates, exam centres.',
                },
                {
                  title: 'Free Cutoff Calculator',
                  href: '/tools/cutoff-calculator',
                  desc: 'Predict admission chances at top architecture colleges from your NATA score.',
                },
                {
                  title: 'Book Free Demo Class',
                  href: '/demo-class',
                  desc: 'Experience our teaching before enrolling. Live with faculty.',
                },
              ].map((link) => (
                <Grid item xs={12} sm={6} md={3} key={link.href}>
                  <Card
                    component={Link}
                    href={link.href}
                    sx={{
                      textDecoration: 'none',
                      height: '100%',
                      transition: 'all 0.2s',
                      '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 },
                    }}
                  >
                    <CardContent>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'primary.main', mb: 0.5 }}>
                        {link.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {link.desc}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Bottom CTA */}
        <Box
          sx={{
            py: { xs: 8, md: 12 },
            pb: { xs: 14, md: 12 },
            background: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 100%)',
            color: 'white',
            textAlign: 'center',
          }}
        >
          <Container maxWidth="md">
            <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '1.8rem', md: '2.4rem' } }}>
              Start NATA online coaching from {city.displayName} today
            </Typography>
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9, lineHeight: 1.6 }}>
              Limited to 25 students per batch. Reserve your seat before the next start date.
            </Typography>
            <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap" useFlexGap>
              <Button
                variant="contained"
                size="large"
                component={Link}
                href="/apply"
                sx={{ bgcolor: 'white', color: 'primary.main', fontWeight: 600, px: 4, minHeight: 48 }}
              >
                Enroll Now
              </Button>
              <Button
                variant="outlined"
                size="large"
                component={Link}
                href="/demo-class"
                sx={{ borderColor: 'white', color: 'white', fontWeight: 600, px: 4, minHeight: 48 }}
              >
                Book Free Demo
              </Button>
            </Stack>
          </Container>
        </Box>

        {/* Sticky mobile CTA */}
        <Box
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            display: { xs: 'flex', md: 'none' },
            gap: 1,
            p: 1.5,
            bgcolor: 'background.paper',
            borderTop: '1px solid',
            borderColor: 'grey.200',
            zIndex: 1100,
            boxShadow: '0 -2px 8px rgba(0,0,0,0.08)',
          }}
        >
          <Button
            variant="outlined"
            fullWidth
            component={Link}
            href="/demo-class"
            sx={{ fontWeight: 600, minHeight: 48, flex: 1 }}
          >
            Free Demo
          </Button>
          <Button
            variant="contained"
            fullWidth
            component={Link}
            href="/apply"
            sx={{ fontWeight: 600, minHeight: 48, flex: 1 }}
          >
            Enroll Now
          </Button>
        </Box>
      </Box>
    </>
  );
}
