import { describe, it, expect } from 'vitest';
import {
  PRACTICE_SOURCE_TYPES,
  countSketches,
  getPracticeDrawing,
  listSketchbookMonth,
  listUnflipped,
  monthRangeIst,
  savePracticeEvaluation,
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
  it('lists the flip inbox from unevaluated practice only', async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    await listUnflipped('t1', ['s1'], 20, client);
    expect(named(calls, 'in')).toContainEqual(['source_type', [...PRACTICE_SOURCE_TYPES]]);
    expect(named(calls, 'is')).toContainEqual(['assignment_id', null]);
    expect(named(calls, 'is')).toContainEqual(['evaluated_at', null]);
  });

  it('falls back to the old rule where the grade columns do not exist yet', async () => {
    const { client, calls } = tableClient({
      drawing_submissions: [{ data: null, error: { code: '42703', message: 'column drawing_submissions.evaluated_at does not exist' } }, { data: [] }],
    });
    await listUnflipped('t1', ['s1'], 20, client);
    const is = calls.filter(([t, p]) => t === 'drawing_submissions' && p === 'is').map(([, , a]) => a);
    expect(is).toContainEqual(['reaction', null]);
    expect(is).toContainEqual(['reviewed_at', null]);
  });

  it('finds a practice drawing and never an assignment drawing', async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    await getPracticeDrawing('d1', client);
    expect(named(calls, 'in')).toContainEqual(['source_type', [...PRACTICE_SOURCE_TYPES]]);
    expect(named(calls, 'is')).toContainEqual(['assignment_id', null]);
  });

  it('saves a grade and a reaction together and marks the drawing evaluated', async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    const out = await savePracticeEvaluation({ id: 'd1', reaction: null, drawing_grade: null, evaluated_at: null }, { reaction: 'wow', grade: 'mid' }, 't1', client);
    const [patch] = named(calls, 'update')[0] as [Record<string, unknown>];
    expect(patch).toMatchObject({ reaction: 'wow', drawing_grade: 'mid', graded_by: 't1' });
    expect(typeof patch.evaluated_at).toBe('string');
    expect(out).toMatchObject({ reaction: 'wow', drawing_grade: 'mid' });
    expect(named(calls, 'is')).toContainEqual(['assignment_id', null]);
  });

  it('a grade alone leaves the reaction untouched and the drawing unevaluated', async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    const out = await savePracticeEvaluation({ id: 'd1', reaction: null, drawing_grade: null, evaluated_at: null }, { grade: 'top' }, 't1', client);
    const [patch] = named(calls, 'update')[0] as [Record<string, unknown>];
    expect(patch).not.toHaveProperty('reaction');
    expect(patch.evaluated_at).toBeNull();
    expect(out.evaluated_at).toBeNull();
  });

  it('reacts on practice drawings only', async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    await setSketchbookReaction('d1', 'fire', client);
    expect(named(calls, 'in')).toContainEqual(['source_type', [...PRACTICE_SOURCE_TYPES]]);
    expect(named(calls, 'is')).toContainEqual(['assignment_id', null]);
  });
});

/**
 * A client whose every table answers from its own queue, one result per query in
 * order, so a function that asks several tables can be driven row by row.
 */
function tableClient(results: Record<string, Array<{ data: unknown; error?: unknown }>>) {
  const calls: Array<[string, string, unknown[]]> = [];
  const client: any = {
    from: (table: string) => {
      const answer = (results[table] || []).shift() ?? { data: [], error: null };
      const chain: any = new Proxy({}, {
        get: (_t, prop: string) => {
          if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ error: null, ...answer });
          return (...args: unknown[]) => { calls.push([table, prop, args]); return chain; };
        },
      });
      return chain;
    },
  };
  return { client, calls };
}

// Top half inked vs vertical stripes: far apart at every quarter turn.
const FP_A = 'ff'.repeat(16) + '00'.repeat(16);
const FP_B = 'a'.repeat(64);
const sketch = (id: string, over: Record<string, unknown> = {}) => ({
  id, student_id: 's1', submitted_at: '2026-09-15T14:44:43Z', source_type: 'sketchbook', reaction: null,
  reviewed_at: null, assignment_id: null, image_quality: null, student: { id: 's1', name: 'K', avatar_url: null, ms_oid: null },
  ...over,
});

describe('listUnflipped: evaluated anywhere counts as evaluated', () => {
  it('leaves out an evaluated sketch (graded and reacted), for every teacher', async () => {
    const { client, calls } = tableClient({ drawing_submissions: [{ data: [] }] });
    await listUnflipped('t1', ['s1'], 20, client);
    expect(calls.filter(([t, p]) => t === 'drawing_submissions' && p === 'is').map(([, , a]) => a)).toContainEqual(['evaluated_at', null]);
  });

  it('a comment or a feature on its own no longer takes a sketch out of the list', async () => {
    const { client, calls } = tableClient({
      drawing_submissions: [{ data: [sketch('a'), sketch('b')] }],
      nexus_sketchbook_flips: [{ data: [] }],
    });
    const { rows } = await listUnflipped('t1', ['s1'], 20, client);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(calls.some(([t]) => t === 'drawing_submission_comments' || t === 'nexus_sketchbook_features')).toBe(false);
  });

  it('a half done sketch comes back even to the teacher who flipped it', async () => {
    const { client } = tableClient({
      drawing_submissions: [{ data: [sketch('graded', { drawing_grade: 'mid' }), sketch('reacted', { reaction: 'wow' }), sketch('passed')] }],
      nexus_sketchbook_flips: [{ data: [{ submission_id: 'graded' }, { submission_id: 'reacted' }, { submission_id: 'passed' }] }],
    });
    const { rows } = await listUnflipped('t1', ['s1'], 20, client);
    expect(rows.map((r) => r.id)).toEqual(['graded', 'reacted']);
  });

  it('still hides what this teacher skipped, and only for this teacher', async () => {
    const { client, calls } = tableClient({
      drawing_submissions: [{ data: [sketch('a'), sketch('b')] }],
      nexus_sketchbook_flips: [{ data: [{ submission_id: 'a' }] }],
    });
    const { rows } = await listUnflipped('t1', ['s1'], 20, client);
    expect(rows.map((r) => r.id)).toEqual(['b']);
    expect(calls).toContainEqual(['nexus_sketchbook_flips', 'eq', ['teacher_id', 't1']]);
  });

  it('hides a re-upload of a sheet already sent to an assignment (same fingerprint, same student)', async () => {
    const dup = sketch('dup', { image_quality: { fp: FP_A } });
    const other = sketch('other', { image_quality: { fp: FP_B } });
    const { client } = tableClient({
      drawing_submissions: [
        { data: [dup, other] },
        { data: [dup, other, sketch('asg', { source_type: 'assignment', assignment_id: 'x1', submitted_at: '2026-09-15T14:45:56Z', image_quality: { fp: FP_A } })] },
      ],
    });
    const { rows } = await listUnflipped('t1', ['s1'], 20, client);
    expect(rows.map((r) => r.id)).toEqual(['other']);
  });

  it('hides a re-upload of a sketch another teacher already reacted to', async () => {
    const dup = sketch('dup', { image_quality: { fp: FP_A } });
    const { client } = tableClient({
      drawing_submissions: [
        { data: [dup] },
        { data: [dup, sketch('seen', { reaction: 'heart', image_quality: { fp: FP_A } })] },
      ],
    });
    const { rows } = await listUnflipped('t1', ['s1'], 20, client);
    expect(rows).toEqual([]);
  });

  it('never matches across students, or across days far apart', async () => {
    const dup = sketch('dup', { image_quality: { fp: FP_A } });
    const { client } = tableClient({
      drawing_submissions: [
        { data: [dup] },
        { data: [
          dup,
          sketch('otherKid', { student_id: 's2', source_type: 'assignment', assignment_id: 'x', image_quality: { fp: FP_A } }),
          sketch('lastMonth', { source_type: 'assignment', assignment_id: 'x', submitted_at: '2026-08-10T10:00:00Z', image_quality: { fp: FP_A } }),
        ] },
      ],
    });
    const { rows } = await listUnflipped('t1', ['s1', 's2'], 20, client);
    expect(rows.map((r) => r.id)).toEqual(['dup']);
  });

  it('keeps two unhandled copies of one sheet but tells the screen they are twins', async () => {
    const { client } = tableClient({
      drawing_submissions: [
        { data: [sketch('x', { image_quality: { fp: FP_A } }), sketch('y', { image_quality: { fp: FP_A } }), sketch('z', { image_quality: { fp: FP_B } })] },
      ],
    });
    const { rows } = await listUnflipped('t1', ['s1'], 20, client);
    expect(rows.map((r) => [r.id, r.twin_ids ?? []])).toEqual([['x', ['y']], ['y', ['x']], ['z', []]]);
  });

  it('skips the twin lookup entirely when no candidate has a fingerprint yet', async () => {
    const { client, calls } = tableClient({ drawing_submissions: [{ data: [sketch('a')] }] });
    await listUnflipped('t1', ['s1'], 20, client);
    expect(calls.filter(([t, p]) => t === 'drawing_submissions' && p === 'select')).toHaveLength(1);
  });
});

