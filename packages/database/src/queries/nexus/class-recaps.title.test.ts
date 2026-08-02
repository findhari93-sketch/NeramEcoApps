import { describe, it, expect, beforeEach } from 'vitest';
import {
  getRecapById,
  getRecapForStudent,
  listRecapsForClassroom,
  listPublishedRecapsForStudent,
  listRecapsNeedingReview,
} from './class-recaps';
import { createFakeDb, type FakeDb } from './testing/fake-supabase';

/**
 * Regression tests for the stale recap title.
 *
 * `nexus_class_recaps.title` is copied from the class row once, when the recap
 * is created, and for a class nobody has wrapped up yet that copy is the Teams
 * meeting subject ("Class by Ar Hari Babu"). Renaming the class afterwards
 * writes nexus_scheduled_classes and nothing else, so on 2026-08-02 a published
 * recap of a class renamed to "Recreating India Gate in Two-Point Perspective"
 * was still headed "Class by Ar Hari Babu" for its teacher and its students,
 * while the class test built from the same recap had the new name.
 *
 * The property under test is that every recap read reports the class's CURRENT
 * title, and that an ad-hoc recap, which has no class to ask, keeps its own.
 */

const CLASS = 'class-1';
const OLD_TITLE = 'Class by Ar Hari Babu';
const NEW_TITLE = 'Recreating India Gate in Two-Point Perspective';

function seed() {
  return createFakeDb({
    nexus_scheduled_classes: [{ id: CLASS, classroom_id: 'room-1', title: NEW_TITLE }],
    nexus_class_recaps: [
      {
        id: 'recap-1',
        scheduled_class_id: CLASS,
        classroom_id: 'room-1',
        status: 'published',
        readiness: 'held',
        // The snapshot taken at creation, before the teacher renamed the class.
        title: OLD_TITLE,
      },
      {
        id: 'recap-manual',
        scheduled_class_id: null,
        classroom_id: 'room-1',
        status: 'published',
        readiness: 'held',
        title: 'Recording a teacher pasted in by hand',
      },
    ],
    nexus_class_recap_sections: [],
    nexus_class_recap_attempts: [],
    nexus_class_recap_progress: [],
    nexus_enrollments: [
      { id: 'en-1', user_id: 'student-1', classroom_id: 'room-1', role: 'student', is_active: true },
    ],
  });
}

describe('recap titles follow the class', () => {
  let db: FakeDb;
  beforeEach(() => {
    db = seed();
  });

  it('reports the renamed class title, not the snapshot, for the teacher editor', async () => {
    const recap = await getRecapById('recap-1', db.client);
    expect(recap?.title).toBe(NEW_TITLE);
  });

  it('reports the renamed class title to a student', async () => {
    const recap = await getRecapForStudent('recap-1', 'student-1', db.client);
    expect(recap?.title).toBe(NEW_TITLE);
  });

  it('reports the renamed class title in the classroom list', async () => {
    const rows = await listRecapsForClassroom('room-1', db.client);
    expect(rows.find((r) => r.id === 'recap-1')?.title).toBe(NEW_TITLE);
  });

  it("reports the renamed class title in a student's recap list", async () => {
    const rows = await listPublishedRecapsForStudent('student-1', db.client);
    expect(rows.find((r) => r.id === 'recap-1')?.title).toBe(NEW_TITLE);
  });

  it('reports the renamed class title in the review queue', async () => {
    const rows = await listRecapsNeedingReview(['room-1'], db.client);
    expect(rows.find((r) => r.id === 'recap-1')?.title).toBe(NEW_TITLE);
  });

  it('keeps its own title for an ad-hoc recap, which has no class to ask', async () => {
    const recap = await getRecapById('recap-manual', db.client);
    expect(recap?.title).toBe('Recording a teacher pasted in by hand');
  });

  it('keeps the snapshot when the class row has no title of its own', async () => {
    db.tables.nexus_scheduled_classes[0].title = null;
    const recap = await getRecapById('recap-1', db.client);
    expect(recap?.title).toBe(OLD_TITLE);
  });
});
