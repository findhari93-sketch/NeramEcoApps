import Link from 'next/link';
import { Box, Container, Typography, Stack, Paper, Chip, Divider, Button } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateBreadcrumbSchema,
  generateFAQSchema,
  generateArticleSchema,
} from '@/lib/seo/schemas';

const baseUrl = 'https://neramclasses.com';

export interface ConceptArticleProps {
  slug: string;
  title: string;
  subtitle: string;
  publishedAt: string;
  modifiedAt?: string;
  readingMinutes?: number;
  tags?: string[];
  faqs: Array<{ question: string; answer: string }>;
  locale: string;
  children: React.ReactNode;
}

export default function ConceptArticleLayout({
  slug,
  title,
  subtitle,
  publishedAt,
  modifiedAt,
  readingMinutes = 5,
  tags = [],
  faqs,
  locale,
  children,
}: ConceptArticleProps) {
  const localePrefix = locale === 'en' ? '' : `/${locale}`;
  const url = `${baseUrl}${localePrefix}/counseling/concepts/${slug}`;

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: locale === 'en' ? baseUrl : `${baseUrl}/${locale}` },
    { name: 'Counselling', url: `${baseUrl}${localePrefix}/counseling` },
    { name: title, url },
  ]);

  const articleSchema = generateArticleSchema({
    title,
    description: subtitle,
    url,
    publishedAt,
    modifiedAt: modifiedAt ?? publishedAt,
    author: 'Neram Classes',
    category: 'B.Arch Counselling Concepts',
  });

  const faqSchema = faqs.length > 0 ? generateFAQSchema(faqs) : null;

  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={articleSchema} />
      {faqSchema && <JsonLd data={faqSchema} />}

      <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 }, pb: { xs: 8, md: 6 } }}>
        {/* Breadcrumb */}
        <Stack direction="row" gap={0.75} sx={{ mb: 2 }} flexWrap="wrap">
          <Link href={`/${locale === 'en' ? '' : locale}`} style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
            <HomeIcon sx={{ fontSize: 14, mr: 0.5, color: 'text.secondary' }} />
            <Typography variant="body2" color="text.secondary">Home</Typography>
          </Link>
          <Typography variant="body2" color="text.secondary">/</Typography>
          <Link href={`${localePrefix}/counseling`} style={{ textDecoration: 'none' }}>
            <Typography variant="body2" color="text.secondary">Counselling</Typography>
          </Link>
          <Typography variant="body2" color="text.secondary">/</Typography>
          <Typography variant="body2" color="primary" fontWeight={600}>Concept</Typography>
        </Stack>

        {/* Hero */}
        <Box sx={{ mb: 3 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
            <Chip label="Counselling concept" size="small" color="primary" variant="outlined" />
            <Chip label={`${readingMinutes} min read`} size="small" variant="outlined" />
            {tags.map((t) => (
              <Chip key={t} label={t} size="small" variant="outlined" />
            ))}
          </Stack>
          <Typography
            variant="h1"
            sx={{ fontWeight: 800, fontSize: { xs: '1.625rem', md: '2.125rem' }, lineHeight: 1.2, mb: 1.25 }}
          >
            {title}
          </Typography>
          <Typography variant="h2" sx={{ fontSize: { xs: '1rem', md: '1.125rem' }, fontWeight: 500, color: 'text.secondary', mb: 1 }}>
            {subtitle}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Published {new Date(publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            {modifiedAt && modifiedAt !== publishedAt && (
              <> · Updated {new Date(modifiedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</>
            )}
          </Typography>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* Article body */}
        <Box
          component="article"
          sx={{
            '& h2': { fontSize: { xs: '1.25rem', md: '1.5rem' }, fontWeight: 700, mt: 4, mb: 1.5 },
            '& h3': { fontSize: { xs: '1.05rem', md: '1.15rem' }, fontWeight: 700, mt: 3, mb: 1 },
            '& p': { mb: 1.5, lineHeight: 1.7, color: 'text.primary' },
            '& ul, & ol': { mb: 1.5, pl: 3 },
            '& li': { mb: 0.5, lineHeight: 1.7 },
            '& strong': { fontWeight: 700 },
            '& code': {
              fontFamily: 'monospace',
              fontSize: '0.9em',
              bgcolor: 'grey.100',
              px: 0.5,
              borderRadius: 0.5,
            },
            '& blockquote': {
              borderLeft: '4px solid',
              borderColor: 'primary.main',
              pl: 2,
              py: 1,
              my: 2,
              bgcolor: 'grey.50',
              fontStyle: 'italic',
            },
          }}
        >
          {children}
        </Box>

        {/* FAQs */}
        {faqs.length > 0 && (
          <Box component="section" sx={{ mt: 5 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
              <HelpOutlineIcon sx={{ color: 'text.secondary' }} />
              <Typography variant="h2" sx={{ fontSize: { xs: '1.25rem', md: '1.5rem' }, fontWeight: 700 }}>
                Quick FAQs
              </Typography>
            </Stack>
            <Stack spacing={1}>
              {faqs.map((f, idx) => (
                <Paper
                  key={`${f.question}-${idx}`}
                  elevation={0}
                  component="details"
                  sx={{
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'grey.200',
                    '& summary': {
                      listStyle: 'none',
                      cursor: 'pointer',
                      p: 1.75,
                      fontWeight: 600,
                      fontSize: '0.95rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 1,
                    },
                    '& summary::-webkit-details-marker': { display: 'none' },
                    '& summary::after': { content: '"+"', fontSize: '1.25rem', color: 'primary.main', flexShrink: 0 },
                    '&[open] summary::after': { content: '"−"' },
                  }}
                >
                  <Box component="summary">{f.question}</Box>
                  <Box sx={{ p: 1.75, pt: 0, color: 'text.secondary', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    {f.answer}
                  </Box>
                </Paper>
              ))}
            </Stack>
          </Box>
        )}

        <Divider sx={{ my: 4 }} />

        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 2,
            bgcolor: '#E3F2FD',
            border: '1px solid #1565C0',
            textAlign: 'center',
          }}
        >
          <Typography variant="h3" sx={{ fontSize: '1.125rem', fontWeight: 700, mb: 1 }}>
            Need help with your B.Arch counselling decision?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Talk to a Neram counsellor about your specific situation. Free, no obligation.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center">
            <Button component={Link} href={`${localePrefix}/counseling`} variant="contained" endIcon={<ArrowForwardIcon />} sx={{ bgcolor: '#1565C0', '&:hover': { bgcolor: '#0D47A1' } }}>
              Browse all 28 counsellings
            </Button>
            <Button component={Link} href={`${localePrefix}/apply`} variant="outlined">
              Get a free counselling call
            </Button>
          </Stack>
        </Paper>
      </Container>
    </>
  );
}
