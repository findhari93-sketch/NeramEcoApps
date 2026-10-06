import { describe, expect, it } from 'vitest';
import {
  shouldBlockForAbsence,
  DEFAULT_ABSENCE_GATE,
  ABSENCE_GATE_FEATURE,
  type AbsenceGateInput,
} from './absence-gate';

const held = { reason: 'silent_absence' as const, setAt: '2026-11-12T04:30:00Z', setBy: null };

function input(over: Partial<AbsenceGateInput> = {}): AbsenceGateInput {
  return {
    flagEnabled: true,
    nexusRole: 'student',
    impersonating: false,
    classroomCount: 1,
    restriction: held,
    ...over,
  };
}

describe('who gets held', () => {
  it('holds a student with a live restriction', () => {
    expect(shouldBlockForAbsence(input())).toBe(true);
  });

  it('lets a student with no restriction straight through', () => {
    expect(shouldBlockForAbsence(input({ restriction: null }))).toBe(false);
  });

  it('holds a student a teacher put on hold by hand, too', () => {
    expect(
      shouldBlockForAbsence(input({ restriction: { ...held, reason: 'manual', setBy: 'u-hari' } })),
    ).toBe(true);
  });
});

describe('who is never held, whatever the row says', () => {
  // Reversing a rule this visible needs a switch, not a revert.
  it('nobody at all while the flag is off', () => {
    expect(shouldBlockForAbsence(input({ flagEnabled: false }))).toBe(false);
  });

  // View as Student is how a teacher diagnoses what a held student is seeing.
  // A gate that fires there shows them the lockout screen and nothing else.
  it('never during impersonation', () => {
    expect(shouldBlockForAbsence(input({ impersonating: true }))).toBe(false);
  });

  it('never a teacher or an admin', () => {
    for (const nexusRole of ['teacher', 'admin']) {
      expect(shouldBlockForAbsence(input({ nexusRole }))).toBe(false);
    }
  });

  // A parent must never be full-screened over their child's attendance. The
  // route hard-codes DEFAULT_ABSENCE_GATE for them as well; this is the second
  // line of that defence, because the hard-code is what a refactor simplifies.
  it('never a parent', () => {
    expect(shouldBlockForAbsence(input({ nexusRole: 'parent' }))).toBe(false);
  });

  // RoleGuard already gives them NoClassroomWelcome, which is the more useful
  // message. Holding someone who cannot get in anyway is just noise.
  it('never a student with no active classroom', () => {
    expect(shouldBlockForAbsence(input({ classroomCount: 0 }))).toBe(false);
  });
});

describe('the safe default', () => {
  it('never blocks', () => {
    // Before /api/auth/me answers, for parents, in E2E mode, and after a failed
    // read. A gate defaulting to "held" would flash the blocker on every page
    // load for every compliant student.
    expect(DEFAULT_ABSENCE_GATE.required).toBe(false);
  });

  it('carries nothing that would render a half-built screen', () => {
    expect(DEFAULT_ABSENCE_GATE.classes).toEqual([]);
    expect(DEFAULT_ABSENCE_GATE.setAt).toBeNull();
    expect(DEFAULT_ABSENCE_GATE.byTeacher).toBe(false);
  });

  it('names the flag the admin panel switches', () => {
    expect(ABSENCE_GATE_FEATURE).toBe('student.absence-reason-gate');
  });
});
