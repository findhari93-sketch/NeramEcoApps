import { Box, Typography, Chip } from '@neram/ui';

interface LastUpdatedBadgeProps {
  /** Date string like "March 13, 2026" */
  date: string;
  /** Source reference like "Official NATA 2026 Brochure V1.0" */
  source?: string;
  /** Light variant for dark hero backgrounds, dark for light backgrounds */
  variant?: 'light' | 'dark';
}

/** Shared "Last Updated" badge for NATA 2026 pages to build trust and show freshness */
export default function LastUpdatedBadge({
  date,
  source = 'Official NATA 2026 Brochure V1.0',
  variant = 'light',
}: LastUpdatedBadgeProps) {
  const isLight = variant === 'light';

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        mt: 2,
        px: 1.5,
        py: 0.75,
        borderRadius: 1,
        bgcolor: isLight ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.04)',
        border: '1px solid',
        borderColor: isLight ? 'rgba(255,255,255,0.15)' : 'divider',
      }}
    >
      <Chip
        label="VERIFIED"
        size="small"
        sx={{
          height: 20,
          fontSize: '0.65rem',
          fontWeight: 700,
          letterSpacing: '0.05em',
          bgcolor: isLight ? 'rgba(76,175,80,0.25)' : 'success.light',
          color: isLight ? '#a5d6a7' : 'success.dark',
          '& .MuiChip-label': { px: 0.8 },
        }}
      />
      <Typography
        variant="caption"
        sx={{
          color: isLight ? 'rgba(255,255,255,0.7)' : 'text.secondary',
          fontSize: '0.75rem',
          fontWeight: 500,
        }}
      >
        Updated {date} · Source: {source}
      </Typography>
    </Box>
  );
}
