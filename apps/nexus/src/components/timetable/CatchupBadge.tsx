'use client';

import Link from 'next/link';
import { Box, alpha, useTheme, type SxProps, type Theme } from '@neram/ui';
import { healthShortText, type CalendarClass } from '@/lib/catchup-calendar';
import { catchupHref, catchupSentence, catchupTone, type CatchupTone } from './catchup-badge';

/**
 * The colours for one tone.
 *
 * The dot takes the tone's `main`; the TEXT takes `dark` on a paper fill,
 * because `main` on white is under 4.5:1 for amber (and close for green) at
 * this size. In a dark palette `dark` would sink into the background, so the
 * text flips to `light` there. Neutral reads as secondary text either way.
 */
export function catchupToneColors(theme: Theme, tone: CatchupTone): { dot: string; text: string; border: string } {
  if (tone === 'neutral') {
    return {
      dot: theme.palette.text.disabled,
      text: theme.palette.text.secondary,
      border: theme.palette.divider,
    };
  }
  const p = theme.palette[tone];
  return {
    dot: p.main,
    text: theme.palette.mode === 'dark' ? p.light : p.dark,
    border: alpha(p.main, 0.45),
  };
}

/** The coloured dot on its own. Decorative: callers carry the words. */
export function CatchupDot({ c, sx }: { c: CalendarClass; sx?: SxProps<Theme> }) {
  const theme = useTheme();
  const { dot } = catchupToneColors(theme, catchupTone(c));
  return (
    <Box
      component="span"
      aria-hidden
      data-testid="catchup-dot"
      data-health={c.health}
      sx={[
        { flexShrink: 0, width: 7, height: 7, borderRadius: '50%', bgcolor: dot },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}

interface CatchupBadgeProps {
  c: CalendarClass;
  /**
   * `row`: a list row or card with room to spare. The pill is 24px tall and the
   * tap target is stretched to 44px around it.
   *
   * `block`: inside a week-grid block, where a 44px target would swallow the
   * block. The pill itself is the target (24px, the WCAG 2.2 AA minimum).
   */
  size?: 'row' | 'block';
  sx?: SxProps<Theme>;
}

/**
 * "3 to catch up", "Recap missing, 2 waiting", "All caught up".
 *
 * A link to the class on the Catch-up calendar. Staff only: the timetable page
 * is the one place that fetches the data, and every view renders nothing when
 * it is not handed any, so the student timetable never draws one.
 *
 * Stops propagation because two of its hosts (the class card, and the day row
 * it sits beside) open the class panel on click, and a tap here means "go to
 * Catch-up", not both.
 */
export default function CatchupBadge({ c, size = 'row', sx }: CatchupBadgeProps) {
  const theme = useTheme();
  const tone = catchupTone(c);
  const colors = catchupToneColors(theme, tone);
  const text = healthShortText(c);
  const isRow = size === 'row';

  return (
    <Box
      component={Link}
      href={catchupHref(c)}
      prefetch={false}
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
      aria-label={`${catchupSentence(c)}. Open in Catch-up`}
      title={catchupSentence(c)}
      data-testid="catchup-badge"
      data-health={c.health}
      sx={[
        {
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          maxWidth: '100%',
          minWidth: 0,
          height: 24,
          px: isRow ? 1 : 0.75,
          borderRadius: 999,
          border: `1px solid ${colors.border}`,
          bgcolor: 'background.paper',
          color: colors.text,
          fontFamily: 'inherit',
          fontSize: isRow ? '0.75rem' : '0.6875rem',
          fontWeight: 700,
          lineHeight: 1,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          transition: theme.transitions.create(['background-color', 'border-color'], { duration: 150 }),
          '&:hover': {
            bgcolor: tone === 'neutral' ? theme.palette.action.hover : alpha(colors.dot, 0.1),
            borderColor: colors.dot,
          },
          '&:focus-visible': {
            outline: `2px solid ${theme.palette.primary.main}`,
            outlineOffset: 2,
          },
          // The pill stays small so it does not swamp the row; the target
          // around it does not.
          ...(isRow && {
            '&::after': {
              content: '""',
              position: 'absolute',
              top: '50%',
              left: 0,
              right: 0,
              height: 44,
              transform: 'translateY(-50%)',
            },
          }),
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <CatchupDot c={c} />
      <Box
        component="span"
        aria-hidden
        sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {text}
      </Box>
    </Box>
  );
}
