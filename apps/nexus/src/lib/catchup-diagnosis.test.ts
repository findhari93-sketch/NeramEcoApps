import { describe, it, expect } from 'vitest';
import {
  diagnoseStudent,
  describeItemProgress,
  istYmd,
  DIAGNOSIS_ORDER,
  type DiagItem,
} from './catchup-diagnosis';

const TODAY = '2026-09-24';

function item(over: Partial<DiagItem> = {}): DiagItem {
  return {
    id: 'i1',
    status: 'waiting',
    active: false,
    overdue: false,
    days_left: null,
    activated_on: null,
    watched: false,
    assignments_outstanding: 0,
    has_test: false,
    test_passed: false,
    title: 'Pritzker Prize',
    scheduled_date: '2026-09-11',
    activity: null,
    test: null,
    ...over,
  };
}

const run = (items: DiagItem[], extra: Partial<Parameters<typeof diagnoseStudent>[0]> = {}) =>
  diagnoseStudent({
    items,
    openCount: items.filter((i) => i.status === 'active' || i.status === 'waiting').length,
    blockedOnUs: items.filter((i) => i.status === 'blocked' || i.status === 'pending_teacher').length,
    today: TODAY,
    ...extra,
  });

describe('diagnoseStudent', () => {
  it('all clear when nothing is owed', () => {
    expect(run([item({ status: 'done' })]).state).toBe('all_clear');
  });

  it('waiting on us when only our work is missing', () => {
    const d = run([item({ status: 'pending_teacher' })]);
    expect(d.state).toBe('waiting_on_us');
    expect(d.sentence).toContain('1 class');
  });

  it('not started names the one class and how long ago', () => {
    const d = run([item()]);
    expect(d.state).toBe('not_started');
    expect(d.sentence).toBe('Has not opened "Pritzker Prize" (11 Sep, 13 days ago).');
  });

  it('not started across several classes names the oldest', () => {
    const d = run([item({ id: 'b', scheduled_date: '2026-09-15' }), item({ id: 'a' })]);
    expect(d.state).toBe('not_started');
    expect(d.sentence).toContain('any of 2 missed classes');
    expect(d.sentence).toContain('11 Sep');
    expect(d.focusItemId).toBe('a');
  });

  it('a queue of unopened classes behind an active one is not "not started"', () => {
    const d = run([
      item({ id: 'a', active: true, status: 'active', activated_on: '2026-09-23', activity: { watchedPct: 30, startedAt: '2026-09-23T10:00:00Z', lastActiveAt: '2026-09-23T10:30:00Z', activeDays: 1, checkpoint: null } }),
      item({ id: 'b', scheduled_date: '2026-09-15' }),
    ]);
    expect(d.state).toBe('on_track');
    expect(d.sentence).toContain('30% watched, 1 sitting');
    expect(d.sentence).toContain('1 more class after this.');
  });

  it('stopped when a started class has had no activity for 3+ days', () => {
    const d = run([
      item({ active: true, status: 'active', activated_on: '2026-09-15', activity: { watchedPct: 40, startedAt: '2026-09-15T10:00:00Z', lastActiveAt: '2026-09-19T10:00:00Z', activeDays: 2, checkpoint: null } }),
    ]);
    expect(d.state).toBe('stopped');
    expect(d.sentence).toBe('Started "Pritzker Prize" at 40% watched, 2 sittings, no activity for 5 days.');
  });

  it('stopped when the clock started but nothing was ever watched', () => {
    const d = run([item({ active: true, status: 'active', activated_on: '2026-09-18' })]);
    expect(d.state).toBe('stopped');
    expect(d.sentence).toContain('nothing watched yet');
  });

  it('stopped when nothing runs now but something was opened before', () => {
    const d = run([
      item({ id: 'a', activity: { watchedPct: 20, startedAt: '2026-09-12T10:00:00Z', lastActiveAt: '2026-09-12T10:00:00Z', activeDays: null, checkpoint: null } }),
      item({ id: 'b', scheduled_date: '2026-09-15' }),
    ]);
    expect(d.state).toBe('stopped');
    expect(d.sentence).toContain('Stopped on "Pritzker Prize" at 20% watched, last active 12 days ago. 2 classes left.');
  });

  it('stuck after repeated checkpoint failures, even if recently active', () => {
    const d = run([
      item({ active: true, status: 'active', activated_on: '2026-09-22', activity: { watchedPct: 50, startedAt: '2026-09-22T10:00:00Z', lastActiveAt: '2026-09-24T05:00:00Z', activeDays: 2, checkpoint: { sectionNo: 2, fails: 3 } } }),
    ]);
    expect(d.state).toBe('stuck');
    expect(d.sentence).toBe('Failed the section 2 check on "Pritzker Prize" 3 times in a row.');
  });

  it('one failed checkpoint is not stuck', () => {
    const d = run([
      item({ active: true, status: 'active', activated_on: '2026-09-23', activity: { watchedPct: 50, startedAt: '2026-09-23T10:00:00Z', lastActiveAt: '2026-09-24T05:00:00Z', activeDays: 1, checkpoint: { sectionNo: 2, fails: 1 } } }),
    ]);
    expect(d.state).toBe('on_track');
  });

  it('stuck on a failed class test', () => {
    const d = run([
      item({ active: true, status: 'active', activated_on: '2026-09-22', watched: true, has_test: true, test: { attempts: 2, lastPct: 60, bestPct: 70 }, activity: { watchedPct: 100, startedAt: '2026-09-22T10:00:00Z', lastActiveAt: '2026-09-24T05:00:00Z', activeDays: 2, checkpoint: null } }),
    ]);
    expect(d.state).toBe('stuck');
    expect(d.sentence).toContain('Scored 60%');
    expect(d.sentence).toContain('2 tries');
  });

  it('over time while still active', () => {
    const d = run([
      item({ active: true, status: 'active', overdue: true, days_left: -2, activated_on: '2026-09-14', activity: { watchedPct: 70, startedAt: '2026-09-14T10:00:00Z', lastActiveAt: '2026-09-23T10:00:00Z', activeDays: 4, checkpoint: null } }),
    ]);
    expect(d.state).toBe('over_time');
    expect(d.sentence).toBe('Still working on "Pritzker Prize", 2 days over. 70% watched, 4 sittings.');
  });

  it('work left when watched but the assignment is not in', () => {
    const d = run([
      item({ active: true, status: 'active', watched: true, assignments_outstanding: 1, activated_on: '2026-09-23', activity: { watchedPct: 100, startedAt: '2026-09-23T10:00:00Z', lastActiveAt: '2026-09-23T12:00:00Z', activeDays: 1, checkpoint: null } }),
    ]);
    expect(d.state).toBe('work_left');
    expect(d.sentence).toBe('Watched "Pritzker Prize", the assignment is not in yet.');
  });

  it('adds the weekly pace line for a late joiner who is behind', () => {
    const d = run([item()], { pace: { state: 'behind', deficit: 2 } });
    expect(d.sentence).toContain('2 classes behind the weekly pace.');
  });

  it('every state has a place in the order', () => {
    expect(new Set(DIAGNOSIS_ORDER).size).toBe(8);
  });
});

describe('describeItemProgress', () => {
  it('reads each status', () => {
    expect(describeItemProgress(item({ status: 'done' }), TODAY)).toBe('Cleared');
    expect(describeItemProgress(item({ status: 'pending_teacher' }), TODAY)).toBe('Recap not published yet');
    expect(describeItemProgress(item(), TODAY)).toBe('Not opened');
  });

  it('joins what is known', () => {
    const s = describeItemProgress(
      item({ watched: true, has_test: true, assignments_outstanding: 1, activity: { watchedPct: 100, startedAt: 'x', lastActiveAt: '2026-09-22T10:00:00Z', activeDays: 3, checkpoint: { sectionNo: 1, fails: 2 } }, test: { attempts: 1, lastPct: 40, bestPct: 40 } }),
      TODAY,
    );
    expect(s).toBe('100% watched, 3 sittings, section 1 check failed 2 times, assignment not in, test 40% (1 try), last active 2 days ago');
  });
});

describe('istYmd', () => {
  it('rolls a late UTC evening into the next IST day', () => {
    expect(istYmd('2026-09-23T20:00:00Z')).toBe('2026-09-24');
  });
});
