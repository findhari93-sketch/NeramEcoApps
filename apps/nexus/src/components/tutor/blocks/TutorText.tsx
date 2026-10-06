'use client';

import MathText from '@/components/common/MathText';

/** The tutor's words. **bold** is shown as written minus the stars; maths through KaTeX. */
export default function TutorText({ md }: { md: string }) {
  return (
    <MathText
      text={stripBold(md)}
      variant="body1"
      sx={{ ...MATH_SX, lineHeight: 1.6, '& .katex': { fontSize: '1.05em' } }}
    />
  );
}

/**
 * Long words wrap, and a display formula wider than a 375px phone scrolls
 * inside its own line instead of pushing the panel sideways.
 */
export const MATH_SX = {
  overflowWrap: 'anywhere',
  '& .katex-display': { overflowX: 'auto', overflowY: 'hidden', maxWidth: '100%', py: 0.5 },
} as const;

/**
 * The engine writes `**label**` for emphasis. MathText does not read markdown,
 * and stars around a concept name look like noise, so they are dropped. Stars
 * inside `$...$` are left alone (they are maths).
 */
export function stripBold(md: string): string {
  return md.replace(/\*\*([^*$]+)\*\*/g, '$1');
}
