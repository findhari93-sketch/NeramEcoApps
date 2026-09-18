import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/drawing-hold', () => ({ heldSubmissionIds: async () => new Set(['held']) }));

import { countOwedDrawings } from './owed-drawings';

function fakeSupabase(rows: unknown[]) {
  const calls: Array<[string, unknown[]]> = [];
  const chain: any = new Proxy({}, {
    get: (_t, p: string) => (p === 'then' ? (res: (v: unknown) => void) => res({ data: rows, error: null }) : (...a: unknown[]) => { calls.push([p, a]); return chain; }),
  });
  return { client: { from: () => chain }, calls };
}

describe('countOwedDrawings', () => {
  it('counts waiting assignment and test drawings, never practice, never held reviews', async () => {
    const { client, calls } = fakeSupabase([
      { id: 'a', source_type: 'assignment', assignment_id: 'as1' },
      { id: 'held', source_type: 'assignment', assignment_id: 'as1' },
      { id: 't', source_type: 'exam', assignment_id: null },
      { id: 'q', source_type: 'question_bank', assignment_id: null },
    ]);
    expect(await countOwedDrawings(client, ['s1'])).toEqual({ assignment: 1, test: 1 });
    expect(calls).toContainEqual(['eq', ['status', 'submitted']]);
  });

  it('answers zero for a teacher with no students', async () => {
    const { client } = fakeSupabase([]);
    expect(await countOwedDrawings(client, [])).toEqual({ assignment: 0, test: 0 });
  });
});
