/**
 * Earlier turns of a thread as Gemini contents. In exam mode only earlier
 * exam-mode model answers (and the question each answered) are kept: exam mode
 * may run on the free key, and a general turn can carry the student's classes,
 * scores or name (D2).
 */
import type { GeminiContent } from '@neram/ai';
import { istNow } from '@/lib/upcoming-classes';
import type { MessageRow } from './store';
import type { Mode } from './types';

export function historyFor(mode: Mode, rows: MessageRow[], maxPairs = 6): GeminiContent[] {
  const pairs: Array<[MessageRow, MessageRow]> = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const u = rows[i];
    const a = rows[i + 1];
    if (u.role !== 'user' || a.role !== 'assistant') continue;
    i++;
    if (u.text === '(photo)') continue;
    if (mode === 'exam' && !(a.mode === 'exam' && a.llm)) continue;
    pairs.push([u, a]);
  }
  return pairs.slice(-maxPairs).flatMap(([u, a]) => [
    { role: 'user' as const, parts: [{ text: u.text }] },
    { role: 'model' as const, parts: [{ text: a.text }] },
  ]);
}

/** Midnight IST of `now`'s IST day, as an ISO instant: where the daily model cap resets. */
export function istDayStartIso(now: Date): string {
  const { today } = istNow(now);
  return new Date(`${today}T00:00:00+05:30`).toISOString();
}
