import { describe, it, expect, beforeEach, vi } from 'vitest';
import { healRecapCompletions, recapsWithAllCheckpointsPassed } from './class-recaps';
import { isCatchupTestAvailable, isWatched, loadClassFacts } from './catchup-journey';
import { createFakeDb } from './testing/fake-supabase';

/**
 * NXS-0127. A student passed both checkpoints, but the quiz POST died after
 * saving the passing attempt and before writing the recap's completion. The
 * attempts said "all passed", the progress row said "in_progress", and every
 * gate read the row, so the final check stayed locked with no way out.
 *
 * These pin the read-time repair: the gates ask the attempts, and write the row
 * back, whenever the row has not caught up.
 */

const STUDENT = 'stu-1';
const CLASS = 'class-1';
const RECAP = 'recap-1';

function seed() {
  return createFakeDb({
    nexus_class_recaps: [{ id: RECAP, scheduled_class_id: CLASS, status: 'published' }],
    nexus_class_recap_sections: [
      { id: 'sec-a', recap_id: RECAP, sort_order: 0, archived_at: null },
      { id: 'sec-b', recap_id: RECAP, sort_order: 1, archived_at: null },
    ],
    nexus_class_recap_attempts: [
      { id: 'att-1', student_id: STUDENT, section_id: 'sec-a', passed: true },
      { id: 'att-2', student_id: STUDENT, section_id: 'sec-b', passed: false },
      { id: 'att-3', student_id: STUDENT, section_id: 'sec-b', passed: true },
    ],
    // Exactly the row prod held: the last pass never reached it.
    nexus_class_recap_progress: [
      { id: 'prog-1', student_id: STUDENT, recap_id: RECAP, status: 'in_progress', last_section_id: 'sec-a' },
    ],
    nexus_class_assignments: [],
    nexus_test_placements: [
      {
        id: 'pl-1',
        test_id: 'test-1',
        context_id: CLASS,
        context_type: 'catchup_class',
        passing_pct: 85,
        gating: {},
        is_active: true,
      },
    ],
    nexus_class_absences: [{ id: 'abs-1', student_id: STUDENT, scheduled_class_id: CLASS }],
    nexus_test_attempts: [],
    nexus_assignment_submissions: [],
    drawing_submissions: [],
  });
}

const progressRow = (db: ReturnType<typeof seed>) =>
  db.tables.nexus_class_recap_progress.find((p: any) => p.recap_id === RECAP);

let db: ReturnType<typeof seed>;
beforeEach(() => {
  db = seed();
});

describe('recapsWithAllCheckpointsPassed', () => {
  const sections = [
    { id: 'a', recap_id: 'r1' },
    { id: 'b', recap_id: 'r1' },
    { id: 'c', recap_id: 'r2' },
  ];

  it('is complete only when every section of the recap is passed', () => {
    expect(recapsWithAllCheckpointsPassed(sections, new Set(['a', 'b', 'c']))).toEqual(
      new Set(['r1', 'r2']),
    );
    expect(recapsWithAllCheckpointsPassed(sections, new Set(['a', 'c']))).toEqual(new Set(['r2']));
  });

  it('never completes a recap that has no sections', () => {
    expect(recapsWithAllCheckpointsPassed([], new Set(['a']))).toEqual(new Set());
  });
});

describe('healRecapCompletions', () => {
  it('writes completion back when every checkpoint is passed', async () => {
    const healed = await healRecapCompletions(STUDENT, [RECAP], db.client);

    expect(healed).toEqual(new Set([RECAP]));
    expect(progressRow(db).status).toBe('completed');
    expect(progressRow(db).completed_at).toBeTruthy();
    expect(db.tables.nexus_class_recap_progress).toHaveLength(1);
  });

  it('leaves the row alone while a checkpoint is still unpassed', async () => {
    db.tables.nexus_class_recap_attempts = db.tables.nexus_class_recap_attempts.filter(
      (a: any) => a.id !== 'att-3',
    );
    const healed = await healRecapCompletions(STUDENT, [RECAP], db.client);

    expect(healed.size).toBe(0);
    expect(progressRow(db).status).toBe('in_progress');
  });

  it('ignores an archived checkpoint, the same as markRecapCompletedIfAllPassed', async () => {
    db.tables.nexus_class_recap_sections.push({
      id: 'sec-old',
      recap_id: RECAP,
      sort_order: 2,
      archived_at: '2026-09-01T00:00:00Z',
    });
    const healed = await healRecapCompletions(STUDENT, [RECAP], db.client);
    expect(healed).toEqual(new Set([RECAP]));
  });

  it('does not count another student’s passes', async () => {
    const healed = await healRecapCompletions('stu-2', [RECAP], db.client);
    expect(healed.size).toBe(0);
  });

  it('still answers when the write back fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const base = db.client;
    const failingWrites = {
      from: (t: string) => {
        const b = base.from(t);
        if (t !== 'nexus_class_recap_progress') return b;
        return { ...b, upsert: () => Promise.resolve({ data: null, error: { message: 'boom' } }) };
      },
    };

    const healed = await healRecapCompletions(STUDENT, [RECAP], failingWrites as any);

    expect(healed).toEqual(new Set([RECAP]));
    expect(progressRow(db).status).toBe('in_progress');
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('loadClassFacts: the NXS-0127 screen', () => {
  it('opens the final check and ticks the recording step despite the stale row', async () => {
    const facts = await loadClassFacts(db.client, STUDENT, [CLASS]);
    const item = { scheduled_class_id: CLASS };

    expect(isCatchupTestAvailable(item, facts)).toBe(true);
    expect(isWatched(item, facts)).toBe(true);
    expect(progressRow(db).status).toBe('completed');
  });

  it('keeps the final check locked while a checkpoint is outstanding', async () => {
    db.tables.nexus_class_recap_attempts = db.tables.nexus_class_recap_attempts.filter(
      (a: any) => a.id !== 'att-3',
    );
    const facts = await loadClassFacts(db.client, STUDENT, [CLASS]);

    expect(isCatchupTestAvailable({ scheduled_class_id: CLASS }, facts)).toBe(false);
  });
});
