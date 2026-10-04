// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { historyFor, istDayStartIso } from './history';
import type { MessageRow } from './store';

let n = 0;
const msg = (role: 'user' | 'assistant', text: string, extra: Partial<MessageRow> = {}): MessageRow => ({
  id: `m${++n}`, thread_id: 't1', role, text, mode: null, llm: false, envelope: null, external_id: null, created_at: `2026-10-03T04:${String(n).padStart(2, '0')}:00Z`, ...extra,
});

const rows = [
  msg('user', 'when is my next class'), msg('assistant', 'Perspective, tomorrow 6 pm.', { mode: 'general' }),
  msg('user', 'which chapters matter for NATA'), msg('assistant', 'Perspective and 3D are asked every year.', { mode: 'exam', llm: true }),
  msg('user', 'what is my attendance'), msg('assistant', 'You attended 9 of 10.', { mode: 'general', llm: true }),
];

describe('historyFor', () => {
  it('general mode keeps every user and assistant pair, oldest first, as user and model turns', () => {
    const h = historyFor('general', rows);
    expect(h.map((c) => c.role)).toEqual(['user', 'model', 'user', 'model', 'user', 'model']);
    expect(h[1].parts[0].text).toBe('Perspective, tomorrow 6 pm.');
  });

  it('exam mode keeps only earlier exam answers from the model, so no personal turn reaches the free key', () => {
    const h = historyFor('exam', rows);
    expect(h).toEqual([
      { role: 'user', parts: [{ text: 'which chapters matter for NATA' }] },
      { role: 'model', parts: [{ text: 'Perspective and 3D are asked every year.' }] },
    ]);
  });

  it('keeps the newest pairs only, skips photos and unanswered messages', () => {
    const many = [msg('user', '(photo)'), msg('assistant', 'Add a caption?'), msg('user', 'orphan'),
      ...Array.from({ length: 8 }, (_, i) => [msg('user', `q${i}`), msg('assistant', `a${i}`)]).flat()];
    const h = historyFor('general', many, 6);
    expect(h).toHaveLength(12);
    expect(h[0].parts[0].text).toBe('q2');
    expect(JSON.stringify(h)).not.toMatch(/photo|orphan/);
  });
});

describe('istDayStartIso', () => {
  it('is midnight in India as a UTC instant', () => {
    expect(istDayStartIso(new Date('2026-10-03T04:30:00Z'))).toBe('2026-10-02T18:30:00.000Z');
    expect(istDayStartIso(new Date('2026-10-02T19:00:00Z'))).toBe('2026-10-02T18:30:00.000Z'); // 00:30 IST on the 3rd
  });
});
