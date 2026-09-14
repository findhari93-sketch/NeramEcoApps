import { describe, it, expect } from 'vitest';
import {
  celebrationInfo,
  celebrationState,
  isDueCelebration,
  latestCelebrationByStudent,
  type CelebrationRow,
} from './catchup-celebration';

function celebration(over: Partial<CelebrationRow> = {}): CelebrationRow {
  return {
    id: 'c1',
    student_id: 's1',
    source: 'teams',
    last_cleared_at: '2026-09-09T04:30:00+00:00',
    celebrated_at: '2026-09-10T06:00:00+00:00',
    ...over,
  };
}

describe('celebrationState', () => {
  it('is new for a student who was never congratulated', () => {
    expect(celebrationState('2026-09-09T10:00:00+05:30', null)).toBe('new');
  });

  it('is congratulated when nothing has been cleared since', () => {
    // Same instant, written in IST by the standing and in UTC by Postgres. As
    // strings these sort the wrong way round, which is the bug this guards.
    expect(celebrationState('2026-09-09T10:00:00+05:30', celebration())).toBe('congratulated');
  });

  it('is cleared_again when they cleared another class after the congratulation', () => {
    expect(celebrationState('2026-09-12T10:00:00+05:30', celebration())).toBe('cleared_again');
  });

  it('uses the snapshot, not the post time, so a clear just before the post still counts', () => {
    // Cleared at 10:59 IST, congratulated at 11:30 IST. The snapshot holds 10:59.
    const row = celebration({
      last_cleared_at: '2026-09-10T05:29:00+00:00',
      celebrated_at: '2026-09-10T06:00:00+00:00',
    });
    expect(celebrationState('2026-09-10T10:59:00+05:30', row)).toBe('congratulated');
  });

  it('keeps a never-missed student congratulated, since they have nothing new to clear', () => {
    expect(celebrationState(null, celebration({ last_cleared_at: null }))).toBe('congratulated');
  });

  it('treats a snapshot of nothing followed by a real clear as cleared_again', () => {
    expect(
      celebrationState('2026-09-12T10:00:00+05:30', celebration({ last_cleared_at: null })),
    ).toBe('cleared_again');
  });
});

describe('latestCelebrationByStudent', () => {
  it('keeps the newest row per student and counts them all, whatever the input order', () => {
    const map = latestCelebrationByStudent([
      celebration({ id: 'old', celebrated_at: '2026-09-01T06:00:00+00:00' }),
      celebration({ id: 'newest', celebrated_at: '2026-09-11T06:00:00+00:00' }),
      celebration({ id: 'mid', celebrated_at: '2026-09-05T06:00:00+00:00' }),
      celebration({ id: 'other', student_id: 's2' }),
    ]);
    expect(map.get('s1')?.latest.id).toBe('newest');
    expect(map.get('s1')?.count).toBe(3);
    expect(map.get('s2')?.count).toBe(1);
  });
});

describe('celebrationInfo and isDueCelebration', () => {
  it('returns null for nobody, which counts as due', () => {
    const info = celebrationInfo('2026-09-09T10:00:00+05:30', undefined);
    expect(info).toBeNull();
    expect(isDueCelebration(info)).toBe(true);
  });

  it('is not due when already congratulated, and due again after a new clear', () => {
    const entry = { latest: celebration({ source: 'marked' }), count: 2 };
    const done = celebrationInfo('2026-09-09T10:00:00+05:30', entry);
    expect(done).toEqual({
      state: 'congratulated',
      lastAt: '2026-09-10T06:00:00+00:00',
      source: 'marked',
      count: 2,
    });
    expect(isDueCelebration(done)).toBe(false);

    const again = celebrationInfo('2026-09-13T10:00:00+05:30', entry);
    expect(again?.state).toBe('cleared_again');
    expect(isDueCelebration(again)).toBe(true);
  });
});
