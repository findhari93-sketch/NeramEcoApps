import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { siteTokens } from '@neram/ui/site-tokens';

interface CollegeYouTubeProps {
  youtubeChannelUrl: string;
}

/**
 * Normalises a YouTube channel URL to a clean canonical form.
 * Handles formats:
 *   https://www.youtube.com/@handle
 *   https://www.youtube.com/channel/UCxxxxxx
 *   https://youtube.com/c/channelname
 *   https://youtube.com/user/username
 */
function normaliseYouTubeUrl(raw: string): string {
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return `https://www.youtube.com${url.pathname}`;
  } catch {
    return raw;
  }
}

/**
 * Extracts a human-readable channel label from a URL.
 * "@handle" → "@handle"
 * "/channel/UCxxxxxx" → "Official Channel"
 * "/c/name" → "name"
 * "/user/name" → "name"
 */
function extractChannelLabel(url: string): string {
  try {
    const { pathname } = new URL(url.startsWith('http') ? url : `https://${url}`);
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0]?.startsWith('@')) return parts[0];
    if (parts[0] === 'channel') return 'Official Channel';
    if (parts[1]) return parts[1];
    return 'Official Channel';
  } catch {
    return 'Official Channel';
  }
}

export default function CollegeYouTube({ youtubeChannelUrl }: CollegeYouTubeProps) {
  const canonicalUrl = normaliseYouTubeUrl(youtubeChannelUrl);
  const channelLabel = extractChannelLabel(youtubeChannelUrl);

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 1,
        overflow: 'hidden',
        borderColor: siteTokens.line,
        background: siteTokens.surface,
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        gap={2}
        sx={{ p: { xs: 2, sm: 2.5 } }}
      >
        {/* YouTube icon block */}
        <Box
          sx={{
            width: { xs: 56, sm: 64 },
            height: { xs: 56, sm: 64 },
            borderRadius: 1,
            bgcolor: siteTokens.navy900,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <PlayCircleIcon sx={{ fontSize: { xs: 32, sm: 36 }, color: siteTokens.gold500 }} />
        </Box>

        {/* Text content */}
        <Box flex={1}>
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 700, mb: 0.25, fontSize: { xs: '0.9375rem', sm: '1rem' } }}
          >
            {channelLabel}
          </Typography>
          <Typography variant="body2" color={siteTokens.inkMuted} sx={{ lineHeight: 1.5, mb: 1.5 }}>
            Follow this college's official YouTube channel for campus tours, events, student life videos, and academic content.
          </Typography>
          <Button
            variant="contained"
            size="small"
            href={canonicalUrl}
            target="_blank"
            rel="noopener noreferrer"
            endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
            sx={{
              bgcolor: siteTokens.navy900,
              color: siteTokens.paper,
              '&:hover': { bgcolor: siteTokens.navy700 },
              borderRadius: 1,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8125rem',
              px: 2,
              py: 0.75,
              minHeight: 36,
            }}
          >
            View YouTube Channel
          </Button>
        </Box>
      </Stack>

      {/* Subscription note */}
      <Box
        sx={{
          px: { xs: 2, sm: 2.5 },
          py: 1,
          bgcolor: siteTokens.ground,
          borderTop: `1px solid ${siteTokens.line}`,
        }}
      >
        <Typography variant="caption" color={siteTokens.inkMuted}>
          Subscribe to stay updated on admissions, workshops, and student events from this college.
        </Typography>
      </Box>
    </Paper>
  );
}
