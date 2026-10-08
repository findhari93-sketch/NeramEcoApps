/**
 * Server side: a typed formula's value, as the pad stores it. Kept apart from
 * formula-answer.ts so the parser never reaches the student pad's bundle.
 */

import { parseMathAnswer } from '@neram/database';
import { padDecimal } from './formula-answer';

/** "2√3" gives "3.46410161514", "3/4" gives "0.75". Null when it is not a number or formula. */
export function formulaValue(raw: string | null | undefined): string | null {
  const parsed = parseMathAnswer(raw);
  return parsed ? padDecimal(parsed.value) : null;
}
