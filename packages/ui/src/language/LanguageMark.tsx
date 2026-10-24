'use client';

import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import { LANGUAGES, showsLanguageMark, type LanguageKey } from './languages';

/**
 * The language mark: one letter on a small disc.
 *
 * One component for every place the mark appears (the avatar corner, the filter
 * chips, the profile chip, the Set stage sheet, Admin's PersonAvatar), so staff
 * learn one shape in one place and recognise it everywhere else.
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
 * LIKELY (Admin only) means nobody has recorded it and the language is a guess
 * from where they live or the site language they picked. A grey disc: same
 * shape, quieter ink, so a guess never passes for a fact.
 *
 * Renders nothing for a plain English student: their corner stays bare, which is
 * what makes a mark mean something.
 *
 * Decorative (aria-hidden): whatever it sits in carries the words.
 */
export function LanguageMark({
  language,
  limitedEnglish = false,
  likely = false,
  size = 16,
  sx,
  testId,
}: {
  language: LanguageKey;
  limitedEnglish?: boolean;
  likely?: boolean;
  size?: number;
  sx?: SxProps<Theme>;
  testId?: string;
}) {
  if (!showsLanguageMark(language, limitedEnglish)) return null;

  const { mark, fontStack, markScale } = LANGUAGES[language];
  // The outlined ring eats into the disc, so its letter sits a little smaller.
  const scale = limitedEnglish ? markScale * 0.87 : markScale;
  const ink = likely ? 'text.secondary' : 'text.primary';

  return (
    <Box
      component="span"
      aria-hidden
      data-testid={testId}
      data-language={language}
      data-limited-english={limitedEnglish ? 'true' : 'false'}
      data-likely={likely ? 'true' : 'false'}
      sx={[
        {
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: '50%',
          display: 'inline-grid',
          placeItems: 'center',
          bgcolor: limitedEnglish ? 'background.paper' : ink,
          color: limitedEnglish ? ink : 'background.paper',
          // Inset rather than an outer border, so an outlined mark occupies
          // exactly the same box as a filled one wherever it is placed.
          boxShadow: limitedEnglish
            ? (theme) =>
                `inset 0 0 0 2px ${likely ? theme.palette.text.secondary : theme.palette.text.primary}`
            : 'none',
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

export default LanguageMark;
