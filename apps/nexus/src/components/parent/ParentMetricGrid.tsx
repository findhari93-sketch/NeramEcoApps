'use client';

import { Box, Typography, alpha, useTheme } from '@neram/ui';
import { RADIUS } from '@/components/timetable/timetable-theme';

/**
 * The tiles at the top of a parent surface.
 *
 * Extracted from the inline Metric on the dashboard so Home, Work and Tests all
 * render a number the same way. Before this, each page styled its own and they
 * drifted in size and weight, which made the portal read as three products.
 *
 * THE RULE: a value of null renders as a sentence, never as a zero. "We have not
 * measured anything yet" and "your child scored nothing" are completely
 * different messages to send a parent, and a bare 0 cannot tell them apart. That
 * is why `value` is nullable and `emptyLabel` is required alongside it.
 */

export interface ParentMetric {
  label: string;
  /** null means "nothing to report", which renders emptyLabel instead. */
  value: string | number | null;
  emptyLabel: string;
  hint?: string;
  tone?: 'success' | 'warning' | 'error' | 'neutral';
  onClick?: () => void;
}

export default function ParentMetricGrid({ metrics }: { metrics: ParentMetric[] }) {
  const theme = useTheme();

  const toneColor = (tone: ParentMetric['tone']) =>
    tone === 'success'
      ? theme.palette.success.main
      : tone === 'warning'
        ? theme.palette.warning.main
        : tone === 'error'
          ? theme.palette.error.main
          : theme.palette.text.primary;

  return (
    <Box
      sx={{
        display: 'grid',
        // Two up on a phone, four across from sm. Three columns at 375px gives
        // 105px tiles, which cannot hold "Not recorded yet" without wrapping to
        // three lines.
        gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
        gap: 1,
      }}
    >
      {metrics.map((m) => {
        const empty = m.value === null;
        const interactive = !!m.onClick;
        return (
          <Box
            key={m.label}
            component={interactive ? 'button' : 'div'}
            onClick={m.onClick}
            sx={{
              textAlign: 'left',
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: RADIUS.card,
              bgcolor: 'background.paper',
              p: { xs: 1.5, sm: 1.75 },
              minHeight: 88,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 0.25,
              cursor: interactive ? 'pointer' : 'default',
              transition: 'background-color 180ms ease',
              '&:hover': interactive
                ? { bgcolor: alpha(theme.palette.primary.main, 0.04) }
                : {},
              '&:focus-visible': {
                outline: `2px solid ${theme.palette.primary.main}`,
                outlineOffset: -2,
              },
            }}
          >
            <Typography
              sx={{
                fontSize: '0.625rem',
                fontWeight: 700,
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                color: 'text.disabled',
              }}
            >
              {m.label}
            </Typography>

            {empty ? (
              <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.35 }}>
                {m.emptyLabel}
              </Typography>
            ) : (
              <Typography
                sx={{
                  fontSize: 22,
                  fontWeight: 700,
                  lineHeight: 1.15,
                  color: toneColor(m.tone),
                }}
              >
                {m.value}
              </Typography>
            )}

            {m.hint && !empty && (
              <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.3 }}>
                {m.hint}
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
