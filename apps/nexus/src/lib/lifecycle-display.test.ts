import { describe, it, expect } from 'vitest';
import {
  activityKindInfo,
  formatTargetExams,
  isMinorOn,
  nextTestimonialAllowedAt,
  presentTimeline,
  relativeTime,
  suggestDisplayName,
  testimonialYearOptions,
  type RawTimelineEntry,
} from './lifecycle-display';

const NOW = new Date('2026-09-26T12:00:00Z');

describe('isMinorOn', () => {
  it('treats an unknown or unreadable date of birth as a minor', () => {
    expect(isMinorOn(null, NOW)).toBe(true);
    expect(isMinorOn(undefined, NOW)).toBe(true);
    expect(isMinorOn('', NOW)).toBe(true);
    expect(isMinorOn('not a date', NOW)).toBe(true);
    expect(isMinorOn('2008-13-40', NOW)).toBe(true);
  });

  it('turns 18 on the birthday, not the day after', () => {
    expect(isMinorOn('2008-09-26', NOW)).toBe(false);
    expect(isMinorOn('2008-09-27', NOW)).toBe(true);
    expect(isMinorOn('2008-10-01', NOW)).toBe(true);
    expect(isMinorOn('2008-09-25', NOW)).toBe(false);
  });

  it('reads a timestamp form too', () => {
    expect(isMinorOn('1999-01-01T00:00:00+00:00', NOW)).toBe(false);
    expect(isMinorOn('2011-05-04', NOW)).toBe(true);
  });

  it('treats a date in the future as a typo, so a minor', () => {
    expect(isMinorOn('2030-01-01', NOW)).toBe(true);
  });
});

describe('nextTestimonialAllowedAt', () => {
  it('is null with no earlier submission', () => {
    expect(nextTestimonialAllowedAt(null, NOW)).toBeNull();
  });

  it('holds for 30 days after the last submission', () => {
    expect(nextTestimonialAllowedAt('2026-09-20T12:00:00Z', NOW)).toBe('2026-10-20T12:00:00.000Z');
    expect(nextTestimonialAllowedAt('2026-08-26T11:59:00Z', NOW)).toBeNull();
  });
});

describe('relativeTime', () => {
  it('words recent and old times', () => {
    expect(relativeTime('2026-09-26T11:59:40Z', NOW)).toBe('just now');
    expect(relativeTime('2026-09-26T11:55:00Z', NOW)).toBe('5 min ago');
    expect(relativeTime('2026-09-26T11:00:00Z', NOW)).toBe('1 hour ago');
    expect(relativeTime('2026-09-26T09:00:00Z', NOW)).toBe('3 hours ago');
    expect(relativeTime('2026-09-25T09:00:00Z', NOW)).toBe('yesterday');
    expect(relativeTime('2026-09-20T09:00:00Z', NOW)).toBe('6 days ago');
    expect(relativeTime('2026-07-20T09:00:00Z', NOW)).toBe('2 months ago');
    expect(relativeTime('2023-07-20T09:00:00Z', NOW)).toBe('3 years ago');
    expect(relativeTime(null, NOW)).toBe('Not recorded');
  });
});

describe('activityKindInfo', () => {
  it('gives every known kind its own icon and a spoken label', () => {
    for (const kind of ['sign_in', 'payment', 'demo', 'change', 'note', 'call', 'message', 'enrollment', 'classification', 'feedback', 'merge', 'account']) {
      const info = activityKindInfo(kind);
      expect(info.icon).toBe(kind);
      expect(info.label.length).toBeGreaterThan(0);
    }
  });

  it('refines event rows by their event name', () => {
    expect(activityKindInfo('event', 'tool_completed').icon).toBe('tool');
    expect(activityKindInfo('event', 'payment_started').icon).toBe('payment');
    expect(activityKindInfo('event', 'application_submitted').icon).toBe('application');
    expect(activityKindInfo('event', 'otp_verified').icon).toBe('sign_in');
    expect(activityKindInfo('event', 'review_submitted').icon).toBe('feedback');
    expect(activityKindInfo('event', 'something_new').icon).toBe('event');
  });

  it('falls back to a generic icon for a kind it has not met', () => {
    expect(activityKindInfo('brand_new_kind')).toEqual({ icon: 'event', label: 'Activity' });
    expect(activityKindInfo(null)).toEqual({ icon: 'event', label: 'Activity' });
  });
});

describe('presentTimeline', () => {
  const rows: RawTimelineEntry[] = [
    { occurred_at: '2026-09-25T10:00:00Z', kind: 'payment', title: 'Paid', detail: { amount: 25000, receipt: 'R1' }, actor_id: 's1', actor_name: 'Hari', source_app: null },
    { occurred_at: '2026-09-24T10:00:00Z', kind: 'event', title: 'payment_completed', detail: { status: 'completed' }, actor_id: null, source_app: 'app' },
    { occurred_at: '2026-09-23T10:00:00Z', kind: 'note', title: 'Staff note', detail: { note: 'Asked for a fee discount' }, actor_id: 's1', actor_name: 'Hari', source_app: 'admin' },
    { occurred_at: '2026-09-22T10:00:00Z', kind: 'event', title: 'tool_completed', detail: { status: 'completed' }, actor_id: null, source_app: 'app' },
    { occurred_at: '2026-09-21T10:00:00Z', kind: 'enrollment', title: 'Added to a classroom', detail: { classroom: 'NATA 2027' }, actor_id: 's2', actor_name: null, source_app: 'nexus' },
  ];

  it('drops money and CRM notes for a caller without the fee capability', () => {
    const out = presentTimeline(rows, { canSeeFinance: false });
    expect(out.map((r) => r.kind)).toEqual(['event', 'enrollment']);
    expect(JSON.stringify(out)).not.toContain('25000');
    expect(JSON.stringify(out)).not.toContain('discount');
  });

  it('keeps them, with the amount worded, for a finance-capable caller', () => {
    const out = presentTimeline(rows, { canSeeFinance: true });
    expect(out).toHaveLength(5);
    expect(out[0].detail).toBe('Rs 25,000');
    expect(out[0].actor_name).toBe('Hari');
  });

  it('labels event rows, names staff actors and never ships the raw detail object', () => {
    const out = presentTimeline(rows, { canSeeFinance: false, eventLabels: { tool_completed: 'Used a tool' } });
    const tool = out.find((r) => r.kind === 'event')!;
    expect(tool.title).toBe('Used a tool');
    expect(tool.event).toBe('tool_completed');
    expect(tool.actor_name).toBeNull();
    const enrol = out.find((r) => r.kind === 'enrollment')!;
    expect(enrol.detail).toBe('NATA 2027');
    expect(enrol.actor_name).toBe('A staff member');
    expect(Object.keys(enrol)).not.toContain('actor_id');
  });

  it('humanises an event name it has no label for', () => {
    const out = presentTimeline(
      [{ occurred_at: '2026-09-22T10:00:00Z', kind: 'event', title: 'course_page_viewed', detail: null, actor_id: null, source_app: 'marketing' }],
      { canSeeFinance: false },
    );
    expect(out[0].title).toBe('Course page viewed');
  });
});

describe('form helpers', () => {
  it('suggests a first name and initial', () => {
    expect(suggestDisplayName('Priya Sharma')).toBe('Priya S.');
    expect(suggestDisplayName('  Asha  ')).toBe('Asha');
    expect(suggestDisplayName('Mohamed Ali khan')).toBe('Mohamed K.');
    expect(suggestDisplayName(null)).toBe('');
  });

  it('offers years inside what the validator accepts', () => {
    const years = testimonialYearOptions(NOW);
    expect(years[0]).toBe(2028);
    expect(years[years.length - 1]).toBe(2020);
    expect(years.every((y) => y >= 2015 && y <= 2028)).toBe(true);
  });

  it('words target exams without repeats', () => {
    expect(formatTargetExams(['JEE', 'NATA'])).toBe('JEE Paper 2, NATA');
    expect(formatTargetExams(['nata', 'NATA'])).toBe('NATA');
    expect(formatTargetExams([])).toBeNull();
    expect(formatTargetExams(null)).toBeNull();
  });
});
