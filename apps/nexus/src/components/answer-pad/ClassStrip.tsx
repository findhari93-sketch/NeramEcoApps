'use client';

/**
 * The class at a glance, under the console's title: one funnel bar and the
 * numbers it is drawn from, from the class list down to who answered.
 *
 *   [■■■■■■■▪▪▪▪▪▫▫▫▫░░░░░░░░░░░░░░░]
 *   ○ 37 expected  ● 4 in meeting
 *   ● 3 with pad   ● 2 answered
 *
 * The bar's full width is the students expected today. On it, one layer per
 * number, the larger behind the smaller: in the meeting, with the pad,
 * answered. Each number's dot is its layer's colour, so the bar and the words
 * say the same thing, and the words alone say all of it. Tapping it opens the
 * People sheet with the names.
 */

import { Box, Stack, Typography, alpha, useTheme } from '@neram/ui';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import { funnelItems, funnelStats, type ClassFunnel } from '@/lib/pad/client/teacher-view';

export default function ClassStrip({ funnel, onOpen }: { funnel: ClassFunnel; onOpen: () => void }) {
  const theme = useTheme();
  const colour = {
    no_pad: alpha(theme.palette.text.primary, 0.32),
    waiting: theme.palette.primary.main,
    answered: theme.palette.success.main,
  } as const;
  const whole = Math.max(1, funnel.expected, funnel.inMeeting ?? 0, funnel.withPad);
  const layers = [
    { key: 'no_pad' as const, count: funnel.inMeeting ?? 0 },
    { key: 'waiting' as const, count: funnel.withPad },
    ...(funnel.asking ? [{ key: 'answered' as const, count: funnel.answered }] : []),
  ]
    .filter((layer) => layer.count > 0)
    // The larger behind the smaller, whatever order the numbers come in.
    .sort((a, b) => b.count - a.count);

  return (
    <Box
      component="button"
      type="button"
      onClick={onOpen}
      aria-label={`${funnelItems(funnel).join(', ')}. See who`}
      sx={{
        all: 'unset',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        width: '100%',
        minHeight: 44,
        mt: 0.5,
        px: 1,
        py: 0.75,
        borderRadius: 2,
        cursor: 'pointer',
        border: '1px solid',
        borderColor: 'divider',
        transition: 'background-color 150ms',
        '&:hover': { bgcolor: 'action.hover' },
        '&:focus-visible': { outline: '2px solid', outlineColor: theme.palette.primary.main, outlineOffset: 1 },
      }}
    >
      <Stack spacing={0.75} sx={{ flex: 1, minWidth: 0 }}>
        <Box aria-hidden sx={{ position: 'relative', height: 6, borderRadius: 3, overflow: 'hidden', bgcolor: alpha(theme.palette.text.primary, 0.08) }}>
          {layers.map((layer) => (
            <Box
              key={layer.key}
              data-layer={layer.key}
              sx={{
                position: 'absolute',
                inset: 0,
                right: 'auto',
                width: `${(Math.min(layer.count, whole) / whole) * 100}%`,
                borderRadius: 3,
                bgcolor: colour[layer.key],
                transition: 'width 300ms ease-out',
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              }}
            />
          ))}
        </Box>
        <Box aria-hidden sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.25 }}>
          {funnelStats(funnel).map((stat) => (
            <Stack key={stat.label} direction="row" alignItems="center" spacing={0.5} sx={{ whiteSpace: 'nowrap' }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  flexShrink: 0,
                  ...(stat.part ? { bgcolor: colour[stat.part] } : { border: '1.5px solid', borderColor: alpha(theme.palette.text.primary, 0.32) }),
                }}
              />
              <Typography component="span" variant="caption" sx={{ lineHeight: 1.4, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                <Box component="span" sx={{ fontWeight: 800, color: 'text.primary' }}>
                  {stat.value}
                </Box>
                {` ${stat.label}`}
              </Typography>
            </Stack>
          ))}
        </Box>
      </Stack>
      <ChevronRightRounded fontSize="small" sx={{ color: 'text.secondary', flexShrink: 0 }} aria-hidden />
    </Box>
  );
}
