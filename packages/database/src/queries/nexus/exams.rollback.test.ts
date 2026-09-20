import { describe, it, expect } from 'vitest';
import { createFakeDb } from './testing/fake-supabase';
import { createExamSeries } from './exams';

/**
 * Scheduling an exam writes three rows across three tables with no transaction
 * around them. Before this guard, a failure after the first write left the
 * timetable row behind forever: a `kind='exam'` class with no nexus_exams row,
 * which cancelExam cannot reach (it starts from the exam) and nothing else
 * cleans up.
 *
 * Two of them are in production, 2026-08-18, both from one teacher retrying a
 * schedule that had failed. They are the reason three "History of Architecture
 * Test" cards appeared for a single test.
 */
function seed() {
  return createFakeDb({
    nexus_scheduled_classes: [],
    nexus_exams: [],
    nexus_test_placements: [],
  });
}

const INPUT = {
  classroomIds: ['classroom-1'],
  testId: 'test-1',
  title: 'History of Architecture Test',
  opensAt: '2026-08-18T07:30:00.000Z',
  closesAt: '2026-08-18T15:30:00.000Z',
};

/** Make one table's insert come back as a PostgREST error, as a constraint would. */
function failInsertOn(client: any, table: string) {
  return {
    from(t: string) {
      const real = client.from(t);
      if (t !== table) return real;
      return {
        ...real,
        insert() {
          const failing: any = {
            select: () => failing,
            single: async () => ({ data: null, error: { message: 'insert or update violates foreign key' } }),
            then: (resolve: any) =>
              resolve({ data: null, error: { message: 'insert or update violates foreign key' } }),
          };
          return failing;
        },
      };
    },
  };
}

describe('createExamSeries leaves no orphan timetable row', () => {
  it('takes the class row back out when the exam row cannot be written', async () => {
    const db = seed();

    await expect(
      createExamSeries(INPUT, failInsertOn(db.client, 'nexus_exams') as any),
    ).rejects.toBeTruthy();

    expect(db.tables.nexus_scheduled_classes).toHaveLength(0);
  });

  it('takes the class row back out when the placement cannot be written', async () => {
    const db = seed();

    await expect(
      createExamSeries(INPUT, failInsertOn(db.client, 'nexus_test_placements') as any),
    ).rejects.toBeTruthy();

    // Only the class row is asserted. nexus_exams.scheduled_class_id is
    // `ON DELETE CASCADE` (20260827090300_nexus_exams.sql:54), so removing the
    // class takes the exam with it in Postgres. The fake does not model
    // cascades, and asserting one it cannot perform would be asserting the
    // fake rather than the code.
    expect(db.tables.nexus_scheduled_classes).toHaveLength(0);
  });

  it('reports the original failure, not whatever the cleanup did', async () => {
    const db = seed();

    await expect(
      createExamSeries(INPUT, failInsertOn(db.client, 'nexus_exams') as any),
    ).rejects.toMatchObject({ message: expect.stringContaining('foreign key') });
  });

  it('keeps the class row on the happy path', async () => {
    const db = seed();

    const out = await createExamSeries(INPUT, db.client);

    expect(out.exams).toHaveLength(1);
    expect(db.tables.nexus_scheduled_classes).toHaveLength(1);
    expect(db.tables.nexus_scheduled_classes[0].kind).toBe('exam');
  });
});
