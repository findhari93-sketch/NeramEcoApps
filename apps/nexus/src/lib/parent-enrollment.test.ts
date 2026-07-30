import { describe, it, expect } from 'vitest';
import {
  buildEnrollmentNotice,
  toIstDate,
  type ChildEnrollmentRow,
  type EnrollmentNotice,
} from './parent-enrollment';

const FIRST_CLASS = '2026-06-01';

function row(over: Partial<ChildEnrollmentRow> = {}): ChildEnrollmentRow {
  return {
    id: 'e1',
    batch_id: null,
    is_active: true,
    enrolled_at: '2026-05-20T04:30:00Z',
    removed_at: null,
    participation_status: 'active',
    dormant_since: null,
    dormant_reason: null,
    ...over,
  };
}

describe('toIstDate', () => {
  it('leaves a bare calendar day alone', () => {
    // Parsing '2026-06-12' as an instant would read it as UTC midnight and the
    // IST formatter would hand back the same day, but only by luck. A date
    // column is already an IST day and must never round-trip through an instant.
    expect(toIstDate('2026-06-12')).toBe('2026-06-12');
  });

  it('converts an instant to the IST calendar day, not the UTC one', () => {
    // 2026-06-11T20:00Z is 2026-06-12 01:30 IST. A slice(0, 10) would say the 11th.
    expect(toIstDate('2026-06-11T20:00:00Z')).toBe('2026-06-12');
  });

  it('returns null for junk rather than a wrong date', () => {
    expect(toIstDate(null)).toBeNull();
    expect(toIstDate('')).toBeNull();
    expect(toIstDate('not a date')).toBeNull();
  });
});

describe('buildEnrollmentNotice', () => {
  it('says nothing about an active, on-time student', () => {
    expect(buildEnrollmentNotice(row(), 'Arun', FIRST_CLASS)).toBeNull();
  });

  it('returns null when there is no enrolment row at all', () => {
    expect(buildEnrollmentNotice(null, 'Arun', FIRST_CLASS)).toBeNull();
  });

  it('explains a dormant enrolment, which is the reported incident', () => {
    const notice = buildEnrollmentNotice(
      row({ participation_status: 'dormant', dormant_since: '2026-06-12' }),
      'Arun Kumar',
      FIRST_CLASS
    );
    expect(notice?.kind).toBe('dormant');
    expect(notice?.tone).toBe('warning');
    expect(notice?.sinceDate).toBe('2026-06-12');
    // The parent must be told WHY the numbers are empty, not just that they are.
    expect(notice?.detail).toContain('left out of class lists');
    expect(notice?.detail).toContain('12 June');
    // First name only, so the sentence reads naturally.
    expect(notice?.headline).toBe('Arun is paused in this class');
  });

  it('still explains a dormant enrolment with no dormant_since recorded', () => {
    const notice = buildEnrollmentNotice(
      row({ participation_status: 'dormant', dormant_since: null }),
      'Arun',
      FIRST_CLASS
    );
    expect(notice?.kind).toBe('dormant');
    expect(notice?.sinceDate).toBeNull();
    expect(notice?.detail).toContain('left out of class lists');
  });

  it('reports a removed enrolment from removed_at alone', () => {
    const notice = buildEnrollmentNotice(
      row({ removed_at: '2026-05-02T06:00:00Z' }),
      'Arun',
      FIRST_CLASS
    );
    expect(notice?.kind).toBe('removed');
    expect(notice?.sinceDate).toBe('2026-05-02');
  });

  it('reports a removed enrolment from is_active alone', () => {
    const notice = buildEnrollmentNotice(
      row({ is_active: false, removed_at: null }),
      'Arun',
      FIRST_CLASS
    );
    expect(notice?.kind).toBe('removed');
    expect(notice?.sinceDate).toBeNull();
  });

  it('lets removed beat dormant, so a closed place is not described as paused', () => {
    const notice = buildEnrollmentNotice(
      row({
        is_active: false,
        removed_at: '2026-05-02T06:00:00Z',
        participation_status: 'dormant',
        dormant_since: '2026-04-01',
      }),
      'Arun',
      FIRST_CLASS
    );
    expect(notice?.kind).toBe('removed');
  });

  it('lets dormant beat late_joiner, because dormant is what suppresses numbers', () => {
    const notice = buildEnrollmentNotice(
      row({
        enrolled_at: '2026-08-03T04:30:00Z',
        participation_status: 'dormant',
        dormant_since: '2026-09-01',
      }),
      'Arun',
      FIRST_CLASS
    );
    expect(notice?.kind).toBe('dormant');
  });

  it('flags a late joiner so early classes do not read as missed', () => {
    const notice = buildEnrollmentNotice(
      row({ enrolled_at: '2026-08-03T04:30:00Z' }),
      'Arun',
      FIRST_CLASS
    );
    expect(notice?.kind).toBe('late_joiner');
    expect(notice?.tone).toBe('info');
    expect(notice?.sinceDate).toBe('2026-08-03');
    expect(notice?.detail).toContain('catch-up work');
  });

  it('does not flag a student who enrolled on the day of the first class', () => {
    const notice = buildEnrollmentNotice(
      row({ enrolled_at: `${FIRST_CLASS}T04:30:00Z` }),
      'Arun',
      FIRST_CLASS
    );
    expect(notice).toBeNull();
  });

  it('does not guess at late joining when the classroom has no classes yet', () => {
    const notice = buildEnrollmentNotice(
      row({ enrolled_at: '2026-08-03T04:30:00Z' }),
      'Arun',
      null
    );
    expect(notice).toBeNull();
  });

  it('falls back to a neutral name when the child has none', () => {
    const notice = buildEnrollmentNotice(
      row({ participation_status: 'dormant' }),
      null,
      FIRST_CLASS
    );
    expect(notice?.headline).toBe('Your child is paused in this class');
  });
});

describe('content rules', () => {
  /**
   * Em dashes, double dashes and &mdash; read as machine-written and are banned
   * across the product (root CLAUDE.md). Asserting it here turns the rule into a
   * failing test rather than a review comment somebody has to remember.
   */
  const BANNED = /[—–]|--|&mdash;/;

  const everyNotice: EnrollmentNotice[] = [
    buildEnrollmentNotice(row({ is_active: false }), 'Arun', FIRST_CLASS),
    buildEnrollmentNotice(
      row({ removed_at: '2026-05-02T06:00:00Z' }),
      'Arun',
      FIRST_CLASS
    ),
    buildEnrollmentNotice(
      row({ participation_status: 'dormant', dormant_since: '2026-06-12' }),
      'Arun',
      FIRST_CLASS
    ),
    buildEnrollmentNotice(row({ participation_status: 'dormant' }), 'Arun', FIRST_CLASS),
    buildEnrollmentNotice(row({ enrolled_at: '2026-08-03T04:30:00Z' }), 'Arun', FIRST_CLASS),
  ].filter((n): n is EnrollmentNotice => n !== null);

  it('covers every notice branch', () => {
    expect(everyNotice).toHaveLength(5);
  });

  it.each(everyNotice.map((n) => [n.kind, n] as const))(
    'uses no em dashes in the %s notice',
    (_kind, notice) => {
      expect(notice.headline).not.toMatch(BANNED);
      expect(notice.detail).not.toMatch(BANNED);
    }
  );

  it.each(everyNotice.map((n) => [n.kind, n] as const))(
    'writes a complete sentence in the %s notice',
    (_kind, notice) => {
      expect(notice.headline.length).toBeGreaterThan(10);
      expect(notice.detail.trim().endsWith('.')).toBe(true);
    }
  );
});
