'use client';

import { Box, Typography } from '@neram/ui';
import {
  LANGUAGES,
  LANGUAGE_ORDER,
  LANGUAGE_SECTION_TITLE,
  LIMITED_ENGLISH_LABEL,
  type LanguageKey,
} from '@/lib/student-language';
import LanguageMark from './LanguageMark';

/**
 * Narrow the students list by language: Tamil, Hindi, Kannada, Malayalam,
 * English, plus the separate Limited English tick.
 *
 * Multi-select toggles rather than a second tab bar, because they COMBINE with
 * the category segment above ("Exam this year" AND "Hindi") instead of replacing
 * it. Nothing pressed means no narrowing.
 *
 * TWO KINDS OF CHIP, which is why the last one sits behind a hairline. The five
 * languages answer "which language" and so they OR with each other: Tamil plus
 * Hindi shows both. Limited English answers a different question, "can they
 * follow an English class at all", so it NARROWS whatever the languages left.
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
  limitedOnly,
  limitedCount,
  onChange,
  onLimitedChange,
}: {
  value: readonly LanguageKey[];
  counts: Record<LanguageKey, number>;
  limitedOnly: boolean;
  limitedCount: number;
  onChange: (next: LanguageKey[]) => void;
  onLimitedChange: (next: boolean) => void;
}) {
  const toggle = (key: LanguageKey) => {
    const next = value.includes(key) ? value.filter((k) => k !== key) : [...value, key];
    // Stable order, so the URL does not depend on tap order.
    onChange(LANGUAGE_ORDER.filter((k) => next.includes(k)));
  };

  const chipSx = (selected: boolean) => ({
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
  });

  const count = (n: number) => (
    <Box component="span" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
      {n}
    </Box>
  );

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
        maxWidth: { sm: '100%' },
        overscrollBehaviorX: 'contain',
        '&::-webkit-scrollbar': { display: 'none' },
        scrollbarWidth: 'none',
        // Edge to edge on a phone, fading at the right so the hidden languages
        // announce themselves (see StudentSegmentBar).
        '@media (max-width: 599.95px)': {
          mx: -2,
          px: 2,
          maskImage: 'linear-gradient(to right, #000 calc(100% - 28px), transparent)',
          WebkitMaskImage: 'linear-gradient(to right, #000 calc(100% - 28px), transparent)',
        },
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
        return (
          <Box
            component="button"
            type="button"
            key={key}
            onClick={() => toggle(key)}
            aria-pressed={selected}
            aria-label={`${LANGUAGES[key].label}, ${counts[key] ?? 0} students`}
            data-testid={`language-chip-${key}`}
            sx={chipSx(selected)}
          >
            <LanguageMark language={key} size={18} />
            {LANGUAGES[key].label}
            {count(counts[key] ?? 0)}
          </Box>
        );
      })}

      {/* A different question, so it narrows rather than widens. The hairline is
          what stops it reading as a sixth language. */}
      <Box aria-hidden sx={{ flexShrink: 0, width: '1px', alignSelf: 'stretch', bgcolor: 'divider', mx: 0.25 }} />

      <Box
        component="button"
        type="button"
        onClick={() => onLimitedChange(!limitedOnly)}
        aria-pressed={limitedOnly}
        aria-label={`Only students with limited English, ${limitedCount} students`}
        data-testid="language-chip-limited"
        sx={chipSx(limitedOnly)}
      >
        <LanguageMark language="english" limitedEnglish size={18} />
        {LIMITED_ENGLISH_LABEL}
        {count(limitedCount)}
      </Box>
    </Box>
  );
}
