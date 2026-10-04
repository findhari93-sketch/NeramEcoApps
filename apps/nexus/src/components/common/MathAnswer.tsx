'use client';

import { useMemo } from 'react';
import { Box } from '@neram/ui';
import { parseMathAnswer } from '@neram/database';
import { renderMath } from './MathText';

interface MathAnswerProps {
  /** A stored numerical answer: `42`, `3/4`, `2√(3)`, `\frac{\pi}{2}` or `2:3`. */
  value: string | null | undefined;
}

/**
 * A numerical answer shown back to someone: the correct answer after a reveal,
 * or what a student typed in a review. A formula is typeset, so `2√(3)` reads
 * as a root rather than as the characters a keypad produced. Anything else,
 * a plain number or a ratio, is shown exactly as stored.
 */
export default function MathAnswer({ value }: MathAnswerProps) {
  const text = (value ?? '').trim();
  const html = useMemo(() => {
    const parsed = parseMathAnswer(text);
    return parsed && !parsed.isPlainNumber ? renderMath(parsed.latex, false) : null;
  }, [text]);

  if (!html) return <>{text}</>;
  return <Box component="span" sx={{ display: 'inline-block' }} dangerouslySetInnerHTML={{ __html: html }} />;
}
