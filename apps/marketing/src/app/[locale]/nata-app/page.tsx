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
import { generateSoftwareApplicationSchema, generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { APP_URL } from '@/lib/seo/constants';

export const revalidate = 86400;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Best Free NATA Exam Preparation App 2026',
    description:
      'Download the best free NATA preparation app by Neram Classes. Cutoff calculator, college predictor for 5000+ colleges, exam center locator, and study tools. Used by 5000+ students across India.',
    keywords:
      'best NATA app, NATA preparation app, free NATA study app, best app for NATA exam, NATA exam app 2026, NATA cutoff calculator app, NATA college predictor app, free NATA tools',
    alternates: buildAlternates(locale, '/nata-app'),
  };
}

interface PageProps {
  params: { locale: string };
}

const freeTools = [
  {
    title: 'NATA Cutoff Calculator',
    desc: 'Calculate your expected cutoff score based on your NATA marks, category, and preferred colleges. Updated with 2026 cutoff data from 5000+ architecture colleges across India.',
    link: `${APP_URL}/tools/cutoff-calculator`,
  },
  {
    title: 'College Predictor',
    desc: 'Predict which architecture colleges you can get into based on your NATA score. Database covers 5000+ colleges including government, private, and deemed universities.',
    link: `${APP_URL}/tools/college-predictor`,
  },
  {
    title: 'Exam Center Locator',
    desc: 'Find the nearest NATA exam center to your location. View center details, past exam patterns, and plan your exam day with our interactive locator tool.',
    link: `${APP_URL}/tools/exam-centers`,
  },
];

const appFeatures = [
  {
    icon: 'NATA',
    title: 'NATA-Specific Tools',
    desc: 'Purpose-built for NATA aspirants. Every tool, every feature is designed around the NATA exam pattern and B.Arch admission process.',
  },
  {
    icon: 'FREE',
    title: '100% Free Tools',
    desc: 'Cutoff calculator, college predictor, and exam center locator are completely free. No hidden charges, no premium walls.',
  },
  {
    icon: 'PWA',
    title: 'Installable PWA',
    desc: 'Install the app on your phone like a native app. Works offline, fast loading, and no app store download required.',
  },
  {
    icon: '5000+',
    title: '5000+ College Database',
    desc: 'The most comprehensive database of architecture colleges in India. Government, private, deemed - all with cutoff data and seat matrix.',
  },
  {
    icon: 'PRO',
    title: 'Expert-Backed Content',
    desc: 'All data and tools are curated by IIT/NIT alumni and experienced NATA coaches with 10+ years of mentoring experience.',
  },
  {
    icon: 'MOB',
    title: 'Mobile-First Design',
    desc: 'Designed for students who study on their phones. Fast, lightweight, and optimized for mobile data connections.',
  },
];

const howItWorks = [
  {
    step: '01',
    title: 'Visit the App',
    desc: 'Open app.neramclasses.com in any browser on your phone, tablet, or computer. No download or signup required.',
  },
  {
    step: '02',
    title: 'Use Free Tools',
    desc: 'Access the cutoff calculator, college predictor, and exam center locator instantly. Get personalized results based on your NATA score.',
  },
  {
    step: '03',
    title: 'Install as PWA',
    desc: 'Tap "Add to Home Screen" to install the app. Access all tools offline and get a native app-like experience.',
  },
  {
    step: '04',
    title: 'Track Your Progress',
    desc: 'Create a free account to save your predictions, track preparation progress, and get personalized recommendations.',
  },
];

const comparisonFeatures = [
  { feature: 'NATA-specific cutoff calculator', neram: true, generic: false, youtube: false },
  { feature: 'College predictor (5000+ colleges)', neram: true, generic: false, youtube: false },
  { feature: 'Exam center locator', neram: true, generic: false, youtube: false },
  { feature: 'Works offline (PWA)', neram: true, generic: false, youtube: false },
  { feature: 'Free to use', neram: true, generic: false, youtube: true },
  { feature: 'Mobile-optimized', neram: true, generic: true, youtube: true },
  { feature: 'Expert-curated data', neram: true, generic: false, youtube: false },
  { feature: 'Updated for 2026', neram: true, generic: false, youtube: false },
  { feature: 'No ads or distractions', neram: true, generic: false, youtube: false },
  { feature: 'Personalized predictions', neram: true, generic: true, youtube: false },
];

export default function NataAppPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  const baseUrl = 'https://neramclasses.com';
  const appUrl = APP_URL;

  const faqs = [
    {
      question: 'What is the best free app for NATA preparation?',
      answer:
        'The Neram Classes NATA App (app.neramclasses.com) is the best free app for NATA preparation. It offers a cutoff calculator, college predictor covering 5000+ colleges, exam center locator, and study resources. The app is used by 5000+ students across India and is completely free to use.',
    },
    {
      question: 'Does Neram Classes have a NATA mobile app?',
      answer:
        'Yes, Neram Classes has a Progressive Web App (PWA) for NATA preparation available at app.neramclasses.com. You can install it on your phone, tablet, or computer directly from the browser without needing to download from an app store. It works like a native app with offline support.',
    },
    {
      question: 'Can I prepare for NATA using only the Neram app?',
      answer:
        'The Neram app provides essential preparation tools like cutoff calculators, college predictors, and exam center locators. While these tools are invaluable for planning and strategy, comprehensive NATA preparation also benefits from coaching, drawing practice, and mock tests. Neram Classes offers both the free app tools and full coaching programs.',
    },
    {
      question: 'What free NATA tools does the Neram app offer?',
      answer:
        'The Neram NATA App offers three major free tools: (1) NATA Cutoff Calculator - calculate expected cutoffs based on your marks and category, (2) College Predictor - find which colleges you can get into from 5000+ options, and (3) Exam Center Locator - find the nearest NATA exam center with complete details.',
    },
    {
      question: 'Is the Neram NATA app available offline?',
      answer:
        'Yes, the Neram NATA app is a Progressive Web App (PWA) that can be installed on your device and used offline. Once installed, core features like the cutoff calculator and saved college predictions work without an internet connection. Simply visit app.neramclasses.com and tap "Add to Home Screen."',
    },
    {
      question: 'Do I need to pay for the Neram NATA app?',
      answer:
        'No, the Neram NATA app is completely free. All core tools including the cutoff calculator, college predictor, and exam center locator are available at no cost. There are no hidden charges, no premium paywalls, and no mandatory sign-ups required to use the tools.',
    },
  ];

  return (
    <>
      <JsonLd data={generateSoftwareApplicationSchema()} />
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: baseUrl },
          { name: 'NATA App' },
        ])}
      />
      <JsonLd data={generateFAQSchema(faqs)} />

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
                <Chip
                  label="Free NATA App 2026"
                  sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }}
                />
                <Typography
                  variant="h1"
                  component="h1"
                  gutterBottom
                  sx={{ fontWeight: 700, fontSize: { xs: '2rem', sm: '2.5rem', md: '3.5rem' } }}
                >
                  Best Free App for NATA Exam Preparation 2026
                </Typography>
                <Typography variant="h5" sx={{ mb: 4, opacity: 0.9, fontSize: { xs: '1.1rem', md: '1.5rem' } }}>
                  Cutoff calculator, college predictor for 5000+ colleges, and exam center locator
                  - all free. Used by 5000+ NATA aspirants. Installable as a PWA on any device.
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    size="large"
                    component="a"
                    href={appUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ bgcolor: 'white', color: 'primary.main', fontWeight: 600 }}
                  >
                    Open App Free
                  </Button>
                  <Button
                    variant="outlined"
                    size="large"
                    component={Link}
                    href="/demo-class"
                    sx={{ borderColor: 'white', color: 'white' }}
                  >
                    Book Free Demo
                  </Button>
                </Box>
              </Grid>
              <Grid item xs={12} md={5}>
                <Card sx={{ bgcolor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
                  <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                    <Typography variant="h6" gutterBottom sx={{ color: 'white', fontWeight: 600 }}>
                      App Highlights
                    </Typography>
                    {[
                      { label: 'Price', value: 'Completely Free' },
                      { label: 'Colleges Covered', value: '5000+' },
                      { label: 'Active Students', value: '5000+' },
                      { label: 'Platform', value: 'Web PWA (Any Device)' },
                      { label: 'Offline Support', value: 'Yes' },
                    ].map((detail, idx) => (
                      <Box
                        key={idx}
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          py: 1,
                          borderBottom: '1px solid rgba(255,255,255,0.2)',
                        }}
                      >
                        <Typography variant="body2" sx={{ opacity: 0.8 }}>
                          {detail.label}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {detail.value}
                        </Typography>
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* Free Tools Section */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="lg">
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ mb: 2, fontWeight: 700 }}
            >
              Free NATA Preparation Tools
            </Typography>
            <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 6 }}>
              Three powerful tools built specifically for NATA aspirants - all completely free
            </Typography>

            <Grid container spacing={4}>
              {freeTools.map((tool, index) => (
                <Grid item xs={12} md={4} key={index}>
                  <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <CardContent sx={{ p: { xs: 3, md: 4 }, flexGrow: 1 }}>
                      <Chip
                        label="Free"
                        size="small"
                        sx={{
                          bgcolor: 'success.light',
                          color: 'success.dark',
                          fontWeight: 600,
                          mb: 2,
                        }}
                      />
                      <Typography
                        variant="h5"
                        gutterBottom
                        sx={{ fontWeight: 600, color: 'primary.main' }}
                      >
                        {tool.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        {tool.desc}
                      </Typography>
                      <Button
                        variant="outlined"
                        component="a"
                        href={tool.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ mt: 'auto' }}
                      >
                        Use Free
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Why Neram App is Best Section */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ mb: 2, fontWeight: 700 }}
            >
              Why Neram App is the Best for NATA Preparation
            </Typography>
            <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 6 }}>
              Purpose-built for NATA aspirants by experienced coaches
            </Typography>

            <Grid container spacing={4}>
              {appFeatures.map((feature, index) => (
                <Grid item xs={12} sm={6} md={4} key={index}>
                  <Card sx={{ height: '100%', textAlign: 'center', p: 3 }}>
                    <Box
                      sx={{
                        width: 56,
                        height: 56,
                        borderRadius: 2,
                        bgcolor: 'primary.main',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mx: 'auto',
                        mb: 2,
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                        {feature.icon}
                      </Typography>
                    </Box>
                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                      {feature.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {feature.desc}
                    </Typography>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* How It Works Section */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="lg">
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ mb: 2, fontWeight: 700 }}
            >
              How to Use the Neram NATA App
            </Typography>
            <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 6 }}>
              Get started in under a minute - no download required
            </Typography>

            <Grid container spacing={4}>
              {howItWorks.map((item, index) => (
                <Grid item xs={12} sm={6} md={3} key={index}>
                  <Card sx={{ height: '100%', textAlign: 'center', p: 3, position: 'relative' }}>
                    <Typography
                      variant="h3"
                      sx={{
                        fontWeight: 800,
                        color: 'primary.light',
                        opacity: 0.2,
                        fontSize: '3rem',
                        mb: 1,
                      }}
                    >
                      {item.step}
                    </Typography>
                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                      {item.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.desc}
                    </Typography>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Comparison Table Section */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
          <Container maxWidth="lg">
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ mb: 2, fontWeight: 700 }}
            >
              Neram App vs Other NATA Preparation Options
            </Typography>
            <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 6 }}>
              See how the Neram NATA App compares to generic apps and YouTube
            </Typography>

            <Card sx={{ overflow: 'auto' }}>
              <Box sx={{ minWidth: 500 }}>
                {/* Table Header */}
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr 1fr',
                    bgcolor: 'primary.main',
                    color: 'white',
                    p: 2,
                    gap: 1,
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Feature
                  </Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, textAlign: 'center' }}>
                    Neram App
                  </Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, textAlign: 'center' }}>
                    Generic Apps
                  </Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, textAlign: 'center' }}>
                    YouTube
                  </Typography>
                </Box>

                {/* Table Rows */}
                {comparisonFeatures.map((row, index) => (
                  <Box
                    key={index}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 1fr',
                      p: 2,
                      gap: 1,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      bgcolor: index % 2 === 0 ? 'background.default' : 'white',
                    }}
                  >
                    <Typography variant="body2">{row.feature}</Typography>
                    <Typography variant="body2" sx={{ textAlign: 'center', color: row.neram ? 'success.main' : 'error.main', fontWeight: 600 }}>
                      {row.neram ? 'Yes' : 'No'}
                    </Typography>
                    <Typography variant="body2" sx={{ textAlign: 'center', color: row.generic ? 'success.main' : 'error.main', fontWeight: 600 }}>
                      {row.generic ? 'Yes' : 'No'}
                    </Typography>
                    <Typography variant="body2" sx={{ textAlign: 'center', color: row.youtube ? 'success.main' : 'error.main', fontWeight: 600 }}>
                      {row.youtube ? 'Yes' : 'No'}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Card>
          </Container>
        </Box>

        {/* FAQ Section */}
        <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
          <Container maxWidth="md">
            <Typography
              variant="h2"
              component="h2"
              align="center"
              gutterBottom
              sx={{ mb: 2, fontWeight: 700 }}
            >
              Frequently Asked Questions
            </Typography>
            <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 6 }}>
              Common questions about the Neram NATA Preparation App
            </Typography>

            {faqs.map((faq, index) => (
              <Accordion
                key={index}
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
                  <Typography sx={{ fontWeight: 600 }}>{faq.question}</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ bgcolor: 'white' }}>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
                    {faq.answer}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Container>
        </Box>

        {/* CTA Section */}
        <Box
          sx={{
            py: { xs: 6, md: 10 },
            background: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 100%)',
            color: 'white',
            textAlign: 'center',
          }}
        >
          <Container maxWidth="md">
            <Typography
              variant="h3"
              component="h2"
              gutterBottom
              sx={{ fontWeight: 700, fontSize: { xs: '1.75rem', md: '2.5rem' } }}
            >
              Start Your NATA Preparation Today
            </Typography>
            <Typography variant="h6" sx={{ mb: 4, opacity: 0.9, fontSize: { xs: '1rem', md: '1.25rem' } }}>
              Open the Neram NATA App and use free tools to plan your architecture career.
              No signup needed. No downloads. Just open and start.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                size="large"
                component="a"
                href={appUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ bgcolor: 'white', color: 'primary.main', fontWeight: 600 }}
              >
                Open App Free
              </Button>
              <Button
                variant="outlined"
                size="large"
                component={Link}
                href="/coaching/nata-coaching"
                sx={{ borderColor: 'white', color: 'white' }}
              >
                Explore NATA Coaching
              </Button>
            </Box>
          </Container>
        </Box>
      </Box>
    </>
  );
}
