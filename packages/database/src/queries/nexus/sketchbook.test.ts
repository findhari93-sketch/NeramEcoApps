import { describe, it, expect } from 'vitest';
import {
  PRACTICE_SOURCE_TYPES,
  countSketches,
  getPracticeDrawing,
  listSketchbookMonth,
  listUnflipped,
  monthRangeIst,
  setSketchbookReaction,
} from './sketchbook';

describe('monthRangeIst', () => {
  it('bounds a month in IST, not UTC', () => {
    expect(monthRangeIst('2026-09')).toEqual({
      from: '2026-09-01T00:00:00+05:30',
      to: '2026-10-01T00:00:00+05:30',
    });
  });
  it('rolls December into the next year', () => {
    expect(monthRangeIst('2026-12').to).toBe('2027-01-01T00:00:00+05:30');
  });
});

/** A client whose query builder records every call and resolves to `result`. */
function fakeClient(result: { data: unknown; error: unknown; count?: number }) {
  const calls: Array<[string, unknown[]]> = [];
  const chain: any = new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(result);
        return (...args: unknown[]) => {
          calls.push([prop, args]);
          return chain;
        };
      },
    },
  );
  const client: any = { from: (...args: unknown[]) => { calls.push(['from', args]); return chain; } };
  return { client, calls };
}

const named = (calls: Array<[string, unknown[]]>, name: string) => calls.filter(([n]) => n === name).map(([, a]) => a);

describe('sketchbook reads cover every drawing', () => {
  it('gives a student every drawing of the month except their test papers', async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    await listSketchbookMonth('s1', '2026-09', 'student', client);
    expect(named(calls, 'eq')).not.toContainEqual(['source_type', 'sketchbook']);
    expect(named(calls, 'neq')).toContainEqual(['source_type', 'exam']);
  });

  it('gives staff every drawing of the month, test papers included', async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    await listSketchbookMonth('s1', '2026-09', 'staff', client);
    expect(named(calls, 'neq')).toEqual([]);
    expect(named(calls, 'eq')).not.toContainEqual(['source_type', 'sketchbook']);
  });

  it('counts a student drawings without test papers', async () => {
    const { client, calls } = fakeClient({ data: null, error: null, count: 3 });
    expect(await countSketches('s1', 'student', client)).toBe(3);
    expect(named(calls, 'neq')).toContainEqual(['source_type', 'exam']);
  });
});

describe('practice-only reads and writes', () => {
  it('lists the flip inbox from unreviewed practice only', async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    await listUnflipped('t1', ['s1'], 20, client);
    expect(named(calls, 'in')).toContainEqual(['source_type', [...PRACTICE_SOURCE_TYPES]]);
    expect(named(calls, 'is')).toContainEqual(['assignment_id', null]);
    expect(named(calls, 'is')).toContainEqual(['reviewed_at', null]);
  });

  it('finds a practice drawing and never an assignment drawing', async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    await getPracticeDrawing('d1', client);
    expect(named(calls, 'in')).toContainEqual(['source_type', [...PRACTICE_SOURCE_TYPES]]);
    expect(named(calls, 'is')).toContainEqual(['assignment_id', null]);
  });

  it('reacts on practice drawings only', async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    await setSketchbookReaction('d1', 'fire', client);
    expect(named(calls, 'in')).toContainEqual(['source_type', [...PRACTICE_SOURCE_TYPES]]);
    expect(named(calls, 'is')).toContainEqual(['assignment_id', null]);
  });
});
