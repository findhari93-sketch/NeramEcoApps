'use client';

import { Box, Typography } from '@neram/ui';
import {
  LANGUAGE_FILTER_LABEL,
  LANGUAGE_ORDER,
  LANGUAGE_SECTION_TITLE,
  type LanguageKey,
} from '@/lib/student-language';
import TamilMark from './TamilMark';

/**
 * Narrow the students list by language: Tamil, English only, Not set.
 *
 * Multi-select toggles rather than a second tab bar, because it COMBINES with the
 * category segment above ("Exam this year" AND "English only") instead of
 * replacing it. Nothing pressed means no narrowing.
 *
 * Counts are facets of the list as the segment and search have already narrowed
 * it, so pressing one chip alone always shows exactly that many rows.
 *
 * A labelled group of aria-pressed buttons, never role="tab": the segment bar
 * above owns the tablist, and a second one on the same screen would be announced
 * as part of it.
 */

const RESET_BUTTON = { appearance: 'none', font: 'inherit', cursor: 'pointer', textAlign: 'left' } as const;

export default function LanguageFilterBar({
  value,
  counts,
  onChange,
}: {
  value: readonly LanguageKey[];
  counts: Record<LanguageKey, number>;
  onChange: (next: LanguageKey[]) => void;
}) {
  const toggle = (key: LanguageKey) => {
    const next = value.includes(key) ? value.filter((k) => k !== key) : [...value, key];
    // Stable order, so the URL does not depend on tap order.
    onChange(LANGUAGE_ORDER.filter((k) => next.includes(k)));
  };

  return (
    <Box
      role="group"
      aria-label="Filter students by language"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        overflowX: 'auto',
        pb: 0.5,
        // The row may scroll itself; it must never push the document sideways.
        maxWidth: '100%',
        '&::-webkit-scrollbar': { display: 'none' },
        scrollbarWidth: 'none',
      }}
    >
      <Typography
        aria-hidden
        variant="caption"
        color="text.secondary"
        sx={{ fontWeight: 700, flexShrink: 0, mr: 0.25 }}
      >
        {LANGUAGE_SECTION_TITLE}
      </Typography>

      {LANGUAGE_ORDER.map((key) => {
        const selected = value.includes(key);
        const count = counts[key] ?? 0;
        return (
          <Box
            component="button"
            type="button"
            key={key}
            onClick={() => toggle(key)}
            aria-pressed={selected}
            aria-label={`${LANGUAGE_FILTER_LABEL[key]}, ${count} students`}
            data-testid={`language-chip-${key}`}
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
            {key === 'tamil' && <TamilMark size={18} />}
            {key === 'unset' && (
              <Box
                aria-hidden
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  flexShrink: 0,
                  border: '2px dotted',
                  borderColor: 'text.secondary',
                }}
              />
            )}
            {LANGUAGE_FILTER_LABEL[key]}
            <Box component="span" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
              {count}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
