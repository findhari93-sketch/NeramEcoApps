// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { AwayWindow } from '@/lib/away-windows';
import { awayOn, istDay } from './away-today';

const window = (over: Partial<AwayWindow>): AwayWindow => ({
  id: 'w1',
  student_id: 's1',
  starts_on: '2026-10-01',
  ends_on: '2026-10-12',
  reason_code: 'clash',
  reason_note: null,
  source: 'student',
  cancelled_at: null,
  created_at: '2026-09-30T10:00:00Z',
  ...over,
});

const roster = { ids: ['s1', 's2', 's3'], names: { s1: 'Asha', s2: 'Bala', s3: 'Chitra' } };

describe('istDay', () => {
  it('is the Indian calendar day, which is ahead of UTC in the evening', () => {
    expect(istDay('2026-10-04T13:26:00Z')).toBe('2026-10-04');
    expect(istDay('2026-10-04T19:00:00Z')).toBe('2026-10-05');
  });

  it('falls back to now for a missing or broken instant', () => {
    const now = new Date('2026-10-04T05:00:00Z');
    expect(istDay(null, now)).toBe('2026-10-04');
    expect(istDay('not a date', now)).toBe('2026-10-04');
  });
});

describe('awayOn', () => {
  it('lists roster students a standing window covers on the day, in roster order', () => {
    const away = awayOn(
      roster,
      [
        window({ id: 'a', student_id: 's3', ends_on: null, starts_on: '2026-09-20' }),
        window({ id: 'b', student_id: 's1' }),
        window({ id: 'c', student_id: 's2', cancelled_at: '2026-10-02T00:00:00Z' }),
        window({ id: 'd', student_id: 'not-on-roster' }),
      ],
      '2026-10-04',
    );
    expect(away).toEqual([
      { student_id: 's1', name: 'Asha', reason_code: 'clash', label: 'Away until 12 Oct' },
      { student_id: 's3', name: 'Chitra', reason_code: 'clash', label: 'Away since 20 Sep, no return date yet' },
    ]);
  });

  it('counts nobody on a day outside every window', () => {
    expect(awayOn(roster, [window({})], '2026-10-13')).toEqual([]);
  });
});
