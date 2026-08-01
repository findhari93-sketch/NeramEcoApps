'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Collapse,
  Paper,
  Skeleton,
  SwipeableDrawer,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import ClassStandingBreakdown from './ClassStandingBreakdown';
import StandingBandChip from './StandingBandChip';
import { BAND_COLOR, type ClassStandingResult, type StandingAudience } from '@/lib/class-standing';

/**
 * Class Standing, for a teacher on a profile page and for a parent on their
 * dashboard.
 *
 * ONE component, `audience` prop. The two surfaces must show the same number,
 * the same band and the same evidence; giving each its own card is how they
 * start to drift, and a parent being told something different from the teacher
 * is worse than showing nothing.
 *
 * "Why this number" opens a bottom sheet below `md` (the house rule: bottom
 * sheets over modals on mobile) and an inline expansion above it.
 *
 * When `score` is null the card shows the band and the reason, and no number.
 * Settling In and Not Enough Data are real answers, not failures to compute.
 */
export default function ClassStandingCard({
  standing,
  audience,
  loading = false,
  studentName,
}: {
  standing: ClassStandingResult | null;
  audience: StandingAudience;
  loading?: boolean;
  /** Parent surfaces address the child by name. */
  studentName?: string | null;
}) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <Paper sx={{ p: 2.5, mb: 2 }}>
        <Skeleton variant="text" width={140} height={20} />
        <Skeleton variant="text" width={90} height={48} />
        <Skeleton variant="rectangular" height={40} sx={{ borderRadius: 1, mt: 1 }} />
      </Paper>
    );
  }

  if (!standing) return null;

  const color = BAND_COLOR[standing.band];
  const breakdown = <ClassStandingBreakdown standing={standing} audience={audience} />;

  return (
    <Paper
      sx={{
        p: 2.5,
        mb: 2,
        borderLeft: '4px solid',
        borderLeftColor: color,
        bgcolor: alpha(color, 0.04),
      }}
    >
      <Typography
        variant="overline"
        sx={{ fontWeight: 800, letterSpacing: '0.08em', color: 'text.secondary' }}
      >
        Class Standing
      </Typography>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'wrap',
          mt: 0.5,
          mb: 1,
        }}
      >
        {standing.score !== null && (
          <Typography
            component="span"
            sx={{ fontSize: '2.75rem', fontWeight: 900, lineHeight: 1, color }}
          >
            {standing.score}
            <Typography
              component="span"
              sx={{ fontSize: '1rem', fontWeight: 700, color: 'text.secondary', ml: 0.5 }}
            >
              / 100
            </Typography>
          </Typography>
        )}
        <StandingBandChip band={standing.band} label={standing.bandLabel} />
      </Box>

      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        {standing.headline}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
        {audience === 'parent' && studentName
          ? standing.detail.replace(/^They /, `${studentName.split(' ')[0]} `)
          : standing.detail}
      </Typography>

      <Button
        onClick={() => setOpen((v) => !v)}
        variant="outlined"
        fullWidth={!isDesktop}
        aria-expanded={open}
        sx={{ minHeight: 48, mt: 1.5, fontWeight: 700, textTransform: 'none' }}
      >
        {open && isDesktop ? 'Hide the detail' : 'Why this number'}
      </Button>

      {isDesktop ? (
        <Collapse in={open}>
          <Box sx={{ mt: 2 }}>{breakdown}</Box>
        </Collapse>
      ) : (
        <SwipeableDrawer
          anchor="bottom"
          open={open}
          onClose={() => setOpen(false)}
          onOpen={() => setOpen(true)}
          disableSwipeToOpen
          PaperProps={{
            sx: {
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: '85vh',
              p: 2.5,
            },
          }}
        >
          <Box
            aria-hidden
            sx={{
              width: 36,
              height: 4,
              borderRadius: 2,
              bgcolor: 'divider',
              mx: 'auto',
              mb: 2,
            }}
          />
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>
            Why this number
          </Typography>
          <Box sx={{ mb: 2 }}>
            <StandingBandChip band={standing.band} label={standing.bandLabel} size="small" />
          </Box>
          {breakdown}
          <Button
            onClick={() => setOpen(false)}
            variant="contained"
            fullWidth
            sx={{ minHeight: 48, mt: 3, fontWeight: 700 }}
          >
            Close
          </Button>
        </SwipeableDrawer>
      )}
    </Paper>
  );
}
