import { describe, it, expect } from 'vitest';
import {
  computeFlow,
  toFlowEntries,
  isClassDay,
  addDays,
  dayOfWeek,
  type FlowEntryInput,
} from './plan-flow';

// 2026-01-05 is a Monday.
const START = '2026-01-05';

let nextPos = 0;
function entry(overrides: Partial<FlowEntryInput> = {}): FlowEntryInput {
  nextPos += 1024;
  return {
    id: overrides.id ?? `e${nextPos}`,
    entryType: 'live_class',
    position: nextPos,
    pinnedDate: null,
    sessionSpan: 1,
    completedSessions: 0,
    status: 'planned',
    ...overrides,
  };
}

function opts(overrides: Partial<Parameters<typeof computeFlow>[1]> = {}) {
  return { startDate: START, saturdayClasses: true, today: '2026-01-01', ...overrides };
}

describe('calendar basics', () => {
  it('knows weekdays', () => {
    expect(dayOfWeek('2026-01-05')).toBe(1); // Mon
    expect(dayOfWeek('2026-01-04')).toBe(0); // Sun
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('skips Sundays always and Saturdays only when off', () => {
    expect(isClassDay('2026-01-04', { saturdayClasses: true })).toBe(false); // Sun
    expect(isClassDay('2026-01-10', { saturdayClasses: true })).toBe(true); // Sat
    expect(isClassDay('2026-01-10', { saturdayClasses: false })).toBe(false);
    expect(isClassDay('2026-01-06', { saturdayClasses: false, holidays: ['2026-01-06'] })).toBe(
      false,
    );
  });
});

describe('computeFlow', () => {
  it('returns an empty flow for an empty plan', () => {
    const flow = computeFlow([], opts());
    expect(flow.days).toHaveLength(0);
    expect(flow.computedEndDate).toBeNull();
    expect(flow.behindBy).toBe(0);
    expect(flow.minInsertIndex).toBe(0);
  });

  it('lays entries onto consecutive class days, skipping Sunday', () => {
    nextPos = 0;
    const e1 = entry({ id: 'a' });
    const e2 = entry({ id: 'b' });
    const e3 = entry({ id: 'c' });
    // Mon 5 .. Sat 10 are class days, Sun 11 is not.
    const flow = computeFlow([e1, e2, e3], opts());
    expect(flow.entryDates.get('a')).toEqual(['2026-01-05']);
    expect(flow.entryDates.get('b')).toEqual(['2026-01-06']);
    expect(flow.entryDates.get('c')).toEqual(['2026-01-07']);
    expect(flow.computedEndDate).toBe('2026-01-07');
  });

  it('rolls a full week over Sunday', () => {
    nextPos = 0;
    const entries = Array.from({ length: 7 }, (_, i) => entry({ id: `e${i}` }));
    const flow = computeFlow(entries, opts());
    // Mon 5, Tue 6, Wed 7, Thu 8, Fri 9, Sat 10, then Sun 11 skipped -> Mon 12.
    expect(flow.entryDates.get('e5')).toEqual(['2026-01-10']);
    expect(flow.entryDates.get('e6')).toEqual(['2026-01-12']);
  });

  it('skips Saturdays when saturday_classes is off', () => {
    nextPos = 0;
    const entries = Array.from({ length: 6 }, (_, i) => entry({ id: `e${i}` }));
    const flow = computeFlow(entries, opts({ saturdayClasses: false }));
    expect(flow.entryDates.get('e4')).toEqual(['2026-01-09']); // Fri
    expect(flow.entryDates.get('e5')).toEqual(['2026-01-12']); // Mon (Sat+Sun skipped)
  });

  it('multi-session entries consume consecutive class days with day k of N', () => {
    nextPos = 0;
    const big = entry({ id: 'big', sessionSpan: 3 });
    const after = entry({ id: 'after' });
    const flow = computeFlow([big, after], opts());
    expect(flow.entryDates.get('big')).toEqual(['2026-01-05', '2026-01-06', '2026-01-07']);
    expect(flow.entryDates.get('after')).toEqual(['2026-01-08']);
    const day2 = flow.days.find((d) => d.date === '2026-01-06')!;
    expect(day2.sessionIndex).toBe(1);
    expect(day2.sessionCount).toBe(3);
  });

  it('reserves pinned test dates and flows topics around them', () => {
    nextPos = 0;
    const t1 = entry({ id: 't1' });
    const test = entry({ id: 'test', entryType: 'test', pinnedDate: '2026-01-06' });
    const t2 = entry({ id: 't2' });
    const flow = computeFlow([t1, test, t2], opts());
    expect(flow.entryDates.get('t1')).toEqual(['2026-01-05']);
    expect(flow.entryDates.get('test')).toEqual(['2026-01-06']);
    expect(flow.entryDates.get('t2')).toEqual(['2026-01-07']);
    expect(flow.days.find((d) => d.date === '2026-01-06')!.isTest).toBe(true);
  });

  it('emits free days between the queue end and the last pinned test', () => {
    nextPos = 0;
    const t1 = entry({ id: 't1' });
    const test = entry({ id: 'test', entryType: 'test', pinnedDate: '2026-01-08' });
    const flow = computeFlow([t1, test], opts());
    const free = flow.days.filter((d) => d.entryId === null);
    expect(free.map((d) => d.date)).toEqual(['2026-01-06', '2026-01-07']);
  });

  it('self_learning and skipped entries consume zero days', () => {
    nextPos = 0;
    const a = entry({ id: 'a' });
    const sl = entry({ id: 'sl', entryType: 'self_learning' });
    const skip = entry({ id: 'skip', status: 'skipped' });
    const b = entry({ id: 'b' });
    const flow = computeFlow([a, sl, skip, b], opts());
    expect(flow.entryDates.get('sl')).toEqual([]);
    expect(flow.entryDates.get('skip')).toEqual([]);
    expect(flow.entryDates.get('b')).toEqual(['2026-01-06']);
  });

  it('locks entries that started on or before today and sets minInsertIndex', () => {
    nextPos = 0;
    const a = entry({ id: 'a' }); // Mon 5 (past)
    const b = entry({ id: 'b', sessionSpan: 2 }); // Tue 6 + Wed 7 (today = Wed 7)
    const c = entry({ id: 'c' }); // Thu 8 (future)
    const flow = computeFlow([a, b, c], opts({ today: '2026-01-07' }));
    expect(flow.lockedEntryIds.has('a')).toBe(true);
    expect(flow.lockedEntryIds.has('b')).toBe(true);
    expect(flow.lockedEntryIds.has('c')).toBe(false);
    expect(flow.minInsertIndex).toBe(2);
    expect(flow.days.find((d) => d.date === '2026-01-07')!.isToday).toBe(true);
    expect(flow.days.find((d) => d.date === '2026-01-05')!.locked).toBe(true);
  });

  it('counts uncovered past sessions as behindBy', () => {
    nextPos = 0;
    const covered = entry({ id: 'cov', completedSessions: 1 }); // Mon 5, logged
    const missed = entry({ id: 'miss', sessionSpan: 2 }); // Tue 6 + Wed 7, nothing logged
    const future = entry({ id: 'fut' }); // Thu 8
    const flow = computeFlow([covered, missed, future], opts({ today: '2026-01-08' }));
    expect(flow.behindBy).toBe(2);
  });

  it('covered days reflect completed_sessions per session index', () => {
    nextPos = 0;
    const e = entry({ id: 'e', sessionSpan: 2, completedSessions: 1 });
    const flow = computeFlow([e], opts({ today: '2026-01-07' }));
    expect(flow.days.find((d) => d.date === '2026-01-05')!.isCovered).toBe(true);
    expect(flow.days.find((d) => d.date === '2026-01-06')!.isCovered).toBe(false);
  });

  it('flags entries that will not fit before a pinned test', () => {
    nextPos = 0;
    const a = entry({ id: 'a', sessionSpan: 2 }); // Mon 5 + Tue 6
    const b = entry({ id: 'b', sessionSpan: 2 }); // Wed 7 + Thu 8 -> ends after the test
    const test = entry({ id: 'test', entryType: 'test', pinnedDate: '2026-01-07' });
    const flow = computeFlow([a, b, test], opts());
    // Pinned Wed 7 pushes b to Thu 8 + Fri 9.
    expect(flow.entryDates.get('b')).toEqual(['2026-01-08', '2026-01-09']);
    expect(flow.wontFit).toEqual([{ testEntryId: 'test', entryIds: ['b'] }]);
  });

  it('handles 100+ entries within the day cap', () => {
    nextPos = 0;
    const entries = Array.from({ length: 120 }, (_, i) => entry({ id: `e${i}` }));
    const flow = computeFlow(entries, opts());
    expect(flow.entryDates.get('e119')!.length).toBe(1);
    expect(flow.computedEndDate).not.toBeNull();
  });
});

describe('toFlowEntries', () => {
  it('resolves span from entry override, then topic estimate, then 1', () => {
    const [a, b, c] = toFlowEntries([
      {
        id: 'a',
        entry_type: 'live_class',
        position: 1,
        planned_date: null,
        session_span: 3,
        completed_sessions: 0,
        status: 'planned',
        topic: { estimated_sessions: 2 },
      },
      {
        id: 'b',
        entry_type: 'live_class',
        position: 2,
        planned_date: null,
        session_span: null,
        completed_sessions: 0,
        status: 'planned',
        topic: { estimated_sessions: 2 },
      },
      {
        id: 'c',
        entry_type: 'live_class',
        position: 3,
        planned_date: null,
        session_span: null,
        completed_sessions: 0,
        status: 'planned',
        topic: null,
      },
    ]);
    expect(a.sessionSpan).toBe(3);
    expect(b.sessionSpan).toBe(2);
    expect(c.sessionSpan).toBe(1);
  });

  it('only tests keep a pinned date', () => {
    const [t, l] = toFlowEntries([
      {
        id: 't',
        entry_type: 'test',
        position: 1,
        planned_date: '2026-02-02',
        session_span: null,
        completed_sessions: 0,
        status: 'planned',
      },
      {
        id: 'l',
        entry_type: 'live_class',
        position: 2,
        planned_date: '2026-02-03',
        session_span: null,
        completed_sessions: 0,
        status: 'planned',
      },
    ]);
    expect(t.pinnedDate).toBe('2026-02-02');
    expect(l.pinnedDate).toBeNull();
  });
});
