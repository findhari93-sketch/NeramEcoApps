import { describe, it, expect } from 'vitest';
import { createFakeDb } from './testing/fake-supabase';
import { ensureCatchupJourney } from './catchup-journey';

/**
 * A scheduled exam is a timetable row, and the late-joiner backfill walks
 * timetable rows.
 *
 * Production ran without this filter and wrote twelve obligations, four
 * students against each of three test windows on 2026-08-18. None of them could
 * ever be cleared: an exam has no Teams meeting, no recording and no recap, so
 * the student's catch-up card offered nothing to watch and the teacher's card
 * read "4 students are waiting on this" beside "Nothing to watch yet" forever.
 *
 * These tests are about the WRITE, not the read. Hiding exam rows on the way
 * out would have left the rows in the table, still counted, still blocking.
 */
function seed() {
  return createFakeDb(
    {
      nexus_enrollments: [
        {
          user_id: 'stu-1',
          classroom_id: 'room-1',
          batch_id: null,
          role: 'student',
          is_active: true,
          enrolled_at: '2026-09-01T00:00:00Z',
        },
      ],
      nexus_classrooms: [{ id: 'room-1', catchup_weekly_quota: 2 }],
      nexus_catchup_journeys: [],
      nexus_scheduled_classes: [
        {
          id: 'lecture-1',
          classroom_id: 'room-1',
          kind: 'lecture',
          batch_id: null,
          publish_state: 'published',
          status: 'scheduled',
          scheduled_date: '2026-08-21',
        },
        {
          id: 'exam-1',
          classroom_id: 'room-1',
          kind: 'exam',
          batch_id: null,
          publish_state: 'published',
          status: 'scheduled',
          scheduled_date: '2026-08-18',
        },
      ],
      nexus_class_absences: [],
    },
    { nexus_class_absences: { caught_up_at: null, excused_at: null } },
  );
}

describe('the late-joiner backfill and scheduled exams', () => {
  it('gives a joining student the lecture and not the exam', async () => {
    const db = seed();

    const out = await ensureCatchupJourney('stu-1', 'room-1', {}, db.client);

    expect(out.candidatesConsidered).toBe(1);
    const written = db.tables.nexus_class_absences.map((r: any) => r.scheduled_class_id);
    expect(written).toEqual(['lecture-1']);
  });

  it('counts only lectures in the dry run a coordinator is shown', async () => {
    const db = seed();

    const out = await ensureCatchupJourney('stu-1', 'room-1', { dryRun: true }, db.client);

    expect(out.itemsInserted).toBe(1);
    expect(db.tables.nexus_class_absences).toHaveLength(0);
  });

  it('writes nothing at all when the term held only exams', async () => {
    const db = seed();
    db.tables.nexus_scheduled_classes = db.tables.nexus_scheduled_classes.filter(
      (c: any) => c.kind === 'exam',
    );

    const out = await ensureCatchupJourney('stu-1', 'room-1', {}, db.client);

    expect(out.candidatesConsidered).toBe(0);
    expect(db.tables.nexus_class_absences).toHaveLength(0);
  });
});
