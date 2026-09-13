import { describe, it, expect } from 'vitest';
import { buildReleasePreflight, releaseSummary, type ReleaseCounts } from './drawing-release-model';

const counts = (over: Partial<ReleaseCounts> = {}): ReleaseCounts => ({
  held: 12,
  flagged: 0,
  unopened: 0,
  withoutTeamsEmail: 0,
  oldestHeldDays: 1,
  ...over,
});

describe('buildReleasePreflight', () => {
  it('lets a clean batch go', () => {
    const pre = buildReleasePreflight(counts());
    expect(pre.blockers).toEqual([]);
    expect(pre.canRelease).toBe(true);
  });

  it('refuses when there is nothing held', () => {
    const pre = buildReleasePreflight(counts({ held: 0 }));
    expect(pre.canRelease).toBe(false);
    expect(pre.blockers.join(' ')).toMatch(/nothing is held/i);
  });

  it('refuses while flagged work has not been opened', () => {
    // The founder's own rule: flagged sheets are never released unread.
    const pre = buildReleasePreflight(counts({ flagged: 8 }));
    expect(pre.canRelease).toBe(false);
    expect(pre.blockers.join(' ')).toContain('8');
    expect(pre.blockers.join(' ')).toMatch(/never released/i);
  });

  it('warns, but does not refuse, when reviews were never opened', () => {
    const pre = buildReleasePreflight(counts({ unopened: 5 }));
    expect(pre.canRelease).toBe(true);
    expect(pre.warnings.join(' ')).toMatch(/5 .*not been opened/i);
  });

  it('warns about students who will only get the bell', () => {
    const pre = buildReleasePreflight(counts({ withoutTeamsEmail: 3 }));
    expect(pre.canRelease).toBe(true);
    expect(pre.warnings.join(' ')).toMatch(/3 students/i);
    expect(pre.warnings.join(' ')).toMatch(/bell/i);
  });

  it('says so when work has been sitting held for days', () => {
    // The worst failure of hold-then-release is not a wrong grade, it is a
    // student waiting a week because nobody pressed the button.
    expect(buildReleasePreflight(counts({ oldestHeldDays: 1 })).warnings.join(' ')).not.toMatch(/waiting/i);
    expect(buildReleasePreflight(counts({ oldestHeldDays: 3 })).warnings.join(' ')).toMatch(/3 days/i);
  });

  it('reports every problem at once, not one at a time', () => {
    const pre = buildReleasePreflight(counts({ flagged: 2, unopened: 4, withoutTeamsEmail: 1, oldestHeldDays: 5 }));
    expect(pre.blockers).toHaveLength(1);
    expect(pre.warnings.length).toBeGreaterThanOrEqual(3);
  });

  it('never writes a sentence that reads as a count of one thing and means another', () => {
    const pre = buildReleasePreflight(counts({ held: 1, unopened: 1, withoutTeamsEmail: 1 }));
    const text = [...pre.blockers, ...pre.warnings].join(' ');
    expect(text).not.toMatch(/\b1 (students|reviews|drawings)\b/);
  });
});

describe('releaseSummary', () => {
  it('counts one student as one student', () => {
    expect(releaseSummary(1)).toMatch(/^1 drawing\b/);
  });

  it('counts several as several', () => {
    expect(releaseSummary(17)).toMatch(/^17 drawings\b/);
  });

  it('says nothing is going out when nothing is', () => {
    expect(releaseSummary(0)).toMatch(/nothing/i);
  });
});
