'use client';

import { useMemo } from 'react';
import { Box, Typography } from '@neram/ui';
import { parseMathAnswer, formatMathValue } from '@neram/database';
import { renderMath } from './MathText';

interface MathAnswerPreviewProps {
  value: string;
  /**
   * Who is typing. A student is told when the box cannot be read as a number;
   * a teacher is told that a key like `2:3` is kept as text and must be typed
   * exactly, because that is a legitimate answer key, not a mistake.
   */
  audience?: 'student' | 'teacher';
  align?: 'left' | 'center';
  /**
   * For a dense table cell: no reserved height, smaller type, and nothing at
   * all for a plain number. The full version reserves its line so a form does
   * not jump while someone types.
   */
  compact?: boolean;
}

/**
 * "Reads as 2√3 ≈ 3.4641" under a numerical answer box.
 *
 * Shown only for a formula: repeating a plain "42" under itself is noise. The
 * line's height is reserved either way, so the page does not jump as the
 * student types the first `/`.
 */
export default function MathAnswerPreview({
  value,
  audience = 'student',
  align = 'left',
  compact = false,
}: MathAnswerPreviewProps) {
  const trimmed = value.trim();
  const parsed = useMemo(() => parseMathAnswer(trimmed), [trimmed]);
  const html = useMemo(() => (parsed && !parsed.isPlainNumber ? renderMath(parsed.latex, false) : ''), [parsed]);

  let content: React.ReactNode = null;
  if (!trimmed) {
    content = null;
  } else if (parsed && !parsed.isPlainNumber) {
    content = (
      <>
        <Typography component="span" variant="caption" color="text.secondary">
          Reads as
        </Typography>
        <Box component="span" sx={{ fontSize: compact ? 14 : 18 }} dangerouslySetInnerHTML={{ __html: html }} />
        <Typography component="span" variant="caption" color="text.secondary">
          ≈ {formatMathValue(parsed.value)}
        </Typography>
      </>
    );
  } else if (!parsed) {
    content = (
      <Typography component="span" variant="caption" color="text.secondary">
        {audience === 'teacher'
          ? 'Not a number, so it is kept as text. Students must type it exactly.'
          : 'This does not read as a number yet. Check the brackets.'}
      </Typography>
    );
  }

  if (compact && !content) return null;

  return (
    <Box
      aria-live="polite"
      sx={{
        minHeight: compact ? 0 : 32,
        mt: compact ? 0.25 : 0.75,
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        flexWrap: 'wrap',
        gap: compact ? 0.5 : 1,
      }}
    >
      {content}
    </Box>
  );
}
