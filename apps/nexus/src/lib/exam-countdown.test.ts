import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  daysUntil,
  describeExamCountdown,
  examShortLabel,
  type ExamCountdownTarget,
  type ExamCountdownConfidence,
} from './exam-countdown';

const TODAY = '2026-07-30';

function target(overrides: Partial<ExamCountdownTarget> = {}): ExamCountdownTarget {
  return {
    exam_date: '2027-01-20',
    confidence: 'expected',
    source: 'exam_registry',
    exam_type: 'jee',
    phase: 'session_1',
    exam_year: 2027,
    label: 'JEE Main 2027 Session 1, Paper 2A (B.Arch)',
    note: 'NTA has not announced Session 1 yet.',
    plan: { id: 'plan-1', title: 'JEE 2027 Batch' },
    is_personal: false,
    ...overrides,
  };
}

/** A target `d` days from TODAY. */
function atDistance(d: number, confidence: ExamCountdownConfidence): ExamCountdownTarget {
  const ms = Date.parse(`${TODAY}T00:00:00Z`) + d * 86_400_000;
  return target({ exam_date: new Date(ms).toISOString().slice(0, 10), confidence });
}

function describeAt(d: number, confidence: ExamCountdownConfidence) {
  return describeExamCountdown(atDistance(d, confidence), TODAY)!;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('daysUntil', () => {
  it('is 0 for today, 1 for tomorrow, -1 for yesterday', () => {
    expect(daysUntil('2026-07-30', TODAY)).toBe(0);
    expect(daysUntil('2026-07-31', TODAY)).toBe(1);
    expect(daysUntil('2026-07-29', TODAY)).toBe(-1);
  });

  it('counts the JEE 2027 horizon', () => {
    expect(daysUntil('2027-01-20', TODAY)).toBe(174);
  });

  it('crosses a DST-free month boundary without drifting', () => {
    expect(daysUntil('2026-08-01', '2026-07-31')).toBe(1);
    expect(daysUntil('2027-01-01', '2026-12-31')).toBe(1);
  });
});

// The entire off-by-one guarantee. 23:30 IST must still be today; 00:30 IST must
// already be tomorrow. Both instants are the SAME UTC day, which is exactly what
// toISOString().slice(0,10) gets wrong elsewhere in this repo.
describe('IST day boundary', () => {
  it('treats 23:30 IST as still today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T18:00:00Z'));
    expect(daysUntil('2027-01-20')).toBe(174);
  });

  it('treats 00:30 IST as the next day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T19:00:00Z'));
    expect(daysUntil('2027-01-20')).toBe(173);
  });
});

describe('describeExamCountdown, confirmed dates', () => {
  it('rounds to months beyond 90 days', () => {
    const v = describeAt(174, 'confirmed');
    expect(v.band).toBe('far');
    expect(v.value).toBe('6 months');
    expect(v.headline).toBe('6 months to go');
    expect(v.is_estimate).toBe(false);
    expect(v.chip).toBeNull();
  });

  it('shows the exact weekday and year at distance', () => {
    const v = describeExamCountdown(target({ confidence: 'confirmed' }), TODAY)!;
    // 20 Jan 2027 is a Wednesday.
    expect(v.detail).toBe('Wed, 20 Jan 2027');
  });

  it('switches months to weeks at the 90 day boundary', () => {
    expect(describeAt(91, 'confirmed').value).toBe('3 months');
    expect(describeAt(90, 'confirmed').value).toBe('13 weeks');
    expect(describeAt(90, 'confirmed').band).toBe('weeks');
  });

  it('adds a day chip only once inside 60 days', () => {
    expect(describeAt(61, 'confirmed').chip).toBeNull();
    expect(describeAt(60, 'confirmed').chip).toBe('60d');
  });

  it('switches weeks to days at the 30 day boundary and warms the tone', () => {
    expect(describeAt(31, 'confirmed').band).toBe('weeks');
    expect(describeAt(31, 'confirmed').tone).toBe('neutral');
    expect(describeAt(30, 'confirmed').band).toBe('days');
    expect(describeAt(30, 'confirmed').value).toBe('30 days');
    expect(describeAt(30, 'confirmed').tone).toBe('info');
  });

  it('enters the final week at 7 days', () => {
    expect(describeAt(8, 'confirmed').band).toBe('days');
    expect(describeAt(8, 'confirmed').tone).toBe('info');
    expect(describeAt(7, 'confirmed').band).toBe('final_week');
    expect(describeAt(7, 'confirmed').tone).toBe('warning');
  });

  it('names tomorrow and today instead of counting', () => {
    expect(describeAt(1, 'confirmed').value).toBe('Tomorrow');
    expect(describeAt(1, 'confirmed').tone).toBe('urgent');
    expect(describeAt(0, 'confirmed').value).toBe('Today');
    expect(describeAt(0, 'confirmed').headline).toBe('Exam day is today');
    expect(describeAt(0, 'confirmed').detail).toBe('All the best.');
  });

  it('stays visible for a week after the exam, then hides', () => {
    expect(describeAt(-1, 'confirmed').band).toBe('past');
    expect(describeAt(-1, 'confirmed').visible).toBe(true);
    expect(describeAt(-1, 'confirmed').headline).toBe('The exam is done');
    expect(describeAt(-7, 'confirmed').visible).toBe(true);
    expect(describeAt(-8, 'confirmed').visible).toBe(false);
  });
});

describe('describeExamCountdown, expected dates', () => {
  it('hedges the JEE 2027 horizon rather than asserting 174 days', () => {
    const v = describeAt(174, 'expected');
    expect(v.value).toBe('About 6 months');
    expect(v.headline).toBe('About 6 months to go');
    expect(v.is_estimate).toBe(true);
    expect(v.tone).toBe('neutral');
    expect(v.detail).toContain('Expected around 20 Jan 2027');
    expect(v.detail).toContain('not announced yet');
  });

  it('never renders a bare day count in the headline at any distance', () => {
    for (const d of [174, 91, 90, 61, 45, 30, 12, 8, 7, 3, 1, 0, -3]) {
      const v = describeAt(d, 'expected');
      if (/\d/.test(v.headline)) {
        expect(v.headline).toMatch(/^About /);
      }
    }
  });

  it('marks a near unconfirmed date as an alarm, not a countdown', () => {
    const v = describeAt(5, 'expected');
    expect(v.band).toBe('unconfirmed_near');
    expect(v.value).toBe('Not confirmed');
    expect(v.headline).toBe('Exam date not confirmed yet');
    expect(v.tone).toBe('warning');
    expect(v.chip).toBe('Check');
    // The whole point: no digit-based day count anywhere in the headline.
    expect(v.headline).not.toMatch(/\d/);
  });

  it('keeps the alarm through exam day and the week after', () => {
    expect(describeAt(0, 'expected').band).toBe('unconfirmed_near');
    expect(describeAt(-3, 'expected').band).toBe('unconfirmed_near');
    // ... but retires it once it is clearly stale.
    expect(describeAt(-8, 'expected').visible).toBe(false);
  });

  it('never raises the alarm colour at distance', () => {
    for (const d of [174, 91, 61, 45, 31, 20, 8]) {
      expect(describeAt(d, 'expected').tone).toBe('neutral');
    }
  });

  it('prefixes the day chip with a tilde', () => {
    expect(describeAt(45, 'expected').chip).toBe('~45d');
    expect(describeAt(20, 'expected').chip).toBe('~20d');
  });

  it('passes the note through, and suppresses it when confirmed', () => {
    expect(describeAt(174, 'expected').note).toBe('NTA has not announced Session 1 yet.');
    expect(describeAt(174, 'confirmed').note).toBeNull();
  });
});

describe('labels', () => {
  it('composes a short label from the vocabulary maps', () => {
    expect(examShortLabel(target())).toBe('JEE Session 1');
    expect(examShortLabel(target({ exam_type: 'nata', phase: 'phase_1' }))).toBe('NATA Phase 1');
  });

  it('degrades gracefully with no phase or an unknown one', () => {
    expect(examShortLabel(target({ phase: null }))).toBe('JEE');
    expect(examShortLabel(target({ phase: 'session_9' }))).toBe('JEE');
    expect(examShortLabel(target({ exam_type: 'aat', phase: null }))).toBe('AAT');
  });

  it('does not depend on the staff label being filled in', () => {
    const v = describeExamCountdown(target({ label: null }), TODAY)!;
    expect(v.short_label).toBe('JEE Session 1');
  });
});

describe('null target', () => {
  it('returns null rather than an empty view', () => {
    expect(describeExamCountdown(null, TODAY)).toBeNull();
  });
});

// House content rule: no em dashes, en dashes or double hyphens in anything a
// student, parent or teacher can read. Enforced rather than remembered.
describe('content rules', () => {
  const distances = [174, 91, 90, 61, 60, 45, 31, 30, 12, 8, 7, 3, 1, 0, -1, -3, -7];
  const confidences: ExamCountdownConfidence[] = ['expected', 'confirmed'];

  it('produces no em dashes, en dashes or double hyphens', () => {
    for (const d of distances) {
      for (const confidence of confidences) {
        const v = describeAt(d, confidence);
        for (const s of [v.value, v.headline, v.detail, v.chip, v.short_label, v.note]) {
          if (s) expect(s, `d=${d} ${confidence}: ${s}`).not.toMatch(/[—–]|--/);
        }
      }
    }
  });

  it('always produces a non-empty value, headline and detail', () => {
    for (const d of distances) {
      for (const confidence of confidences) {
        const v = describeAt(d, confidence);
        expect(v.value.length, `d=${d} ${confidence}`).toBeGreaterThan(0);
        expect(v.headline.length).toBeGreaterThan(0);
        expect(v.detail.length).toBeGreaterThan(0);
      }
    }
  });
});
