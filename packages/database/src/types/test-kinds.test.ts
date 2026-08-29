import { describe, expect, it } from 'vitest';
import { NEXUS_TEACHER_TEST_KINDS, NEXUS_TEST_KIND_LABELS } from './index';

/**
 * The name collision that made a book test and a class test indistinguishable.
 *
 * `test_kind` says what a paper COVERS. Whether it is a dated, rostered class
 * test is a property of its RUN (a nexus_test_placements row with
 * context_type = 'class_test'). Both were once labelled "Class test", so the
 * dropdown a teacher used to describe a paper's syllabus looked like the
 * control that decided how students got it. A founder hit exactly this and
 * could not tell the two apart on any screen.
 *
 * These tests exist so the label cannot drift back. If a future change wants
 * "Class test" in this menu again, it has to delete a test that explains why
 * that is wrong.
 */
describe('the teacher test-kind menu', () => {
  it('never offers "Class test" as a syllabus scope', () => {
    const labels = NEXUS_TEACHER_TEST_KINDS.map((k) => k.label);
    expect(labels).not.toContain('Class test');
  });

  it('never labels any kind "Class test", including the ones a teacher cannot pick', () => {
    expect(Object.values(NEXUS_TEST_KIND_LABELS)).not.toContain('Class test');
  });

  it('still describes the default kind, so an unlabelled paper is not nameless', () => {
    const fallback = NEXUS_TEACHER_TEST_KINDS.find((k) => k.value === 'classroom_assigned');
    expect(fallback?.label).toBe('General paper');
    expect(NEXUS_TEST_KIND_LABELS.classroom_assigned).toBe('General paper');
  });

  it('gives every offered kind a distinct label, so the menu has no two identical rows', () => {
    const labels = NEXUS_TEACHER_TEST_KINDS.map((k) => k.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('gives every offered kind a hint, since the labels alone do not separate them', () => {
    for (const k of NEXUS_TEACHER_TEST_KINDS) {
      expect(k.hint.trim().length).toBeGreaterThan(0);
    }
  });

  /** Every value in the menu must be a real kind the label map can render. */
  it('offers no kind the label map cannot name', () => {
    for (const k of NEXUS_TEACHER_TEST_KINDS) {
      expect(NEXUS_TEST_KIND_LABELS[k.value]).toBeTruthy();
    }
  });
});
