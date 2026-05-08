import Link from 'next/link';
import {
  Box,
  Container,
  Typography,
  Stack,
  Chip,
  Paper,
  Button,
} from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import AintraTopicChat from '@/components/aintra/AintraTopicChat';
import CallbackDrawer, { type CallbackDrawerProps } from './CallbackDrawer';

const baseUrl = 'https://neramclasses.com';

export interface CounsellingSpokeShellProps {
  locale: string;
  hubPath: string;
  hubLabel: string;
  spokeSlug: string;
  topicTitle: string;
  topicSubtitle: string;
  spokeChip?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  related?: Array<{ label: string; href: string }>;
  ctaSecondary?: { label: string; href: string };
  callback: Pick<
    CallbackDrawerProps,
    | 'ctaLabel'
    | 'drawerTitle'
    | 'drawerIntro'
    | 'successHeading'
    | 'successMessage'
    | 'context'
    | 'queryType'
    | 'courseInterest'
    | 'cutoffCalculatorUrl'
    | 'collegePredictorUrl'
    | 'prefillNotes'
  >;
  aintra: {
    topic: string;
    endpoint: string;
    title: string;
    subtitle: string;
    greeting: string;
    suggestions: string[];
    primaryColor: string;
    primaryColorDark: string;
    disclaimerSource?: string;
  };
  children: React.ReactNode;
}

export default function CounsellingSpokeShell({
  locale,
  hubPath,
  hubLabel,
  spokeSlug,
  topicTitle,
  topicSubtitle,
  spokeChip,
  jsonLd,
  related = [],
  ctaSecondary,
  callback,
  aintra,
  children,
}: CounsellingSpokeShellProps) {
  const localePrefix = locale === 'en' ? '' : `/${locale}`;
  const hubUrl = `${baseUrl}${localePrefix}${hubPath}`;
  const spokeUrl = `${baseUrl}${localePrefix}${hubPath}/${spokeSlug}`;

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: locale === 'en' ? baseUrl : `${baseUrl}/${locale}` },
    { name: 'Counseling', url: `${baseUrl}${localePrefix}/counseling` },
    { name: hubLabel, url: hubUrl },
    { name: topicTitle, url: spokeUrl },
  ]);

  const jsonLdArray = jsonLd
    ? Array.isArray(jsonLd)
      ? [breadcrumbSchema, ...jsonLd]
      : [breadcrumbSchema, jsonLd]
    : [breadcrumbSchema];

  return (
    <>
      {jsonLdArray.map((data, idx) => (
        <JsonLd key={idx} data={data} />
      ))}

      <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 }, pb: { xs: 12, md: 5 } }}>
        {/* Breadcrumb */}
        <Stack direction="row" gap={0.75} sx={{ mb: 2 }} flexWrap="wrap">
          <Link
            href={`/${locale}`}
            style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
          >
            <HomeIcon sx={{ fontSize: 14, mr: 0.5, color: 'text.secondary' }} />
            <Typography variant="body2" color="text.secondary">
              Home
            </Typography>
          </Link>
          <Typography variant="body2" color="text.secondary">
            /
          </Typography>
          <Link href={`${localePrefix}${hubPath}`} style={{ textDecoration: 'none' }}>
            <Typography variant="body2" color="text.secondary">
              {hubLabel}
            </Typography>
          </Link>
          <Typography variant="body2" color="text.secondary">
            /
          </Typography>
          <Typography variant="body2" color="primary" fontWeight={600}>
            {spokeChip || topicTitle}
          </Typography>
        </Stack>

        {/* Hero */}
        <Box sx={{ mb: 4 }}>
          {spokeChip && <Chip label={spokeChip} size="small" color="primary" sx={{ mb: 1.5 }} />}
          <Typography
            variant="h1"
            sx={{
              fontWeight: 800,
              fontSize: { xs: '1.625rem', md: '2.125rem' },
              lineHeight: 1.2,
              mb: 1.25,
            }}
          >
            {topicTitle}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 720 }}>
            {topicSubtitle}
          </Typography>
        </Box>

        {/* Body */}
        <Box component="article">{children}</Box>

        {/* Related */}
        {related.length > 0 && (
          <Box sx={{ mt: 5 }}>
            <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>
              Related {hubLabel} pages
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap>
              {related.map((r) => (
                <Paper
                  key={r.href}
                  component={Link}
                  href={`${localePrefix}${hubPath}/${r.href}`}
                  elevation={0}
                  sx={{
                    p: 1.5,
                    px: 2,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    textDecoration: 'none',
                    color: 'text.primary',
                    fontWeight: 600,
                    transition: 'all 0.2s ease',
                    '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
                  }}
                >
                  {r.label} →
                </Paper>
              ))}
            </Stack>
          </Box>
        )}

        <Box sx={{ mt: 4, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Button
            component={Link}
            href={`${localePrefix}${hubPath}`}
            variant="outlined"
            startIcon={<ArrowBackIcon />}
          >
            Back to {hubLabel} hub
          </Button>
          {ctaSecondary && (
            <Button
              component={Link}
              href={`${localePrefix}${hubPath}/${ctaSecondary.href}`}
              variant="text"
              endIcon={<ArrowForwardIcon />}
            >
              {ctaSecondary.label}
            </Button>
          )}
        </Box>
      </Container>

      <CallbackDrawer variant="sticky" {...callback} />

      <AintraTopicChat
        topic={aintra.topic}
        endpoint={aintra.endpoint}
        title={aintra.title}
        subtitle={aintra.subtitle}
        greeting={aintra.greeting}
        suggestions={aintra.suggestions}
        primaryColor={aintra.primaryColor}
        primaryColorDark={aintra.primaryColorDark}
        disclaimerSource={aintra.disclaimerSource}
      />
    </>
  );
}
