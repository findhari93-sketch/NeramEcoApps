import { describe, expect, it } from 'vitest';
import type { CalendarClass } from '@/lib/catchup-calendar';
import {
  CATCHUP_RANGE_MAX_SPAN,
  catchupHref,
  catchupSentence,
  catchupTone,
  hasCatchupNews,
  indexCatchup,
  splitCatchupRange,
} from './catchup-badge';

function cls(over: Partial<CalendarClass> = {}): CalendarClass {
  return {
    id: 'c1',
    title: 'Perspective drawing',
    scheduled_date: '2026-09-10',
    start_time: '19:00:00',
    present: 20,
    missed: 3,
    late_joiners: 0,
    caughtUp: 1,
    outstanding: 2,
    blocked: 0,
    recap_state: 'published',
    recap_id: 'r1',
    has_transcript: true,
    teams_meeting_id: 'm1',
    not_taught: false,
    health: 'catching_up',
    ...over,
  };
}

describe('hasCatchupNews', () => {
  it('never badges an upcoming class', () => {
    expect(hasCatchupNews(cls({ health: 'upcoming' }))).toBe(false);
  });

  it('skips an all caught up class that nobody missed', () => {
    expect(
      hasCatchupNews(cls({ health: 'all_caught_up', missed: 0, late_joiners: 0, outstanding: 0 })),
    ).toBe(false);
  });

  it('keeps an all caught up class that somebody did miss', () => {
    expect(hasCatchupNews(cls({ health: 'all_caught_up', missed: 2, outstanding: 0 }))).toBe(true);
    expect(
      hasCatchupNews(cls({ health: 'all_caught_up', missed: 0, late_joiners: 1, outstanding: 0 })),
    ).toBe(true);
  });

  it('badges catching up, recap missing and not taught', () => {
    expect(hasCatchupNews(cls())).toBe(true);
    expect(hasCatchupNews(cls({ health: 'recap_missing', blocked: 2 }))).toBe(true);
    expect(hasCatchupNews(cls({ health: 'not_taught' }))).toBe(true);
  });
});

describe('indexCatchup', () => {
  it('keys only the classes that earn a badge', () => {
    const map = indexCatchup([
      cls({ id: 'a' }),
      cls({ id: 'b', health: 'upcoming' }),
      cls({ id: 'c', health: 'all_caught_up', missed: 0, late_joiners: 0 }),
    ]);
    expect([...map.keys()]).toEqual(['a']);
  });

  it('copes with no data', () => {
    expect(indexCatchup(undefined).size).toBe(0);
    expect(indexCatchup(null).size).toBe(0);
  });
});

describe('catchupHref', () => {
  it('opens the class on the Catch-up calendar for its own month', () => {
    expect(catchupHref(cls({ id: 'abc', scheduled_date: '2026-08-31' }))).toBe(
      '/teacher/catch-up?view=calendar&month=2026-08&class=abc&from=timetable',
    );
  });
});

describe('catchupSentence and catchupTone', () => {
  it('reads the same words the chip shows', () => {
    expect(catchupSentence(cls())).toBe('Catch-up: 2 to catch up');
    expect(catchupSentence(cls({ health: 'recap_missing', blocked: 1 }))).toBe(
      'Catch-up: Recap missing, 1 waiting',
    );
  });

  it('maps health to a tone', () => {
    expect(catchupTone(cls({ health: 'recap_missing' }))).toBe('error');
    expect(catchupTone(cls({ health: 'catching_up' }))).toBe('warning');
    expect(catchupTone(cls({ health: 'all_caught_up' }))).toBe('success');
    expect(catchupTone(cls({ health: 'not_taught' }))).toBe('neutral');
  });
});

describe('splitCatchupRange', () => {
  it('keeps a week or a month grid in one request', () => {
    expect(splitCatchupRange('2026-09-21', '2026-09-27')).toEqual([
      { from: '2026-09-21', to: '2026-09-27' },
    ]);
    // A six-week month grid: 42 days.
    expect(splitCatchupRange('2026-08-31', '2026-10-11')).toEqual([
      { from: '2026-08-31', to: '2026-10-11' },
    ]);
  });

  it('splits a wider range into contiguous pieces the endpoint accepts', () => {
    const parts = splitCatchupRange('2026-01-01', '2026-03-31');
    expect(parts[0].from).toBe('2026-01-01');
    expect(parts[parts.length - 1].to).toBe('2026-03-31');
    for (let i = 0; i < parts.length; i++) {
      const span =
        (Date.parse(`${parts[i].to}T00:00:00Z`) - Date.parse(`${parts[i].from}T00:00:00Z`)) /
        86_400_000;
      expect(span).toBeLessThanOrEqual(CATCHUP_RANGE_MAX_SPAN);
      if (i > 0) {
        const gap =
          (Date.parse(`${parts[i].from}T00:00:00Z`) - Date.parse(`${parts[i - 1].to}T00:00:00Z`)) /
          86_400_000;
        expect(gap).toBe(1);
      }
    }
  });

  it('returns nothing for an empty or reversed range', () => {
    expect(splitCatchupRange('', '2026-09-01')).toEqual([]);
    expect(splitCatchupRange('2026-09-10', '2026-09-01')).toEqual([]);
  });

  it('handles a single day', () => {
    expect(splitCatchupRange('2026-09-10', '2026-09-10')).toEqual([
      { from: '2026-09-10', to: '2026-09-10' },
    ]);
  });
});
