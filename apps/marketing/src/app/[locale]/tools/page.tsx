import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { ALL_TOOLS } from '@/lib/tools/configs';
import type { ToolConfig } from '@/lib/tools/types';
import {
  Box,
  Container,
  Typography,
  Button,
  Grid,
  Paper,
} from '@neram/ui';

const baseUrl = 'https://neramclasses.com';

const HUB_FAQS = [
  {
    question: 'Are all these tools free?',
    answer:
      'Yes, completely free. Every tool on this page is available at no cost. No hidden charges, no subscription, no credit card required. The quick check on each page works instantly without any payment.',
  },
  {
    question: 'Do I need to create an account?',
    answer:
      'No, the quick check on each page works without login. For the full tool with detailed results, saving your data, and accessing your history, you can sign in to the Neram Classes app with your Google account.',
  },
  {
    question: 'Which tool should I use first?',
    answer:
      'Start with the Eligibility Checker to confirm you qualify for NATA 2026. Then use the Cutoff Calculator to estimate your score. Once you have a target score, use the College Predictor to find colleges that match your profile.',
  },
  {
    question: 'How accurate is the data?',
    answer:
      'Based on historical data from 500+ colleges across India, updated after every counselling round and exam cycle. Predictions are strong reference points built on actual admission records from 2020 to 2025. Actual cutoffs vary each year based on difficulty and seat availability.',
  },
  {
    question: 'Do these tools work for JEE Paper 2 B.Arch?',
    answer:
      'Yes, the cutoff and college data covers both NATA and JEE Paper 2 B.Arch aspirants. Most colleges accept both exam scores, and our tools reflect that. Where NATA-specific logic applies (like the score formula), it is clearly indicated.',
  },
  {
    question: 'Can I use these tools on my phone?',
    answer:
      'Yes, all tools are mobile-friendly and designed to work on any device. The interface adapts to your screen size, so you get the same experience whether you are on a phone, tablet, or desktop.',
  },
];

const TRUST_POINTS = [
  {
    label: '100% Free',
    desc: 'No hidden charges, no credit card, no sign-up required',
  },
  {
    label: 'Real Data',
    desc: 'Built on actual cutoff data from 500+ colleges across India',
  },
  {
    label: 'Updated Regularly',
    desc: 'Refreshed after every counselling round and exam cycle',
  },
  {
    label: '10,000+ Students',
    desc: 'Trusted by architecture aspirants across 28 states',
  },
];

const CATEGORIES: { label: string; key: ToolConfig['category'] }[] = [
  { label: 'NATA Preparation', key: 'nata' },
  { label: 'Counseling and Admission', key: 'counseling' },
  { label: 'Analysis and Insights', key: 'insights' },
];

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Free NATA and B.Arch Admission Tools 2026 | Neram Classes',
    description:
      '10+ free tools for NATA and JEE Paper 2 B.Arch aspirants. Calculate cutoffs, predict colleges, estimate rank, find exam centers, and plan your architecture career.',
    keywords:
      'NATA tools, NATA preparation tools, B.Arch admission tools, NATA calculator, architecture entrance tools, free NATA tools 2026',
    alternates: buildAlternates(locale, '/tools'),
    openGraph: {
      title: 'Free NATA and B.Arch Admission Tools 2026',
      description: '10+ free tools for architecture entrance aspirants.',
      url: locale === 'en' ? `${baseUrl}/tools` : `${baseUrl}/${locale}/tools`,
      type: 'website',
    },
  };
}

export default function ToolsHubPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: baseUrl },
    { name: 'Free Tools', url: `${baseUrl}/tools` },
  ]);

  const faqSchema = generateFAQSchema(HUB_FAQS);

  return (
    <>
      <JsonLd data={[breadcrumbSchema, faqSchema]} />

      {/* Hero */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #1565C0 0%, #0D47A1 100%)',
          color: 'white',
          py: { xs: 6, md: 10 },
        }}
      >
        <Container maxWidth="md">
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: '1.75rem', sm: '2.25rem', md: '3rem' },
              fontWeight: 800,
              lineHeight: 1.2,
              mb: 2,
            }}
          >
            Free NATA and B.Arch Admission Tools 2026
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: '1rem', md: '1.2rem' },
              opacity: 0.9,
              lineHeight: 1.7,
              maxWidth: 680,
            }}
          >
            Everything you need for your architecture entrance journey, from score calculation to
            college selection. Used by 10,000+ students across India.
          </Typography>
        </Container>
      </Box>

      {/* Tool Categories */}
      <Box sx={{ py: { xs: 5, md: 8 } }}>
        <Container maxWidth="lg">
          {CATEGORIES.map(({ label, key }) => {
            const tools = ALL_TOOLS.filter((t) => t.category === key);
            if (tools.length === 0) return null;
            return (
              <Box key={key} sx={{ mb: { xs: 5, md: 7 } }}>
                <Typography
                  component="h2"
                  sx={{
                    fontSize: { xs: '1.25rem', md: '1.6rem' },
                    fontWeight: 700,
                    mb: 3,
                    pb: 1.5,
                    borderBottom: '2px solid #1565C0',
                    display: 'inline-block',
                  }}
                >
                  {label}
                </Typography>
                <Grid container spacing={3}>
                  {tools.map((tool) => (
                    <Grid item xs={12} sm={6} md={4} key={tool.slug}>
                      <Paper
                        elevation={0}
                        sx={{
                          border: '1px solid #E0E0E0',
                          p: 3,
                          borderRadius: 2,
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 1.5,
                          transition: 'border-color 0.2s, box-shadow 0.2s',
                          '&:hover': {
                            borderColor: '#1565C0',
                            boxShadow: '0 2px 12px rgba(21,101,192,0.10)',
                          },
                        }}
                      >
                        <Typography
                          component="h3"
                          sx={{
                            fontWeight: 700,
                            fontSize: '1rem',
                            lineHeight: 1.4,
                          }}
                        >
                          {tool.title}
                        </Typography>
                        <Typography
                          sx={{
                            color: 'text.secondary',
                            fontSize: '0.95rem',
                            lineHeight: 1.5,
                            flexGrow: 1,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {tool.metaDescription}
                        </Typography>
                        <Box>
                          <Link
                            href={`/tools/${tool.slug}`}
                            style={{ textDecoration: 'none' }}
                          >
                            <Typography
                              component="span"
                              sx={{
                                color: 'primary.main',
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                cursor: 'pointer',
                                '&:hover': { textDecoration: 'underline' },
                              }}
                            >
                              Try Now
                            </Typography>
                          </Link>
                        </Box>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            );
          })}
        </Container>
      </Box>

      {/* Why Use Our Tools */}
      <Box sx={{ py: { xs: 5, md: 8 }, bgcolor: '#FAFAFA' }}>
        <Container maxWidth="lg">
          <Typography
            component="h2"
            sx={{
              fontSize: { xs: '1.4rem', md: '1.8rem' },
              fontWeight: 700,
              textAlign: 'center',
              mb: 4,
            }}
          >
            Why Use Our Tools
          </Typography>
          <Grid container spacing={3}>
            {TRUST_POINTS.map(({ label, desc }) => (
              <Grid item xs={6} sm={3} key={label}>
                <Paper
                  elevation={0}
                  sx={{
                    border: '1px solid #E0E0E0',
                    p: { xs: 2, md: 3 },
                    borderRadius: 2,
                    textAlign: 'center',
                    height: '100%',
                  }}
                >
                  <Typography
                    sx={{
                      fontWeight: 700,
                      fontSize: { xs: '1rem', md: '1.1rem' },
                      color: 'primary.main',
                      mb: 1,
                    }}
                  >
                    {label}
                  </Typography>
                  <Typography
                    sx={{
                      color: 'text.secondary',
                      fontSize: { xs: '0.82rem', md: '0.9rem' },
                      lineHeight: 1.5,
                    }}
                  >
                    {desc}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* FAQ */}
      <Box sx={{ py: { xs: 5, md: 8 } }}>
        <Container maxWidth="md">
          <Typography
            component="h2"
            sx={{
              fontSize: { xs: '1.4rem', md: '1.8rem' },
              fontWeight: 700,
              textAlign: 'center',
              mb: 4,
            }}
          >
            Frequently Asked Questions
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {HUB_FAQS.map((faq, index) => (
              <Paper
                key={index}
                elevation={0}
                sx={{
                  border: '1px solid #E0E0E0',
                  borderRadius: 2,
                  p: { xs: 2.5, md: 3 },
                }}
              >
                <Typography
                  component="h3"
                  sx={{
                    fontWeight: 700,
                    fontSize: '1rem',
                    mb: 1,
                    lineHeight: 1.4,
                  }}
                >
                  {faq.question}
                </Typography>
                <Typography
                  sx={{
                    color: 'text.secondary',
                    lineHeight: 1.7,
                    fontSize: '0.95rem',
                  }}
                >
                  {faq.answer}
                </Typography>
              </Paper>
            ))}
          </Box>
        </Container>
      </Box>

      {/* CTA */}
      <Box
        sx={{
          bgcolor: 'primary.main',
          py: { xs: 6, md: 8 },
          textAlign: 'center',
        }}
      >
        <Container maxWidth="sm">
          <Typography
            component="h2"
            sx={{
              fontSize: { xs: '1.5rem', md: '2rem' },
              fontWeight: 700,
              color: 'white',
              mb: 2,
            }}
          >
            Start Your Architecture Journey
          </Typography>
          <Typography
            sx={{
              color: 'rgba(255,255,255,0.85)',
              mb: 4,
              fontSize: '1.05rem',
              lineHeight: 1.6,
            }}
          >
            Use our tools to plan your path and join thousands of students who
            qualified their dream architecture college.
          </Typography>
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Button
              component={Link}
              href="/apply"
              variant="contained"
              size="large"
              sx={{
                bgcolor: 'white',
                color: 'primary.main',
                fontWeight: 700,
                px: 4,
                '&:hover': { bgcolor: '#F5F5F5' },
              }}
            >
              Apply for Coaching
            </Button>
            <Button
              component={Link}
              href="/courses"
              variant="outlined"
              size="large"
              sx={{
                borderColor: 'white',
                color: 'white',
                fontWeight: 700,
                px: 4,
                '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' },
              }}
            >
              Explore Courses
            </Button>
          </Box>
        </Container>
      </Box>
    </>
  );
}
