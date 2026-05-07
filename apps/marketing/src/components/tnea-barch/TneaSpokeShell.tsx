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
import CounsellingCallbackDrawer from './CounsellingCallbackDrawer';

const baseUrl = 'https://neramclasses.com';
const HUB_PATH = '/counseling/tnea-barch';

export interface TneaSpokeShellProps {
  locale: string;
  spokeSlug: string;
  topicTitle: string;
  topicSubtitle: string;
  spokeChip?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  related?: Array<{ label: string; href: string }>;
  aintraSuggestions?: string[];
  prefillCallbackNotes?: string;
  children: React.ReactNode;
}

const DEFAULT_SUGGESTIONS = [
  'Eligibility for TNEA B.Arch?',
  'When does registration close?',
  'How many counselling rounds?',
  'TFC near me?',
];

export default function TneaSpokeShell({
  locale,
  spokeSlug,
  topicTitle,
  topicSubtitle,
  spokeChip,
  jsonLd,
  related = [],
  aintraSuggestions = DEFAULT_SUGGESTIONS,
  prefillCallbackNotes,
  children,
}: TneaSpokeShellProps) {
  const localePrefix = locale === 'en' ? '' : `/${locale}`;
  const hubUrl = `${baseUrl}${localePrefix}${HUB_PATH}`;
  const spokeUrl = `${baseUrl}${localePrefix}${HUB_PATH}/${spokeSlug}`;

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: locale === 'en' ? baseUrl : `${baseUrl}/${locale}` },
    { name: 'Counseling', url: `${baseUrl}${localePrefix}/counseling` },
    { name: 'TNEA B.Arch 2026', url: hubUrl },
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
          <Link href={`${localePrefix}${HUB_PATH}`} style={{ textDecoration: 'none' }}>
            <Typography variant="body2" color="text.secondary">
              TNEA B.Arch 2026
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
              Related TNEA B.Arch pages
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap>
              {related.map((r) => (
                <Paper
                  key={r.href}
                  component={Link}
                  href={`${localePrefix}${HUB_PATH}/${r.href}`}
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
            href={`${localePrefix}${HUB_PATH}`}
            variant="outlined"
            startIcon={<ArrowBackIcon />}
          >
            Back to TNEA B.Arch hub
          </Button>
          <Button
            component={Link}
            href={`${localePrefix}${HUB_PATH}/tfc-list`}
            variant="text"
            endIcon={<ArrowForwardIcon />}
          >
            Find your nearest TFC
          </Button>
        </Box>
      </Container>

      <CounsellingCallbackDrawer variant="sticky" prefillNotes={prefillCallbackNotes} />

      <AintraTopicChat
        topic="tnea_barch_2026"
        endpoint="/api/aintra/tnea-barch"
        title="TNEA B.Arch 2026"
        subtitle="Your TNEA B.Arch counselling guide"
        greeting={`Hi! I'm Aintra. Ask me about ${topicTitle.toLowerCase()}, or anything else about TNEA B.Arch 2026.`}
        suggestions={aintraSuggestions}
        primaryColor="#1d4ed8"
        primaryColorDark="#1e3a8a"
      />
    </>
  );
}
