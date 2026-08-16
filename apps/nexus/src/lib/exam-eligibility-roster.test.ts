import { describe, it, expect } from 'vitest';
import {
  buildExamEligibilityRoster,
  summariseEligibilityRoster,
  type BuildEligibilityRosterInput,
  type EligibilityCoveredClass,
  type EligibilityStudent,
} from './exam-eligibility-roster';

const CLASS_1: EligibilityCoveredClass = { id: 'c1', title: 'History of Architecture 1', scheduled_date: '2026-08-10' };
const CLASS_2: EligibilityCoveredClass = { id: 'c2', title: 'History of Architecture 2', scheduled_date: '2026-08-13' };

function student(id: string, enrolledAt = '2026-08-01T00:00:00Z'): EligibilityStudent {
  return { student_id: id, name: `Student ${id}`, avatar_url: null, enrolled_at: enrolledAt };
}

function input(over: Partial<BuildEligibilityRosterInput> = {}): BuildEligibilityRosterInput {
  return {
    students: [student('a')],
    coveredClasses: [CLASS_1, CLASS_2],
    attendance: new Map(),
    absences: new Map(),
    overrides: new Map(),
    ...over,
  };
}

describe('no linked classes = todays behaviour, unchanged', () => {
  it('is mandatory_attended for everyone when no classes are covered', () => {
    const rows = buildExamEligibilityRoster(input({ coveredClasses: [] }));
    expect(rows[0].bucket).toBe('mandatory_attended');
    expect(rows[0].is_mandatory).toBe(true);
  });
});

describe('attendance and catch-up decide the bucket', () => {
  it('attended both covered classes -> mandatory_attended', () => {
    const rows = buildExamEligibilityRoster(
      input({
        attendance: new Map([['a', new Map([['c1', true], ['c2', true]])]]),
      }),
    );
    expect(rows[0].bucket).toBe('mandatory_attended');
    expect(rows[0].is_mandatory).toBe(true);
  });

  it('attended one, caught up on the other -> still mandatory_attended (attending any covered class wins the label)', () => {
    const rows = buildExamEligibilityRoster(
      input({
        attendance: new Map([['a', new Map([['c1', true]])]]),
        absences: new Map([['a', new Map([['c2', { kind: 'no_show', caught_up_at: '2026-08-14T10:00:00Z', excused_at: null }]])]]),
      }),
    );
    expect(rows[0].bucket).toBe('mandatory_attended');
    expect(rows[0].is_mandatory).toBe(true);
  });

  it('missed both, caught up on both -> mandatory_caught_up', () => {
    const rows = buildExamEligibilityRoster(
      input({
        absences: new Map([
          [
            'a',
            new Map([
              ['c1', { kind: 'no_show', caught_up_at: '2026-08-11T10:00:00Z', excused_at: null }],
              ['c2', { kind: 'no_show', caught_up_at: '2026-08-14T10:00:00Z', excused_at: null }],
            ]),
          ],
        ]),
      }),
    );
    expect(rows[0].bucket).toBe('mandatory_caught_up');
  });

  it('a teacher-waived absence counts as caught up', () => {
    const rows = buildExamEligibilityRoster(
      input({
        attendance: new Map([['a', new Map([['c1', true]])]]),
        absences: new Map([['a', new Map([['c2', { kind: 'no_show', caught_up_at: null, excused_at: '2026-08-14T09:00:00Z' }]])]]),
      }),
    );
    expect(rows[0].bucket).toBe('mandatory_attended');
    expect(rows[0].is_mandatory).toBe(true);
  });

  it('missed one class and has not caught up -> excused_pending_catchup', () => {
    const rows = buildExamEligibilityRoster(
      input({
        attendance: new Map([['a', new Map([['c1', true]])]]),
        absences: new Map([['a', new Map([['c2', { kind: 'no_show', caught_up_at: null, excused_at: null }]])]]),
      }),
    );
    expect(rows[0].bucket).toBe('excused_pending_catchup');
    expect(rows[0].is_mandatory).toBe(false);
  });
});

describe('missing evidence is never read as mandatory', () => {
  it('no attendance row and no absence row for a covered class falls to excused_pending_catchup', () => {
    // A genuine data gap: the sync that would have written either row has not
    // run yet. This must never be silently treated as "attended".
    const rows = buildExamEligibilityRoster(input());
    expect(rows[0].bucket).toBe('excused_pending_catchup');
    expect(rows[0].is_mandatory).toBe(false);
  });
});

describe('new joiners are auto-excused, generously', () => {
  it('enrolled after the earliest covered class -> excused_new_joiner, even with no other evidence', () => {
    const rows = buildExamEligibilityRoster(
      input({ students: [student('a', '2026-08-11T00:00:00Z')] }),
    );
    expect(rows[0].bucket).toBe('excused_new_joiner');
    expect(rows[0].is_mandatory).toBe(false);
  });

  it('enrolled before the earliest covered class is judged on evidence, not excused', () => {
    const rows = buildExamEligibilityRoster(
      input({
        students: [student('a', '2026-08-01T00:00:00Z')],
        attendance: new Map([['a', new Map([['c1', true], ['c2', true]])]]),
      }),
    );
    expect(rows[0].bucket).not.toBe('excused_new_joiner');
  });

  it('enrolled exactly on the earliest covered class date is not treated as a new joiner', () => {
    const rows = buildExamEligibilityRoster(
      input({
        students: [student('a', '2026-08-10T18:00:00Z')],
        attendance: new Map([['a', new Map([['c1', true], ['c2', true]])]]),
      }),
    );
    expect(rows[0].bucket).not.toBe('excused_new_joiner');
  });
});

describe('a teacher override always wins the final bucket, but never erases the evidence', () => {
  it('forces mandatory over an auto-excused new joiner', () => {
    const rows = buildExamEligibilityRoster(
      input({
        students: [student('a', '2026-08-11T00:00:00Z')],
        overrides: new Map([['a', { override: 'mandatory' as const, note: 'Caught up early', set_by: 't1', set_at: '2026-08-14T00:00:00Z' }]]),
      }),
    );
    expect(rows[0].bucket).toBe('teacher_override_mandatory');
    expect(rows[0].is_mandatory).toBe(true);
    // The underlying automatic decision is preserved for the UI to show.
    expect(rows[0].auto_bucket).toBe('excused_new_joiner');
  });

  it('forces excused over an auto-mandatory attendee, keeping the evidence', () => {
    const rows = buildExamEligibilityRoster(
      input({
        attendance: new Map([['a', new Map([['c1', true], ['c2', true]])]]),
        overrides: new Map([['a', { override: 'excused' as const, note: 'Family emergency', set_by: 't1', set_at: '2026-08-14T00:00:00Z' }]]),
      }),
    );
    expect(rows[0].bucket).toBe('teacher_override_excused');
    expect(rows[0].is_mandatory).toBe(false);
    expect(rows[0].auto_bucket).toBe('mandatory_attended');
    expect(rows[0].evidence).toHaveLength(2);
  });
});

describe('summariseEligibilityRoster', () => {
  it('counts every row into exactly one of mandatory/pending-catchup/new-joiner, and overridden separately', () => {
    const rows = buildExamEligibilityRoster(
      input({
        students: [student('mandatory'), student('pending'), student('new', '2026-08-12T00:00:00Z'), student('overridden')],
        attendance: new Map([['mandatory', new Map([['c1', true], ['c2', true]])]]),
        overrides: new Map([['overridden', { override: 'excused' as const, note: null, set_by: null, set_at: '2026-08-14T00:00:00Z' }]]),
      }),
    );
    const summary = summariseEligibilityRoster(rows);
    expect(summary.total).toBe(4);
    expect(summary.mandatory).toBe(1);
    expect(summary.excusedNewJoiner).toBe(1);
    // 'pending' (no evidence) and 'overridden' (force-excused from a
    // mandatory auto-decision) both land under excusedPendingCatchup.
    expect(summary.excusedPendingCatchup).toBe(2);
    expect(summary.overridden).toBe(1);
  });
});
