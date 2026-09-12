import { describe, it, expect } from 'vitest';
import { decideLiveRun, describeLiveRun, type LiveRunCandidate } from './live-run';

/**
 * The practice door sends a student to the exam while the exam is theirs to sit.
 *
 * On 18 Aug the exam ran 2:00 PM to 10:45 PM IST (08:30Z to 17:15Z) and several
 * students sat the same paper through Study Materials instead.
 */

const NOW = Date.parse('2026-08-18T14:00:00Z');

const exam = (over: Partial<LiveRunCandidate> = {}): LiveRunCandidate => ({
  placement_id: 'p-exam',
  test_id: 't1',
  kind: 'exam',
  opens_at: '2026-08-18T08:30:00Z',
  closes_at: '2026-08-18T17:15:00Z',
  on_roster: true,
  has_sitting: false,
  ...over,
});

describe('decideLiveRun', () => {
  it('sends a student who has not sat the open exam to it', () => {
    expect(decideLiveRun([exam()], NOW)).toEqual({
      placement_id: 'p-exam',
      test_id: 't1',
      kind: 'exam',
      closes_at: '2026-08-18T17:15:00Z',
    });
  });

  it('lets a student who has already sat it practise', () => {
    expect(decideLiveRun([exam({ has_sitting: true })], NOW)).toBeNull();
  });

  it('leaves a student who is not in that class alone', () => {
    expect(decideLiveRun([exam({ on_roster: false })], NOW)).toBeNull();
  });

  it('does nothing before the exam opens or after it closes', () => {
    expect(decideLiveRun([exam()], Date.parse('2026-08-18T08:00:00Z'))).toBeNull();
    expect(decideLiveRun([exam()], Date.parse('2026-08-18T18:00:00Z'))).toBeNull();
  });

  it('counts a reopen window as live, since it replaces the shared one', () => {
    const reopened = exam({ opens_at: '2026-09-11T12:23:00Z', closes_at: '2026-09-14T18:29:59Z' });
    expect(decideLiveRun([reopened], Date.parse('2026-09-12T05:00:00Z'))?.placement_id).toBe('p-exam');
  });

  it('never locks practice behind a class test with no real close', () => {
    const soft = exam({ placement_id: 'p-class', kind: 'class_test', opens_at: null, closes_at: null });
    expect(decideLiveRun([soft], NOW)).toBeNull();
  });

  it('picks the run that closes first when two are live', () => {
    const later = exam({ placement_id: 'p-later', closes_at: '2026-08-19T17:15:00Z' });
    expect(decideLiveRun([later, exam()], NOW)?.placement_id).toBe('p-exam');
  });
});

describe('describeLiveRun', () => {
  it('names the exam and carries where to go', () => {
    const body = describeLiveRun({ placement_id: 'p-exam', test_id: 't1', kind: 'exam', closes_at: '2026-08-18T17:15:00Z' });
    expect(body.code).toBe('LIVE_RUN');
    expect(body.error).toContain('class exam');
    expect(body.live_run.placement_id).toBe('p-exam');
  });
});
