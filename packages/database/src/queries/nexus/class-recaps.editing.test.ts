import { describe, it, expect, beforeEach } from 'vitest';
import {
  replaceRecapSections,
  updateRecapSections,
  saveRecapSections,
  type GeneratedRecapSection,
} from './class-recaps';
import { createFakeDb } from './testing/fake-supabase';

/**
 * Regression tests for the checkpoint-editing data loss.
 *
 * nexus_class_recap_attempts.section_id is ON DELETE CASCADE, and
 * replaceRecapSections deleted a recap's sections before re-inserting them. So a
 * teacher pressing Save on a published recap destroyed every student's passed
 * checkpoints and markRecapCompletedIfAllPassed then re-locked them. Silently.
 *
 * These assert the property that actually matters, which is that the attempt
 * rows are still there afterwards, rather than the proxy of "delete was not
 * called". That is why there is an in-memory table fake here instead of a
 * chainable call-spy: a spy cannot tell you whether the data survived.
 */

// ── Fixture: a published recap, 2 checkpoints, a student who passed both ─────

const RECAP = 'recap-1';

function seed() {
  return createFakeDb({
    nexus_class_recaps: [{ id: RECAP, status: 'published', title: 'Class 1' }],
    nexus_class_recap_sections: [
      {
        id: 'sec-a',
        recap_id: RECAP,
        title: 'Intro',
        start_timestamp_seconds: 0,
        end_timestamp_seconds: 300,
        sort_order: 0,
        archived_at: null,
      },
      {
        id: 'sec-b',
        recap_id: RECAP,
        title: 'Site planning',
        start_timestamp_seconds: 300,
        end_timestamp_seconds: 600,
        sort_order: 1,
        archived_at: null,
      },
    ],
    nexus_class_recap_questions: [
      { id: 'q1', section_id: 'sec-a', question_text: 'Old A', sort_order: 0, is_active: true },
      { id: 'q2', section_id: 'sec-b', question_text: 'Old B', sort_order: 0, is_active: true },
    ],
    // The thing we must not lose.
    nexus_class_recap_attempts: [
      { id: 'att-1', student_id: 'stu-1', section_id: 'sec-a', passed: true, attempt_number: 1 },
      { id: 'att-2', student_id: 'stu-1', section_id: 'sec-b', passed: true, attempt_number: 1 },
    ],
    nexus_test_placements: [],
    nexus_test_questions: [],
    nexus_tests: [],
    nexus_qb_questions: [],
  });
}

function editedSections(): GeneratedRecapSection[] {
  return [
    {
      id: 'sec-a',
      title: 'Intro, retitled',
      start_timestamp_seconds: 0,
      end_timestamp_seconds: 320,
      questions: [
        {
          question_text: 'Brand new question',
          option_a: 'a',
          option_b: 'b',
          option_c: 'c',
          option_d: 'd',
          correct_option: 'b',
        },
      ],
    },
    {
      id: 'sec-b',
      title: 'Site planning',
      start_timestamp_seconds: 320,
      end_timestamp_seconds: 600,
      questions: [
        {
          question_text: 'Also new',
          option_a: 'a',
          option_b: 'b',
          option_c: 'c',
          option_d: 'd',
          correct_option: 'a',
        },
      ],
    },
  ];
}

let db: ReturnType<typeof seed>;
beforeEach(() => {
  db = seed();
});

describe('replaceRecapSections refuses to destroy work', () => {
  it('throws rather than deleting sections students have attempted', async () => {
    await expect(replaceRecapSections(RECAP, editedSections(), db.client)).rejects.toThrow(
      'RECAP_HAS_ATTEMPTS',
    );
    expect(db.tables.nexus_class_recap_sections).toHaveLength(2);
    expect(db.tables.nexus_class_recap_attempts).toHaveLength(2);
  });

  it('still works on a fresh recap, which is its only remaining job', async () => {
    db.tables.nexus_class_recap_attempts = [];
    await replaceRecapSections(RECAP, editedSections(), db.client);
    expect(db.tables.nexus_class_recap_sections.length).toBeGreaterThan(0);
  });
});

describe('updateRecapSections keeps every pass alive', () => {
  it('preserves attempts across a full edit', async () => {
    await updateRecapSections(RECAP, editedSections(), db.client);

    const attempts = db.tables.nexus_class_recap_attempts;
    expect(attempts).toHaveLength(2);
    expect(attempts.map((a: any) => a.section_id).sort()).toEqual(['sec-a', 'sec-b']);
    expect(attempts.every((a: any) => a.passed)).toBe(true);
  });

  it('updates the existing section rows in place rather than recreating them', async () => {
    await updateRecapSections(RECAP, editedSections(), db.client);

    const live = db.tables.nexus_class_recap_sections.filter((s: any) => s.archived_at == null);
    expect(live.map((s: any) => s.id).sort()).toEqual(['sec-a', 'sec-b']);
    expect(live.find((s: any) => s.id === 'sec-a').title).toBe('Intro, retitled');
    expect(live.find((s: any) => s.id === 'sec-a').end_timestamp_seconds).toBe(320);
  });

  it('deactivates old questions instead of deleting them, and adds the new ones', async () => {
    await updateRecapSections(RECAP, editedSections(), db.client);

    const qs = db.tables.nexus_class_recap_questions;
    expect(qs.find((q: any) => q.id === 'q1').is_active).toBe(false);
    const active = qs.filter((q: any) => q.is_active !== false);
    expect(active.map((q: any) => q.question_text).sort()).toEqual([
      'Also new',
      'Brand new question',
    ]);
  });

  it('archives a removed checkpoint rather than deleting it, so its attempts live on', async () => {
    await updateRecapSections(RECAP, [editedSections()[0]], db.client);

    const secB = db.tables.nexus_class_recap_sections.find((s: any) => s.id === 'sec-b');
    expect(secB).toBeDefined();
    expect(secB.archived_at).toBeTruthy();
    expect(db.tables.nexus_class_recap_attempts).toHaveLength(2);
  });

  it('inserts a checkpoint that arrives without an id', async () => {
    const withNew: GeneratedRecapSection[] = [
      ...editedSections(),
      {
        title: 'Newly added',
        start_timestamp_seconds: 600,
        end_timestamp_seconds: 900,
        questions: [],
      },
    ];
    await updateRecapSections(RECAP, withNew, db.client);

    const live = db.tables.nexus_class_recap_sections.filter((s: any) => s.archived_at == null);
    expect(live).toHaveLength(3);
    expect(live.some((s: any) => s.title === 'Newly added')).toBe(true);
  });

  it('renumbers sort_order by timestamp so a moved boundary reorders correctly', async () => {
    const reordered: GeneratedRecapSection[] = [
      { ...editedSections()[1], start_timestamp_seconds: 0, end_timestamp_seconds: 100 },
      { ...editedSections()[0], start_timestamp_seconds: 100, end_timestamp_seconds: 400 },
    ];
    await updateRecapSections(RECAP, reordered, db.client);

    const live = db.tables.nexus_class_recap_sections.filter((s: any) => s.archived_at == null);
    expect(live.find((s: any) => s.id === 'sec-b').sort_order).toBe(0);
    expect(live.find((s: any) => s.id === 'sec-a').sort_order).toBe(1);
  });

  it('revives a checkpoint that is sent back after being archived', async () => {
    await updateRecapSections(RECAP, [editedSections()[0]], db.client);
    expect(
      db.tables.nexus_class_recap_sections.find((s: any) => s.id === 'sec-b').archived_at,
    ).toBeTruthy();

    await updateRecapSections(RECAP, editedSections(), db.client);
    expect(
      db.tables.nexus_class_recap_sections.find((s: any) => s.id === 'sec-b').archived_at,
    ).toBeNull();
    expect(db.tables.nexus_class_recap_attempts).toHaveLength(2);
  });
});

describe('saveRecapSections picks the safe path on its own', () => {
  it('takes the diffing path for a published recap', async () => {
    await saveRecapSections(RECAP, editedSections(), db.client);
    expect(db.tables.nexus_class_recap_attempts).toHaveLength(2);
    expect(
      db.tables.nexus_class_recap_sections.filter((s: any) => s.archived_at == null),
    ).toHaveLength(2);
  });

  it('takes the diffing path for a draft that students have already attempted', async () => {
    db.tables.nexus_class_recaps[0].status = 'draft';
    await saveRecapSections(RECAP, editedSections(), db.client);
    expect(db.tables.nexus_class_recap_attempts).toHaveLength(2);
  });

  it('takes the cheap rewrite only when the recap is a draft with no attempts', async () => {
    db.tables.nexus_class_recaps[0].status = 'draft';
    db.tables.nexus_class_recap_attempts = [];
    await saveRecapSections(RECAP, editedSections(), db.client);

    // The rewrite path mints fresh section rows, so the seeded ids are gone.
    const ids = db.tables.nexus_class_recap_sections.map((s: any) => s.id);
    expect(ids).not.toContain('sec-a');
  });
});
