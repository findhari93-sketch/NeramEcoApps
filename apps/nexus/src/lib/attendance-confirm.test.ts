import { describe, expect, it } from 'vitest';
import {
  ASK_CHANCE_BELOW,
  askedRecently,
  confirmStatusOf,
  confirmSummaryLabel,
  defaultAskMessage,
  pickAskList,
  whenLabel,
} from './attendance-confirm';
import type { ForecastStudent } from './class-forecast';
import type { RsvpDaySummary } from '@/app/api/timetable/rsvp-dashboard/route';

const TODAY = '2026-10-19';
const LONG_AGO = '2025-01-10T09:00:00Z';

const student = (id: string, present: number, over: Partial<ForecastStudent> = {}): ForecastStudent => ({
  id,
  name: id,
  avatar_url: null,
  batch_id: null,
  enrolled_at: LONG_AGO,
  present,
  counted: 10,
  away: 0,
  standing: 'keeping_up',
  ...over,
});

const day = (over: Partial<RsvpDaySummary> = {}) => ({
  date: '2026-10-20',
  class_ids: ['c1'],
  away_ids: [] as string[],
  declined_ids: [] as string[],
  confirmed_ids: [] as string[],
  ...over,
});

describe('confirmStatusOf', () => {
  const none = { away: false, declined: false, confirmedAt: null, askedAt: null };

  it('reads away before anything else', () => {
    expect(confirmStatusOf({ ...none, away: true, declined: true, confirmedAt: 'x', askedAt: 'x' })).toBe('away');
  });

  it('lets a reason outrank an earlier yes', () => {
    expect(confirmStatusOf({ ...none, declined: true, confirmedAt: 'x' })).toBe('not_coming');
  });

  it('separates a yes, an unanswered ask and never asked', () => {
    expect(confirmStatusOf({ ...none, confirmedAt: 'x', askedAt: 'x' })).toBe('coming');
    expect(confirmStatusOf({ ...none, askedAt: 'x' })).toBe('no_reply');
    expect(confirmStatusOf(none)).toBe('not_asked');
  });
});

describe('pickAskList', () => {
  // Twenty regulars so the room's base rate is high and the shrinkage does not
  // drag the patchy students towards the average.
  const regulars = Array.from({ length: 20 }, (_, i) => student(`ok${i}`, 10));

  it('ticks only students under the bar, worst first', () => {
    const roster = [...regulars, student('half', 5), student('rare', 1), student('most', 8)];
    const picked = pickAskList({ day: day(), classes: [], students: roster, today: TODAY });
    expect(picked.map((p) => p.id)).toEqual(['rare', 'half']);
    expect(picked.every((p) => p.chance < ASK_CHANCE_BELOW)).toBe(true);
  });

  it('leaves out the away, the declined, the confirmed and newcomers', () => {
    const roster = [
      ...regulars,
      student('away', 1),
      student('declined', 1),
      student('confirmed', 1),
      student('new', 0, { enrolled_at: '2026-10-15T09:00:00Z', counted: 1 }),
      student('ask', 1),
    ];
    const picked = pickAskList({
      day: day({ away_ids: ['away'], declined_ids: ['declined'], confirmed_ids: ['confirmed'] }),
      classes: [],
      students: roster,
      today: TODAY,
    });
    expect(picked.map((p) => p.id)).toEqual(['ask']);
  });

  it('is empty without attendance records', () => {
    expect(pickAskList({ day: day(), classes: [], students: null, today: TODAY })).toEqual([]);
  });
});

describe('wording', () => {
  it('says today, tomorrow or the date', () => {
    expect(whenLabel('2026-10-19', '19:00', TODAY)).toBe('today at 7 PM');
    expect(whenLabel('2026-10-20', '19:30', TODAY)).toBe('tomorrow at 7:30 PM');
    expect(whenLabel('2026-10-23', '19:00', TODAY)).toMatch(/^on Fri 23 Oct at 7 PM$/);
  });

  it('keeps the first-name token for sendNudge and states the rule', () => {
    const text = defaultAskMessage({ classTitle: 'Building materials', whenLabel: 'today at 7 PM' });
    expect(text).toContain('{firstName}');
    expect(text).toContain('Building materials today at 7 PM');
    expect(text).toMatch(/without telling us is not/);
    expect(text).not.toMatch(/\u2014|--/);
  });

  it('summarises answers and drops zeroes', () => {
    expect(confirmSummaryLabel(6, 3)).toBe('6 confirmed, 3 no reply');
    expect(confirmSummaryLabel(0, 2)).toBe('2 no reply');
    expect(confirmSummaryLabel(0, 0)).toBe('');
  });
});

describe('askedRecently', () => {
  const now = Date.parse('2026-10-19T12:00:00Z');
  it('skips a repeat inside three hours', () => {
    expect(askedRecently('2026-10-19T10:00:00Z', now)).toBe(true);
    expect(askedRecently('2026-10-19T08:00:00Z', now)).toBe(false);
    expect(askedRecently(null, now)).toBe(false);
  });
});
