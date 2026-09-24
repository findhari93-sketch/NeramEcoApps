import { describe, it, expect } from 'vitest';
import {
  resolveAbsenceReason,
  describeReasonSource,
  describeReasonSourceForStudent,
  reasonChip,
  reasonFilterKey,
  reasonLine,
} from './absence-reason';
import { registerGroupOf } from './attendance-register';
import type { AwayWindow } from './away-windows';

function win(over: Partial<AwayWindow> = {}): AwayWindow {
  return {
    id: 'w1',
    student_id: 's1',
    starts_on: '2026-09-10',
    ends_on: '2026-09-20',
    reason_code: 'clash',
    reason_note: 'Board exams',
    source: 'student',
    cancelled_at: null,
    created_at: '2026-09-05T10:00:00Z',
    ...over,
  };
}

describe('resolveAbsenceReason', () => {
  it('returns null when nobody said anything', () => {
    expect(resolveAbsenceReason({})).toBeNull();
    expect(resolveAbsenceReason({ absence: { reason_code: null, reason_note: '  ' } })).toBeNull();
  });

  it('reads the RSVP decline even when the absence row has no reason (the deriveNoShows race)', () => {
    // deriveNoShows wrote a bare no_show row first, so the RSVP copy never
    // landed on it. The student still told us before class.
    const r = resolveAbsenceReason({
      absence: { reason_code: null, reason_note: null },
      rsvp: { response: 'not_attending', reason_code: 'unwell', reason: 'Fever', responded_at: '2026-09-11T05:00:00Z' },
    });
    expect(r).toMatchObject({ code: 'unwell', note: 'Fever', source: 'before_class' });
    expect(describeReasonSource(r!)).toBe('Told us before class');
    expect(describeReasonSourceForStudent(r!)).toBe('You told us before class');
  });

  it('treats a bare decline as explained, like the register does', () => {
    const r = resolveAbsenceReason({ rsvp: { response: 'not_attending' } });
    expect(r).toMatchObject({ code: 'other', note: null, source: 'before_class' });
    expect(registerGroupOf({ rsvp: 'not_attending' })).toBe('reason');
  });

  it('ignores an RSVP that says attending', () => {
    expect(resolveAbsenceReason({ rsvp: { response: 'attending', reason_code: 'unwell' } })).toBeNull();
  });

  it('reads an away window covering the class date with no RSVP and no typed reason', () => {
    const r = resolveAbsenceReason({ awayWindows: [win()], classDate: '2026-09-15' });
    expect(r).toMatchObject({ code: 'clash', note: 'Board exams', source: 'away' });
    expect(describeReasonSource(r!)).toBe('Away 10 Sep to 20 Sep');
    expect(describeReasonSourceForStudent(r!)).toBe('You were away 10 Sep to 20 Sep');
  });

  it('does not use a window that does not cover the date, or one cancelled', () => {
    expect(resolveAbsenceReason({ awayWindows: [win()], classDate: '2026-09-25' })).toBeNull();
    expect(
      resolveAbsenceReason({ awayWindows: [win({ cancelled_at: '2026-09-12T00:00:00Z' })], classDate: '2026-09-15' }),
    ).toBeNull();
  });

  it('describes an open-ended window', () => {
    const r = resolveAbsenceReason({ awayWindows: [win({ ends_on: null })], classDate: '2026-10-01' });
    expect(describeReasonSource(r!)).toBe('Away from 10 Sep');
  });

  it('puts the away window ahead of a per-class reason, matching registerGroupOf', () => {
    const r = resolveAbsenceReason({
      absence: { reason_code: 'family', reason_note: 'Wedding' },
      rsvp: { response: 'not_attending', reason_code: 'unwell' },
      awayWindows: [win()],
      classDate: '2026-09-12',
    });
    expect(r?.source).toBe('away');
    expect(registerGroupOf({ away: true, absence: { reason_code: 'family' } })).toBe('away');
  });

  it('prefers what was written on the absence row over the RSVP', () => {
    const r = resolveAbsenceReason({
      absence: { reason_code: 'family', reason_note: 'Wedding', reason_submitted_at: '2026-09-13T00:00:00Z' },
      rsvp: { response: 'not_attending', reason_code: 'unwell' },
    });
    expect(r).toMatchObject({ code: 'family', note: 'Wedding', source: 'after_class' });
  });

  it('attributes a parent or teacher reason', () => {
    expect(resolveAbsenceReason({ absence: { reason_code: 'unwell', reason_source: 'parent' } })?.source).toBe('parent');
    expect(resolveAbsenceReason({ absence: { reason_code: 'unwell', reason_source: 'teacher' } })?.source).toBe('teacher');
  });

  it('folds an unknown stored code into other', () => {
    expect(resolveAbsenceReason({ absence: { reason_code: 'exam' } })?.code).toBe('other');
  });

  it('chip and filter key', () => {
    expect(reasonChip(null)).toBe('No reason');
    expect(reasonFilterKey(null)).toBe('none');
    const r = resolveAbsenceReason({ absence: { reason_code: 'clash' } });
    expect(reasonChip(r)).toBe('Exam clash');
    expect(reasonFilterKey(r)).toBe('clash');
  });

  it('marks a bare decline as unspecified, so it never reads as "Other"', () => {
    const r = resolveAbsenceReason({ rsvp: { response: 'not_attending' } });
    expect(r?.unspecified).toBe(true);
    expect(reasonChip(r)).toBe('Said they would miss it');
    expect(reasonLine(r)).toBe('Told us before class they would miss it');
    const coded = resolveAbsenceReason({ rsvp: { response: 'not_attending', reason_code: 'unwell' } });
    expect(coded?.unspecified).toBe(false);
  });

  it('writes the whole reason on one line, and "No reason given" only for silence', () => {
    const away = resolveAbsenceReason({ awayWindows: [win()], classDate: '2026-09-15' });
    expect(reasonLine(away)).toMatch(/^Exam clash · Away /);
    expect(reasonLine(null)).toBe('No reason given');
  });
});
