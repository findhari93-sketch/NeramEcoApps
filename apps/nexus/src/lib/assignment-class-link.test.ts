import { describe, it, expect } from 'vitest';
import {
  buildClassLinkUpdate,
  buildClassUnlinkUpdate,
  normalizeTiming,
  istTodayStr,
} from './assignment-class-link';

const TODAY = '2026-09-01';

const cls = (scheduled_date: string, start_time: string | null = '19:00') => ({
  id: 'class-1',
  scheduled_date,
  start_time,
});

describe('buildClassLinkUpdate', () => {
  it('clamps class_date to today for a class in the future', () => {
    // A future class_date would pin the work to the top of every student's list
    // weeks early and can put personal_start after personal_due.
    const update = buildClassLinkUpdate(cls('2026-09-20'), 'homework', TODAY);
    expect(update.class_date).toBe(TODAY);
  });

  it('keeps the real class date for a class in the past', () => {
    const update = buildClassLinkUpdate(cls('2026-08-14'), 'homework', TODAY);
    expect(update.class_date).toBe('2026-08-14');
  });

  it("keeps today's date for a class happening today", () => {
    const update = buildClassLinkUpdate(cls(TODAY), 'homework', TODAY);
    expect(update.class_date).toBe(TODAY);
  });

  it('derives the prework deadline from the class start, in IST', () => {
    const update = buildClassLinkUpdate(cls('2026-08-20', '19:00'), 'prework', TODAY);
    // The +05:30 is load-bearing: parsed in the server zone (UTC on Vercel) this
    // would land 5.5 hours out, inside the class it was meant to precede.
    expect(update.due_at).toBe('2026-08-20T19:00:00+05:30');
  });

  it('treats a missing start_time as midnight rather than throwing', () => {
    const update = buildClassLinkUpdate(cls('2026-08-20', null), 'prework', TODAY);
    expect(update.due_at).toBe('2026-08-20T00:00:00+05:30');
  });

  it('leaves due_at alone for homework, so a chosen deadline survives linking', () => {
    const update = buildClassLinkUpdate(cls('2026-08-20'), 'homework', TODAY);
    expect(update.due_at).toBeUndefined();
  });

  it('derives the prework deadline from the CLASS day, not the clamped class_date', () => {
    // The two diverge for a future class, and the deadline must follow the class.
    const update = buildClassLinkUpdate(cls('2026-09-20', '19:00'), 'prework', TODAY);
    expect(update.class_date).toBe(TODAY);
    expect(update.due_at).toBe('2026-09-20T19:00:00+05:30');
  });

  it('carries the class id and timing through', () => {
    const update = buildClassLinkUpdate(cls('2026-08-20'), 'prework', TODAY);
    expect(update.scheduled_class_id).toBe('class-1');
    expect(update.timing).toBe('prework');
  });
});

describe('buildClassUnlinkUpdate', () => {
  it('only clears the class, so submissions and the chosen timing survive', () => {
    expect(buildClassUnlinkUpdate()).toEqual({ scheduled_class_id: null });
  });
});

describe('normalizeTiming', () => {
  it('accepts the one literal that means prework', () => {
    expect(normalizeTiming('prework')).toBe('prework');
  });

  it('falls back to homework for anything else', () => {
    for (const v of ['homework', 'HOMEWORK', 'Prework', '', null, undefined, 0, {}]) {
      expect(normalizeTiming(v)).toBe('homework');
    }
  });
});

describe('istTodayStr', () => {
  it('returns a YYYY-MM-DD day shifted into IST', () => {
    expect(istTodayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 20:00 UTC on the 1st is already the 2nd in IST (+05:30).
    const at = new Date('2026-09-01T20:00:00Z').getTime();
    expect(new Date(at + 5.5 * 3600_000).toISOString().slice(0, 10)).toBe('2026-09-02');
  });
});
