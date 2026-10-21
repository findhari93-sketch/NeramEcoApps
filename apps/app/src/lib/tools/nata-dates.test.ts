import { describe, it, expect } from 'vitest';
import { nataDates } from './nata-dates';

describe('NATA dates for the chat', () => {
  it('says the new cycle is not announced once last year is over', () => {
    const d = nataDates(new Date('2026-10-20T06:00:00Z'));
    expect(d).toMatchObject({ cycleYear: 2027, scheduleYear: 2026, announced: false, upcoming: [] });
    expect(d.phases).toEqual([
      { phase: 'Phase 1', from: '2026-04-04', to: '2026-06-13', days: 20 },
      { phase: 'Phase 2', from: '2026-08-07', to: '2026-08-08', days: 2 },
    ]);
  });

  it('lists the next sessions while the schedule is current', () => {
    const d = nataDates(new Date('2026-05-28T06:00:00Z'));
    expect(d.announced).toBe(true);
    expect(d.upcoming[0]).toMatchObject({ date: '2026-05-29', day: 'Friday', phase: 'Phase 1' });
    expect(d.upcoming).toHaveLength(6);
  });
});
