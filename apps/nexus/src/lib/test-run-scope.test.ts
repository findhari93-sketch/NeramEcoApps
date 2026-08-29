import { describe, expect, it } from 'vitest';
import {
  CLASSROOM_ANCHORED_CONTEXTS,
  CLASS_ANCHORED_CONTEXTS,
  buildRunLabel,
  canBuildRoster,
  classifyRunDoor,
} from './test-run-scope';

/**
 * nexus_test_placements.context_id is polymorphic with NO foreign key, so what
 * it points at depends entirely on context_type. Getting it wrong does not
 * throw: you look up a classroom by a class id, find nothing, and silently show
 * a teacher an empty roster with no reason why.
 *
 * The mapping is verified against the writers: class-test.ts and class-prep.ts
 * pass `contextId: input.scheduledClassId`, catchup-test.ts passes
 * `recap.scheduled_class_id`, and exams.ts reads its placement back by
 * `.eq('context_id', exam.scheduled_class_id)`.
 */
describe('which id a placement context holds', () => {
  it('treats every class-linked context as pointing at a scheduled class', () => {
    for (const ctx of ['class_test', 'class_prep_test', 'catchup_class', 'exam']) {
      expect(CLASS_ANCHORED_CONTEXTS.has(ctx)).toBe(true);
      expect(CLASSROOM_ANCHORED_CONTEXTS.has(ctx)).toBe(false);
    }
  });

  it('treats the classroom-wide contexts as pointing at a classroom', () => {
    for (const ctx of ['classroom_assignment', 'student_practice']) {
      expect(CLASSROOM_ANCHORED_CONTEXTS.has(ctx)).toBe(true);
      expect(CLASS_ANCHORED_CONTEXTS.has(ctx)).toBe(false);
    }
  });

  it('never claims both, which would decide the lookup by set-iteration order', () => {
    for (const ctx of CLASS_ANCHORED_CONTEXTS) {
      expect(CLASSROOM_ANCHORED_CONTEXTS.has(ctx)).toBe(false);
    }
  });

  it('can build a roster for anything anchored to a class or a classroom, and nothing else', () => {
    expect(canBuildRoster('class_test')).toBe(true);
    expect(canBuildRoster('classroom_assignment')).toBe(true);
    // A chapter test belongs to a study file, so there is no cohort it is "set for".
    expect(canBuildRoster('study_file')).toBe(false);
    expect(canBuildRoster(null)).toBe(false);
  });
});

/**
 * The same three buckets as classifyAttemptKind in the database package, so the
 * teacher's vocabulary and the analytics vocabulary cannot become two
 * taxonomies for one idea.
 */
describe('which door a run came through', () => {
  it('maps the three doors a teacher actually picks', () => {
    expect(classifyRunDoor('student_practice')).toBe('practice');
    expect(classifyRunDoor('class_test')).toBe('class');
    expect(classifyRunDoor('exam')).toBe('exam');
  });

  it('counts an old Assign placement as a class run, because that is what it always meant', () => {
    expect(classifyRunDoor('classroom_assignment')).toBe('class');
  });

  it('files the contexts a teacher never sets by hand under other', () => {
    expect(classifyRunDoor('study_file')).toBe('other');
    expect(classifyRunDoor('class_recap_section')).toBe('other');
    expect(classifyRunDoor(null)).toBe('other');
  });
});

describe('what the run picker calls a run', () => {
  it('names the class a class test followed', () => {
    expect(
      buildRunLabel({
        contextType: 'class_test',
        contextLabel: 'Islamic Architecture in India',
        opensAt: '2026-08-24T04:00:00Z',
        closesAt: null,
      }),
    ).toBe('Class test: Islamic Architecture in India, 24 Aug');
  });

  /**
   * The distinction that was invisible before. An old Assign placement covers
   * no lecture, so it must not read like a test set after a specific class.
   */
  it('says plainly when a class test has no class linked', () => {
    expect(
      buildRunLabel({ contextType: 'classroom_assignment', contextLabel: 'NATA 2027', opensAt: null, closesAt: null }),
    ).toBe('Class test: NATA 2027 (whole class, no class linked)');
  });

  it('says a practice pool is always open, since it has no date to show', () => {
    expect(
      buildRunLabel({ contextType: 'student_practice', contextLabel: 'NATA 2027', opensAt: null, closesAt: null }),
    ).toBe('Practice (always open)');
  });

  it('falls back to the close date when a run has no open date', () => {
    expect(
      buildRunLabel({ contextType: 'exam', contextLabel: 'Mock 3', opensAt: null, closesAt: '2026-08-20T04:00:00Z' }),
    ).toBe('Exam: Mock 3, 20 Aug');
  });

  it('still names a run whose context could not be resolved', () => {
    const label = buildRunLabel({ contextType: 'class_test', contextLabel: null, opensAt: null, closesAt: null });
    expect(label).toBe('Class test');
  });

  it('uses no dash punctuation, which reads as machine written', () => {
    const labels = [
      buildRunLabel({ contextType: 'class_test', contextLabel: 'Chapter 4', opensAt: '2026-08-24T04:00:00Z', closesAt: null }),
      buildRunLabel({ contextType: 'student_practice', contextLabel: null, opensAt: null, closesAt: null }),
      buildRunLabel({ contextType: 'exam', contextLabel: 'Mock 3', opensAt: null, closesAt: '2026-08-20T04:00:00Z' }),
    ];
    for (const l of labels) {
      expect(l).not.toMatch(/[—–]|--/);
    }
  });
});
