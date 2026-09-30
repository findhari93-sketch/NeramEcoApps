'use client';

import { Box, Typography } from '@neram/ui';
import { LEVEL_FILTER_KEYS, levelFilterLabel, type LevelFilterKey } from '@/lib/student-level';
import { LevelBars } from './LevelMark';

/**
 * Narrow the students list by overall level: Top, Mid, Needs practice, Not rated.
 *
 * Same shape and rules as LanguageFilterBar, so the two rows read as one system:
 * multi-select toggles that OR with each other and COMBINE with the segment
 * above, counts that are facets of the list as already narrowed, and a labelled
 * group of aria-pressed buttons (the segment bar owns the only tablist).
 *
 * "Not rated" is how a manager finds who is still left to sort.
 */

const RESET_BUTTON = { appearance: 'none', font: 'inherit', cursor: 'pointer', textAlign: 'left' } as const;

export default function DrawingLevelFilterBar({
  value,
  counts,
  onChange,
}: {
  value: readonly LevelFilterKey[];
  counts: Record<LevelFilterKey, number>;
  onChange: (next: LevelFilterKey[]) => void;
}) {
  const toggle = (key: LevelFilterKey) => {
    const next = value.includes(key) ? value.filter((k) => k !== key) : [...value, key];
    onChange(LEVEL_FILTER_KEYS.filter((k) => next.includes(k)));
  };

  return (
    <Box
      role="group"
      aria-label="Filter students by overall level"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        overflowX: 'auto',
        pb: 0.5,
        maxWidth: { sm: '100%' },
        overscrollBehaviorX: 'contain',
        '&::-webkit-scrollbar': { display: 'none' },
        scrollbarWidth: 'none',
        '@media (max-width: 599.95px)': {
          mx: -2,
          px: 2,
          maskImage: 'linear-gradient(to right, #000 calc(100% - 28px), transparent)',
          WebkitMaskImage: 'linear-gradient(to right, #000 calc(100% - 28px), transparent)',
        },
      }}
    >
      <Typography aria-hidden variant="caption" color="text.secondary" sx={{ fontWeight: 700, flexShrink: 0, mr: 0.25 }}>
        Level
      </Typography>
      {LEVEL_FILTER_KEYS.map((key) => {
        const selected = value.includes(key);
        const n = counts[key] ?? 0;
        return (
          <Box
            component="button"
            type="button"
            key={key}
            onClick={() => toggle(key)}
            aria-pressed={selected}
            aria-label={`${levelFilterLabel(key)}, ${n} students`}
            data-testid={`level-chip-${key}`}
            sx={{
              ...RESET_BUTTON,
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 44,
              px: 1.5,
              gap: 0.75,
              borderRadius: 999,
              border: '1px solid',
              borderColor: selected ? 'primary.main' : 'divider',
              bgcolor: selected ? 'action.selected' : 'background.paper',
              color: selected ? 'primary.main' : 'text.primary',
              fontWeight: selected ? 700 : 500,
              fontSize: 14,
              whiteSpace: 'nowrap',
              transition: 'border-color 150ms ease, background-color 150ms ease',
              '&:hover': { borderColor: selected ? 'primary.main' : 'text.secondary' },
              '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          >
            {key !== 'unrated' && (
              <Box component="span" sx={{ color: 'primary.main', display: 'inline-flex' }}>
                <LevelBars level={key} size={18} />
              </Box>
            )}
            {levelFilterLabel(key)}
            <Box component="span" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
              {n}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
