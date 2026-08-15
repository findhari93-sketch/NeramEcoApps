import { describe, it, expect } from 'vitest';
import { createFakeDb } from './testing/fake-supabase';
import {
  createExamSeries,
  grantExamAttemptOverride,
  getExamAttemptOverride,
  getExamAttemptOverrides,
  EXAM_ATTEMPT_LIMIT,
} from './exams';

/**
 * mode/proctoring_enabled/violation_limit and the attempt-override table are
 * additive: every existing caller of createExamSeries omits them, and must get
 * back exactly what it got before this feature existed. Practice mode is the
 * one new path, and it must never leak into a caller that did not ask for it.
 */

function seed() {
  return createFakeDb({
    nexus_scheduled_classes: [],
    nexus_exams: [],
    nexus_test_placements: [],
    nexus_exam_attempt_overrides: [],
  });
}

const BASE_INPUT = {
  classroomIds: ['classroom-1'],
  testId: 'test-1',
  title: 'History of Architecture',
  opensAt: '2026-08-15T04:30:00.000Z',
  closesAt: '2026-08-15T05:30:00.000Z',
};

describe('createExamSeries: defaults preserve every existing caller', () => {
  it('defaults to a ranked exam, proctoring off, and the historical 1-attempt limit', async () => {
    const db = seed();
    const result = await createExamSeries(BASE_INPUT, db.client);

    expect(result.exams).toHaveLength(1);
    expect(result.exams[0].mode).toBe('ranked');
    expect(result.exams[0].proctoring_enabled).toBe(false);
    expect(result.exams[0].violation_limit).toBe(3);

    const placement = db.tables.nexus_test_placements[0];
    expect(placement.gating.attempt_limit).toBe(EXAM_ATTEMPT_LIMIT);
  });

  it('a ranked exam stays fixed at one attempt even if attemptLimit is passed', async () => {
    const db = seed();
    await createExamSeries({ ...BASE_INPUT, attemptLimit: 5 }, db.client);
    const placement = db.tables.nexus_test_placements[0];
    expect(placement.gating.attempt_limit).toBe(EXAM_ATTEMPT_LIMIT);
  });
});

describe('createExamSeries: practice mode', () => {
  it('writes mode/proctoring/attempt-limit through when set explicitly', async () => {
    const db = seed();
    const result = await createExamSeries(
      { ...BASE_INPUT, mode: 'practice', attemptLimit: 3, proctoringEnabled: true, violationLimit: 4 },
      db.client,
    );

    expect(result.exams[0].mode).toBe('practice');
    expect(result.exams[0].proctoring_enabled).toBe(true);
    expect(result.exams[0].violation_limit).toBe(4);

    const placement = db.tables.nexus_test_placements[0];
    expect(placement.gating.attempt_limit).toBe(3);
  });

  it('a practice exam with no attemptLimit given still falls back to the 1-attempt default', async () => {
    const db = seed();
    await createExamSeries({ ...BASE_INPUT, mode: 'practice' }, db.client);
    const placement = db.tables.nexus_test_placements[0];
    expect(placement.gating.attempt_limit).toBe(EXAM_ATTEMPT_LIMIT);
  });

  it('an explicit null attemptLimit means unlimited: no attempt_limit key at all, matching the wizard\'s own "unlimited" choice', async () => {
    const db = seed();
    await createExamSeries({ ...BASE_INPUT, mode: 'practice', attemptLimit: null }, db.client);
    const placement = db.tables.nexus_test_placements[0];
    expect('attempt_limit' in placement.gating).toBe(false);
  });
});

describe('exam attempt overrides', () => {
  it('has no override until one is granted', async () => {
    const db = seed();
    expect(await getExamAttemptOverride('exam-1', 'student-1', db.client)).toBeNull();
  });

  it('grants +1 and accumulates on a repeat grant for the same student', async () => {
    const db = seed();
    const first = await grantExamAttemptOverride('exam-1', 'student-1', 'teacher-1', db.client);
    expect(first.extra_attempts).toBe(1);

    const second = await grantExamAttemptOverride('exam-1', 'student-1', 'teacher-1', db.client);
    expect(second.extra_attempts).toBe(2);
  });

  it('batches every override on an exam for the roster, one query for every student', async () => {
    const db = seed();
    await grantExamAttemptOverride('exam-1', 'student-1', 'teacher-1', db.client);
    await grantExamAttemptOverride('exam-1', 'student-2', 'teacher-1', db.client);
    await grantExamAttemptOverride('exam-1', 'student-2', 'teacher-1', db.client);

    const overrides = await getExamAttemptOverrides('exam-1', db.client);
    expect(overrides.get('student-1')).toBe(1);
    expect(overrides.get('student-2')).toBe(2);
    expect(overrides.has('student-3')).toBe(false);
  });
});
