'use client';

import { Box, type SxProps, type Theme } from '@neram/ui';
import { LANGUAGES, showsLanguageMark, type LanguageKey } from '@/lib/student-language';

/**
 * The language mark: one letter on a small disc.
 *
 * One component for every place the mark appears (the avatar corner, the filter
 * chips, the profile chip, the Set stage sheet), so a teacher learns one shape in
 * one place and recognises it everywhere else.
 *
 * FILLED means "they follow this language, and English too". Neutral ink rather
 * than a colour, on purpose: the ring already spends five colours on the study
 * stage and the presence dot spends four more, so any hue here would read as one
 * of those. text.primary on background.paper also flips by itself in dark mode.
 *
 * OUTLINED means "and they cannot follow English". The inverse of the filled
 * disc, so the two are told apart by lightness and by the ring around the letter
 * rather than by colour, and both survive at 14px on a 30px avatar.
 *
 * Renders nothing for a plain English student: their corner stays bare, which is
 * what makes a mark mean something.
 *
 * Decorative (aria-hidden): whatever it sits in carries the words.
 */
export default function LanguageMark({
  language,
  limitedEnglish = false,
  size = 16,
  sx,
  testId,
}: {
  language: LanguageKey;
  limitedEnglish?: boolean;
  size?: number;
  sx?: SxProps<Theme>;
  testId?: string;
}) {
  if (!showsLanguageMark(language, limitedEnglish)) return null;

  const { mark, fontStack, markScale } = LANGUAGES[language];
  // The outlined ring eats into the disc, so its letter sits a little smaller.
  const scale = limitedEnglish ? markScale * 0.87 : markScale;

  return (
    <Box
      component="span"
      aria-hidden
      data-testid={testId}
      data-language={language}
      data-limited-english={limitedEnglish ? 'true' : 'false'}
      sx={[
        {
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: '50%',
          display: 'inline-grid',
          placeItems: 'center',
          bgcolor: limitedEnglish ? 'background.paper' : 'text.primary',
          color: limitedEnglish ? 'text.primary' : 'background.paper',
          // Inset rather than an outer border, so an outlined mark occupies
          // exactly the same box as a filled one wherever it is placed.
          boxShadow: limitedEnglish ? (theme) => `inset 0 0 0 2px ${theme.palette.text.primary}` : 'none',
          ...(fontStack ? { fontFamily: fontStack } : {}),
          fontWeight: 800,
          fontSize: Math.round(size * scale),
          lineHeight: 1,
          userSelect: 'none',
          pointerEvents: 'none',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {mark}
    </Box>
  );
}
