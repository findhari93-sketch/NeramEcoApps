'use client';

import {
  Box,
  Container,
  Typography,
  Grid,
  Button,
  Chip,
} from '@neram/ui';
import { DownloadIcon, m3Primary, m3Tertiary, m3Neutral } from '@neram/ui';
import DescriptionIcon from '@mui/icons-material/Description';
import ScrollReveal from '@/components/nata/sections/ScrollReveal';

interface Brochure {
  id: string;
  year: number;
  version: string;
  release_date: string;
  file_size_bytes: number | null;
  changelog: string | null;
  file_url: string;
  is_current: boolean;
}

interface BrochureSectionProps {
  brochures: Brochure[];
}

/** Format bytes to human-readable string */
function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** Format date string to readable format */
function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/** Single brochure card */
function BrochureCard({ brochure }: { brochure: Brochure }) {
  const isCurrent = brochure.is_current;

  return (
    <Box
      sx={{
        bgcolor: '#fff',
        border: isCurrent
          ? `2px solid ${m3Tertiary[40]}`
          : '1px solid',
        borderColor: isCurrent ? m3Tertiary[40] : 'divider',
        borderRadius: 2,
        p: { xs: 2.5, md: 3 },
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: 2.5,
        alignItems: { xs: 'flex-start', sm: 'center' },
        transition: 'box-shadow 0.3s ease',
        '&:hover': {
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        },
      }}
    >
      {/* Document icon area */}
      <Box
        sx={{
          width: { xs: 48, sm: 64 },
          height: { xs: 60, sm: 80 },
          borderRadius: 2,
          bgcolor: m3Primary[95],
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <DescriptionIcon
          sx={{ fontSize: { xs: 28, sm: 36 }, color: m3Primary[40] }}
        />
      </Box>

      {/* Info area */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
            mb: 0.5,
          }}
        >
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 600, lineHeight: 1.3 }}
          >
            NATA {brochure.year} — v{brochure.version}
          </Typography>
          {isCurrent && (
            <Chip
              label="Current Version"
              size="small"
              sx={{
                bgcolor: m3Tertiary[90],
                color: m3Tertiary[30],
                fontWeight: 600,
                fontSize: '0.7rem',
                height: 24,
              }}
            />
          )}
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          Released: {formatDate(brochure.release_date)}
          {brochure.file_size_bytes
            ? ` · ${formatFileSize(brochure.file_size_bytes)}`
            : ''}
        </Typography>

        {brochure.changelog && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 1.5, fontSize: '0.8rem' }}
          >
            {brochure.changelog}
          </Typography>
        )}

        {/* Download button */}
        <Button
          variant={isCurrent ? 'contained' : 'outlined'}
          size="small"
          startIcon={<DownloadIcon />}
          href={brochure.file_url}
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
            ...(isCurrent
              ? {
                  background: 'linear-gradient(135deg, #F9A825, #F57F17)',
                  color: '#fff',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #F57F17, #EF6C00)',
                  },
                }
              : {}),
          }}
        >
          Download PDF
        </Button>
      </Box>
    </Box>
  );
}

/** Fallback card shown when no brochures are available */
function ComingSoonCard() {
  return (
    <Box
      sx={{
        border: '2px dashed',
        borderColor: m3Neutral[80],
        borderRadius: 2,
        p: { xs: 4, md: 6 },
        textAlign: 'center',
        maxWidth: 480,
        mx: 'auto',
      }}
    >
      <Box
        sx={{
          display: 'inline-flex',
          mb: 2,
          '@keyframes pulse': {
            '0%, 100%': { transform: 'scale(1)' },
            '50%': { transform: 'scale(1.1)' },
          },
          animation: 'pulse 2s ease-in-out infinite',
        }}
      >
        <DescriptionIcon
          sx={{ fontSize: 56, color: m3Primary[70], opacity: 0.7 }}
        />
      </Box>

      <Typography
        variant="h6"
        sx={{ fontWeight: 600, mb: 1 }}
      >
        NATA 2026 Brochure — Coming Soon
      </Typography>

      <Typography variant="body2" color="text.secondary">
        The official brochure has not been released yet by CoA. We&apos;ll
        update this section as soon as available.
      </Typography>
    </Box>
  );
}

export default function BrochureSection({ brochures }: BrochureSectionProps) {
  const hasBrochures = brochures && brochures.length > 0;

  return (
    <Box
      component="section"
      sx={{
        bgcolor: m3Neutral[99],
        py: { xs: 6, md: 10 },
        px: { xs: 2, md: 0 },
      }}
    >
      <Container maxWidth="lg">
        <ScrollReveal direction="up">
          {/* Heading */}
          <Typography
            variant="h4"
            component="h2"
            sx={{
              fontWeight: 700,
              textAlign: 'center',
              mb: 1,
              fontSize: { xs: '1.5rem', md: '2rem' },
            }}
          >
            Download Official Brochure
          </Typography>

          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ textAlign: 'center', mb: { xs: 4, md: 5 } }}
          >
            Get the latest NATA 2026 information booklet from CoA
          </Typography>

          {/* Brochure list or coming-soon fallback */}
          {hasBrochures ? (
            <Grid container spacing={3} justifyContent="center">
              {brochures.map((brochure) => (
                <Grid item xs={12} sm={6} key={brochure.id}>
                  <BrochureCard brochure={brochure} />
                </Grid>
              ))}
            </Grid>
          ) : (
            <ComingSoonCard />
          )}
        </ScrollReveal>
      </Container>
    </Box>
  );
}
