import { describe, expect, it } from 'vitest';
import { resolveResultStatus } from '@neram/database';
import { buildExamRunRoster, type ExamRunRosterInput } from './exam-run-roster';

/**
 * The Students tab of an exam, from the exam's own eligibility.
 *
 * Found 2026-09-17 on the 18 Aug History of Architecture exam. The tab built
 * its roster from the run's covered classes, which only class tests write, so
 * the list was empty and every student was "In the class". Five students who
 * joined weeks later were listed as "Missed the date" and counted under Not
 * done, and a make-up student read as missed too. The invigilation roster was
 * right all along, because it reads the exam's own covered classes, overrides
 * and make-ups. These tests hold the Students tab to that same engine.
 */

const NOW = Date.parse('2026-09-17T12:00:00Z');
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

const EXAM = { opens_at: '2026-08-18T08:30:00Z', closes_at: '2026-08-18T17:15:00Z' };

const student = (id: string, enrolled_at: string, over: Record<string, unknown> = {}) => ({
  student_id: id,
  name: id,
  avatar_url: null,
  enrolled_at,
  ...over,
});

function input(over: Partial<ExamRunRosterInput> = {}): ExamRunRosterInput {
  return {
    exam: EXAM,
    facts: {
      students: [
        student('attended', '2026-03-21T00:00:00Z'),
        student('late-joiner', '2026-08-31T06:00:00Z'),
      ],
      coveredClasses: [
        { id: 'c-12', title: 'Indus to Dravidian', scheduled_date: '2026-08-12' },
        { id: 'c-14', title: 'Indo-Aryan Temples', scheduled_date: '2026-08-14' },
      ],
      attendance: new Map([['attended', new Map([['c-12', true], ['c-14', true]])]]),
      absences: new Map(),
      overrides: new Map(),
    },
    makeups: [],
    access: [],
    now: NOW,
    ...over,
  };
}

/** What getTestResults would call a student, from this roster and nothing else. */
function statusOf(out: ReturnType<typeof buildExamRunRoster>, id: string, sat = false) {
  const member = out.roster.find((r) => r.student_id === id)!;
  return resolveResultStatus({
    hasSubmitted: sat,
    hasInProgress: false,
    isMandatory: member.is_mandatory,
    closesAt: EXAM.closes_at,
    windowOpenUntil: out.windowsByStudent[id] ?? null,
    now: NOW,
  });
}

describe('buildExamRunRoster', () => {
  it('excuses a student who joined after the covered classes, instead of calling them missed', () => {
    const out = buildExamRunRoster(input());
    const late = out.roster.find((r) => r.student_id === 'late-joiner')!;
    expect(late.bucket).toBe('excused_new_joiner');
    expect(late.is_mandatory).toBe(false);
    expect(statusOf(out, 'late-joiner')).toBe('excused');
  });

  it('still says Done for a late joiner who did sit it', () => {
    const out = buildExamRunRoster(input());
    expect(statusOf(out, 'late-joiner', true)).toBe('submitted');
  });

  it('keeps a student who was in the class and never sat it as missed', () => {
    const out = buildExamRunRoster(input());
    expect(out.roster.find((r) => r.student_id === 'attended')!.is_mandatory).toBe(true);
    expect(statusOf(out, 'attended')).toBe('missed');
  });

  it('shows a live make-up as their own window rather than Missed', () => {
    const out = buildExamRunRoster(
      input({
        makeups: [
          { student_id: 'attended', opens_at: iso(NOW - DAY), closes_at: iso(NOW + 2 * DAY), revoked_at: null },
        ],
      }),
    );
    expect(out.windowsByStudent.attended).toBe(iso(NOW + 2 * DAY));
    expect(out.windowSources.attended).toBe('makeup');
    expect(statusOf(out, 'attended')).toBe('not_started');
  });

  it('shows a make-up that has not opened yet as a window too', () => {
    const out = buildExamRunRoster(
      input({
        makeups: [
          { student_id: 'attended', opens_at: iso(NOW + DAY), closes_at: iso(NOW + 2 * DAY), revoked_at: null },
        ],
      }),
    );
    expect(out.windowSources.attended).toBe('makeup');
  });

  it('lets a make-up that has already closed read as missed, with no window to show', () => {
    const out = buildExamRunRoster(
      input({
        makeups: [
          { student_id: 'attended', opens_at: iso(NOW - 3 * DAY), closes_at: iso(NOW - 2 * DAY), revoked_at: null },
        ],
      }),
    );
    expect(out.windowsByStudent.attended).toBeUndefined();
    expect(statusOf(out, 'attended')).toBe('missed');
  });

  it('ignores a revoked make-up', () => {
    const out = buildExamRunRoster(
      input({
        makeups: [
          {
            student_id: 'attended',
            opens_at: iso(NOW - DAY),
            closes_at: iso(NOW + 2 * DAY),
            revoked_at: iso(NOW - 1000),
          },
        ],
      }),
    );
    expect(out.windowsByStudent.attended).toBeUndefined();
  });

  it('lets a granted reopen outrank a make-up, exactly as resolveExamWindowForStudent does', () => {
    const out = buildExamRunRoster(
      input({
        makeups: [
          { student_id: 'attended', opens_at: iso(NOW - DAY), closes_at: iso(NOW + 2 * DAY), revoked_at: null },
        ],
        access: [
          { student_id: 'attended', status: 'granted', opens_at: null, closes_at: iso(NOW + 5 * DAY) },
        ],
      }),
    );
    expect(out.windowsByStudent.attended).toBe(iso(NOW + 5 * DAY));
    expect(out.windowSources.attended).toBe('reopen');
  });

  it('keeps an expired reopen on the row, as the tab always has, so the teacher can close it', () => {
    const out = buildExamRunRoster(
      input({
        access: [{ student_id: 'attended', status: 'granted', opens_at: null, closes_at: iso(NOW - DAY) }],
      }),
    );
    expect(out.windowsByStudent.attended).toBe(iso(NOW - DAY));
    expect(out.windowSources.attended).toBe('reopen');
    expect(statusOf(out, 'attended')).toBe('missed');
  });

  it('lists a pending ask without widening anybody', () => {
    const out = buildExamRunRoster(
      input({ access: [{ student_id: 'attended', status: 'pending', opens_at: null, closes_at: null }] }),
    );
    expect(out.pendingRequestStudentIds).toEqual(['attended']);
    expect(out.windowsByStudent.attended).toBeUndefined();
  });

  it("excuses by the exam's own override and carries the teacher's words", () => {
    const facts = input().facts;
    facts.overrides = new Map([
      ['attended', { override: 'excused', note: 'Away at the state athletics meet', set_by: 't1', set_at: iso(NOW) }],
    ]);
    const out = buildExamRunRoster(input({ facts }));
    const row = out.roster.find((r) => r.student_id === 'attended')!;
    expect(row.bucket).toBe('teacher_override_excused');
    expect(statusOf(out, 'attended')).toBe('excused');
    expect(out.overrideNotes.attended).toBe('Away at the state athletics meet');
  });

  it("lets the exam's own override win over a run override", () => {
    const facts = input().facts;
    facts.overrides = new Map([
      ['late-joiner', { override: 'mandatory', note: null, set_by: 't1', set_at: iso(NOW) }],
    ]);
    const out = buildExamRunRoster(
      input({
        facts,
        runOverrides: new Map([
          ['late-joiner', { override: 'excused', note: 'run', set_by: 't2', set_at: iso(NOW) }],
          ['attended', { override: 'excused', note: 'from the run', set_by: 't2', set_at: iso(NOW) }],
        ]),
      }),
    );
    expect(out.roster.find((r) => r.student_id === 'late-joiner')!.is_mandatory).toBe(true);
    // No exam override for this one, so the run's still applies.
    expect(out.roster.find((r) => r.student_id === 'attended')!.is_mandatory).toBe(false);
  });

  it('names paused students so the report can hide the ones who did not sit it', () => {
    const facts = input().facts;
    facts.students = [...facts.students, { ...student('paused', '2026-03-21T00:00:00Z'), dormant: true }];
    const out = buildExamRunRoster(input({ facts }));
    expect(out.pausedStudentIds).toEqual(['paused']);
    expect(out.roster.map((r) => r.student_id)).toContain('paused');
  });

  it('makes everyone mandatory when the exam covers no classes, as it always has', () => {
    const facts = input().facts;
    facts.coveredClasses = [];
    const out = buildExamRunRoster(input({ facts }));
    expect(out.roster.every((r) => r.is_mandatory)).toBe(true);
  });
});
