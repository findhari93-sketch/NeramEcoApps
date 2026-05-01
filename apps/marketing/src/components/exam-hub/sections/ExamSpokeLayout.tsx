import {
  Box,
  Container,
  Typography,
  Stack,
  Chip,
  Button,
  Paper,
  Breadcrumbs,
} from '@mui/material';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';

export interface SpokeRelated {
  label: string;
  href: string;
}

interface ExamSpokeLayoutProps {
  examName: string;
  examShortName: string;
  examHubHref: string;
  examColor?: 'primary' | 'secondary';
  topicTitle: string;
  topicSubtitle: string;
  baseUrl?: string;
  related?: SpokeRelated[];
  children: React.ReactNode;
}

export default function ExamSpokeLayout({
  examName,
  examShortName,
  examHubHref,
  examColor = 'primary',
  topicTitle,
  topicSubtitle,
  baseUrl = 'https://neramclasses.com',
  related = [],
  children,
}: ExamSpokeLayoutProps) {
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: baseUrl },
    { name: 'Exam Hub', url: `${baseUrl}${examHubHref}` },
    { name: examShortName, url: `${baseUrl}${examHubHref}` },
    { name: topicTitle },
  ]);

  return (
    <>
      <JsonLd data={breadcrumbSchema} />

      {/* Hero with breadcrumb */}
      <Box
        component="section"
        sx={{
          bgcolor: examColor === 'secondary' ? 'secondary.main' : 'primary.main',
          color:
            examColor === 'secondary'
              ? 'secondary.contrastText'
              : 'primary.contrastText',
          py: { xs: 5, md: 7 },
        }}
      >
        <Container maxWidth="lg">
          <Breadcrumbs
            aria-label="breadcrumb"
            separator="/"
            sx={{
              mb: 2,
              color: 'rgba(255,255,255,0.85)',
              '& a': { color: '#fff', textDecoration: 'underline' },
            }}
          >
            <Link href="/" style={{ color: '#fff' }}>
              Home
            </Link>
            <Link href={examHubHref as any} style={{ color: '#fff' }}>
              {examShortName}
            </Link>
            <Typography sx={{ color: 'rgba(255,255,255,0.85)' }}>
              {topicTitle}
            </Typography>
          </Breadcrumbs>
          <Chip
            label={examName}
            size="small"
            sx={{
              bgcolor: 'rgba(255,255,255,0.18)',
              color: '#fff',
              fontWeight: 600,
              mb: 1.5,
            }}
          />
          <Typography
            variant="h2"
            component="h1"
            sx={{
              fontWeight: 800,
              lineHeight: 1.2,
              fontSize: { xs: '1.75rem', sm: '2.25rem', md: '2.75rem' },
              maxWidth: 880,
              mb: 1.25,
            }}
          >
            {topicTitle}
          </Typography>
          <Typography
            sx={{
              opacity: 0.95,
              maxWidth: 760,
              fontSize: { xs: '1rem', md: '1.1rem' },
            }}
          >
            {topicSubtitle}
          </Typography>
        </Container>
      </Box>

      {/* Body */}
      <Box component="article" sx={{ bgcolor: 'background.paper', py: { xs: 5, md: 7 } }}>
        <Container maxWidth="md">{children}</Container>
      </Box>

      {/* Related links + back to hub */}
      <Box component="section" sx={{ bgcolor: 'grey.50', py: { xs: 4, md: 6 } }}>
        <Container maxWidth="md">
          {related.length > 0 ? (
            <>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                Related {examShortName} pages
              </Typography>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                useFlexGap
                flexWrap="wrap"
                sx={{ mb: 3 }}
              >
                {related.map((r) => (
                  <Paper
                    key={r.href}
                    elevation={0}
                    component={Link}
                    href={r.href as any}
                    sx={{
                      p: 1.5,
                      px: 2,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'background.paper',
                      textDecoration: 'none',
                      color: 'text.primary',
                      fontWeight: 600,
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        borderColor:
                          examColor === 'secondary' ? 'secondary.main' : 'primary.main',
                        color: examColor === 'secondary' ? 'secondary.main' : 'primary.main',
                      },
                    }}
                  >
                    {r.label} →
                  </Paper>
                ))}
              </Stack>
            </>
          ) : null}
          <Button
            component={Link}
            href={examHubHref as any}
            variant="outlined"
            color={examColor}
            sx={{ fontWeight: 600 }}
          >
            ← Back to {examShortName} hub
          </Button>
        </Container>
      </Box>
    </>
  );
}
