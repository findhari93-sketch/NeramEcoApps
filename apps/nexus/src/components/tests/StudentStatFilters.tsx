'use client';

/**
 * The Students tab's numbers, which are also its filters.
 *
 * Four cards used to sit above both results tabs, took most of the screen on a
 * laptop, and did nothing when pressed, while a separate row of chips below
 * them did the filtering. A teacher reads "Not passed 5" and wants the five, so
 * the number is now the button that shows them.
 *
 * One choice at a time. Pressing the active tile again goes back to Everyone.
 * A group with nobody in it stays visible but disabled: a zero is information
 * ("everyone has done it"), a live button that opens onto nobody is not.
 */

import { Box, Typography } from '@neram/ui';
import type { ResultFilter } from '@/lib/test-result-filters';

export type StatTone = 'neutral' | 'success' | 'warning' | 'error' | 'info';

/**
 * Generic over the key so any list's groups can use it (test results, Class
 * rhythm statuses). The "everyone" key defaults to 'all'.
 */
export interface StatFilterTile<K extends string = ResultFilter> {
  key: K;
  label: string;
  value: number;
  hint: string;
  tone: StatTone;
}

const TONE_COLOR: Record<StatTone, string> = {
  neutral: 'grey.400',
  success: 'success.main',
  warning: 'warning.main',
  error: 'error.main',
  info: 'info.main',
};

export default function StudentStatFilters<K extends string = ResultFilter>({
  tiles,
  active,
  onChange,
  allKey = 'all' as K,
  phoneLayout = 'scroll',
}: {
  tiles: StatFilterTile<K>[];
  active: K;
  onChange: (next: K) => void;
  /** The key that means "everyone"; pressing an active tile returns to it. */
  allKey?: K;
  /** 'scroll' is one snapping row; 'grid' wraps into two columns, for four or fewer tiles. */
  phoneLayout?: 'scroll' | 'grid';
}) {
  const grid = phoneLayout === 'grid';
  return (
    <Box
      role="group"
      aria-label="Filter students"
      sx={{
        display: grid ? 'grid' : { xs: 'flex', md: 'grid' },
        gridTemplateColumns: grid
          ? { xs: 'repeat(2, minmax(0, 1fr))', md: `repeat(${tiles.length}, minmax(0, 1fr))` }
          : { md: `repeat(${tiles.length}, minmax(0, 1fr))` },
        gap: 1,
        mb: 1.5,
        // A snapping row on a phone, so six tiles cost one line of height
        // rather than three.
        overflowX: grid ? 'visible' : { xs: 'auto', md: 'visible' },
        scrollSnapType: grid ? 'none' : { xs: 'x mandatory', md: 'none' },
        pb: grid ? 0 : { xs: 0.5, md: 0 },
        '&::-webkit-scrollbar': { height: 4 },
      }}
    >
      {tiles.map((t) => {
        const selected = active === t.key;
        const empty = t.value === 0 && t.key !== allKey;
        return (
          <Box
            component="button"
            type="button"
            key={t.key}
            data-testid={`stat-tile-${t.key}`}
            onClick={() => onChange(selected && t.key !== allKey ? allKey : t.key)}
            disabled={empty && !selected}
            aria-pressed={selected}
            aria-label={`${t.label}, ${t.value}. ${t.hint}`}
            sx={{
              appearance: 'none',
              font: 'inherit',
              color: 'text.primary',
              flex: grid ? 'initial' : { xs: '0 0 auto', md: 'initial' },
              minWidth: grid ? 0 : { xs: 124, md: 0 },
              scrollSnapAlign: 'start',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              textAlign: 'left',
              gap: 0.25,
              pl: 1.75,
              pr: 1.25,
              py: 1,
              // In the phone grid the hint line is hidden (it stays in the
              // accessible name), so four cards cost two short rows, not a screen.
              minHeight: grid ? { xs: 56, sm: 72 } : 72,
              borderRadius: 2,
              border: '1px solid',
              borderColor: selected ? 'primary.main' : 'divider',
              boxShadow: selected ? '0 0 0 1px currentColor inset' : 'none',
              bgcolor: selected ? 'action.selected' : 'background.paper',
              opacity: empty && !selected ? 0.55 : 1,
              cursor: 'pointer',
              transition: 'border-color 150ms ease, background-color 150ms ease',
              '&:hover:not(:disabled)': { borderColor: selected ? 'primary.main' : 'text.secondary' },
              '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              '&:disabled': { cursor: 'default' },
              // The tone is a stripe beside a label that already says what the
              // group is, never the only way to tell the tiles apart.
              '&::before': {
                content: '""',
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 4,
                bgcolor: TONE_COLOR[t.tone],
              },
            }}
          >
            <Typography
              component="span"
              variant="caption"
              sx={{ display: 'block', fontWeight: 700, color: selected ? 'primary.main' : 'text.secondary', lineHeight: 1.3 }}
            >
              {t.label}
            </Typography>
            <Typography component="span" sx={{ display: 'block', fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>
              {t.value}
            </Typography>
            <Typography
              component="span"
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ display: grid ? { xs: 'none', sm: 'block' } : 'block', maxWidth: '100%', lineHeight: 1.3 }}
            >
              {t.hint}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
