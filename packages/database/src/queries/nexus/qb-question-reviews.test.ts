import { describe, it, expect, vi, afterEach } from 'vitest';
import { createFakeDb } from './testing/fake-supabase';

vi.mock('../../client', () => ({
  getSupabaseAdminClient: () => {
    throw new Error('the test must pass its own client');
  },
}));

import { foldQuestionAiStatus, loadQuestionAiStatus, recordQuestionReviews } from './qb-question-reviews';

/**
 * The AI history a question carries on the results screen.
 *
 * The complaint behind it: once a question has been checked with an AI, a
 * teacher should not have to check it again, and should be able to see at a
 * glance which questions the AI actually changed.
 */

const review = (over: Record<string, unknown>) => ({
  question_id: 'q1',
  verdict: 'hard_but_fair',
  note: null,
  applied_fields: [],
  edit_id: null,
  correct_pct_at_check: null,
  created_at: '2026-09-11T06:00:00Z',
  ...over,
});

const edit = (over: Record<string, unknown>) => ({
  id: 'e1',
  question_id: 'q1',
  source: 'ai_review',
  before: { correct_answer: 'a' },
  after: { correct_answer: 'b' },
  created_at: '2026-09-11T06:00:00Z',
  ...over,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('foldQuestionAiStatus', () => {
  it('counts every check and keeps the newest verdict', () => {
    const status = foldQuestionAiStatus(
      [
        review({ verdict: 'fine', created_at: '2026-09-01T00:00:00Z' }),
        review({ verdict: 'ambiguous', note: 'Two options are defensible.', created_at: '2026-09-11T00:00:00Z' }),
        review({ verdict: 'hard_but_fair', created_at: '2026-09-05T00:00:00Z' }),
      ] as any,
      [],
    ).get('q1')!;

    expect(status.checks).toBe(3);
    expect(status.last_verdict).toBe('ambiguous');
    expect(status.last_note).toBe('Two options are defensible.');
    expect(status.last_checked_at).toBe('2026-09-11T00:00:00Z');
    expect(status.fixed).toBeNull();
  });

  it('reports what the newest fixing check changed, and the rate before it', () => {
    const status = foldQuestionAiStatus(
      [
        review({
          verdict: 'wrong_key',
          applied_fields: ['correct_answer'],
          edit_id: 'e1',
          correct_pct_at_check: 0,
        }),
      ] as any,
      [edit({})] as any,
    ).get('q1')!;

    expect(status.checks).toBe(1);
    expect(status.fixed).toEqual({
      at: '2026-09-11T06:00:00Z',
      fields: ['correct_answer'],
      before: { correct_answer: 'a' },
      after: { correct_answer: 'b' },
      verdict: 'wrong_key',
      pct_before: 0,
    });
  });

  it('calls a check that changed nothing checked, not fixed', () => {
    const status = foldQuestionAiStatus([review({ verdict: 'fine' })] as any, []).get('q1')!;
    expect(status.checks).toBe(1);
    expect(status.fixed).toBeNull();
  });

  it('counts an AI edit no check points at as a fix, with no invented verdict', () => {
    // An environment without the reviews table, or an edit made before the backfill.
    const status = foldQuestionAiStatus([], [edit({ after: { explanation_brief: 'New.' } })] as any).get('q1')!;

    expect(status.checks).toBe(1);
    expect(status.last_verdict).toBeNull();
    expect(status.fixed?.fields).toEqual(['explanation_brief']);
    expect(status.fixed?.verdict).toBeNull();
  });

  it('does not count an edit twice when a check already points at it', () => {
    const status = foldQuestionAiStatus(
      [review({ applied_fields: ['correct_answer'], edit_id: 'e1' })] as any,
      [edit({})] as any,
    ).get('q1')!;
    expect(status.checks).toBe(1);
  });

  it('leaves a question nobody checked out of the map', () => {
    expect(foldQuestionAiStatus([review({})] as any, []).has('q2')).toBe(false);
  });
});

describe('loadQuestionAiStatus', () => {
  it('reads checks and AI edits for the questions asked about only', async () => {
    const db = createFakeDb({
      nexus_qb_question_reviews: [
        review({ applied_fields: ['correct_answer'], edit_id: 'e1' }),
        review({ question_id: 'q-other' }),
      ],
      nexus_qb_question_edits: [
        edit({}),
        // A teacher's own edit is not an AI check.
        edit({ id: 'e-inline', source: 'inline', created_at: '2026-09-12T00:00:00Z' }),
      ],
    });

    const map = await loadQuestionAiStatus(['q1'], db.client);

    expect([...map.keys()]).toEqual(['q1']);
    expect(map.get('q1')!.checks).toBe(1);
    expect(map.get('q1')!.fixed?.after).toEqual({ correct_answer: 'b' });
  });

  it('falls back to the edits log when the reviews table is missing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = createFakeDb({ nexus_qb_question_edits: [edit({})] });
    const client = {
      from(table: string) {
        if (table !== 'nexus_qb_question_reviews') return db.client.from(table);
        const chain: any = {
          select: () => chain,
          in: () => chain,
          eq: () => chain,
          then: (resolve: any) =>
            resolve({ data: null, error: { code: 'PGRST205', message: 'Could not find the table' } }),
        };
        return chain;
      },
    };

    const map = await loadQuestionAiStatus(['q1'], client as any);

    expect(map.get('q1')!.checks).toBe(1);
    expect(map.get('q1')!.fixed?.fields).toEqual(['correct_answer']);
  });

  it('asks nothing at all for an empty list', async () => {
    const client = {
      from() {
        throw new Error('no query expected');
      },
    };
    expect((await loadQuestionAiStatus([], client as any)).size).toBe(0);
  });
});

describe('recordQuestionReviews', () => {
  it('writes one row per check in the table shape', async () => {
    const db = createFakeDb({ nexus_qb_question_reviews: [] });

    const n = await recordQuestionReviews(
      [
        {
          questionId: 'q1',
          testId: 't1',
          placementId: 'run-1',
          verdict: 'wrong_key',
          note: 'The book says Bronze Age.',
          appliedFields: ['correct_answer'],
          editId: 'e1',
          correctPctAtCheck: 0,
          answeredAtCheck: 9,
          reviewedBy: 'teacher-1',
        },
      ],
      db.client,
    );

    expect(n).toBe(1);
    expect(db.tables.nexus_qb_question_reviews[0]).toMatchObject({
      question_id: 'q1',
      test_id: 't1',
      placement_id: 'run-1',
      verdict: 'wrong_key',
      applied_fields: ['correct_answer'],
      edit_id: 'e1',
      correct_pct_at_check: 0,
      answered_at_check: 9,
      reviewed_by: 'teacher-1',
    });
  });

  it('logs and reports zero instead of throwing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = {
      from: () => ({ insert: async () => ({ error: { message: 'relation does not exist' } }) }),
    };

    const n = await recordQuestionReviews(
      [{ questionId: 'q1', verdict: 'fine', appliedFields: [] }],
      client as any,
    );

    expect(n).toBe(0);
    expect(spy).toHaveBeenCalled();
  });
});
