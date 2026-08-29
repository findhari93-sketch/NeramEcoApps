import { describe, expect, it } from 'vitest';
import { resolveResultStatus } from './test-analytics';

/**
 * What a teacher is told about a student who has not sat the paper.
 *
 * The rule this encodes is borrowed verbatim from buildExamRoster
 * (apps/nexus/src/lib/scheduled-exam-roster.ts): a student with no attempt is
 * not a failure while the door is still open. Only once it has shut does
 * silence become "missed". Getting this backwards would mark a class absent an
 * hour after the test was set, which is the fastest way to make the whole
 * report untrustworthy.
 */

const NOW = Date.parse('2026-08-20T10:00:00Z');
const YESTERDAY = '2026-08-19T10:00:00Z';
const TOMORROW = '2026-08-21T10:00:00Z';

const base = {
  hasSubmitted: false,
  hasInProgress: false,
  isMandatory: true,
  closesAt: null as string | null,
  windowOpenUntil: null as string | null,
  now: NOW,
};

describe('resolveResultStatus', () => {
  it('reports a finished sitting as submitted whatever else is true', () => {
    expect(resolveResultStatus({ ...base, hasSubmitted: true, closesAt: YESTERDAY })).toBe('submitted');
  });

  it('reports a sitting still open on the student screen as in progress', () => {
    expect(resolveResultStatus({ ...base, hasInProgress: true })).toBe('in_progress');
  });

  // A submitted attempt outranks an abandoned-looking in-progress one, which is
  // what a retake in a second tab looks like from here.
  it('prefers submitted over in progress', () => {
    expect(resolveResultStatus({ ...base, hasSubmitted: true, hasInProgress: true })).toBe('submitted');
  });

  it('leaves a student who has not started as not started while the run is open', () => {
    expect(resolveResultStatus({ ...base, closesAt: TOMORROW })).toBe('not_started');
  });

  it('leaves a student not started when the run never closes', () => {
    expect(resolveResultStatus({ ...base, closesAt: null })).toBe('not_started');
  });

  it('calls it missed once the door has shut on them', () => {
    expect(resolveResultStatus({ ...base, closesAt: YESTERDAY })).toBe('missed');
  });

  /**
   * The whole point of the reopen flow. A student the teacher let back in has a
   * live window of their own, so the shared close time no longer describes them.
   */
  it('does not call it missed while that student has a window of their own', () => {
    expect(
      resolveResultStatus({ ...base, closesAt: YESTERDAY, windowOpenUntil: TOMORROW }),
    ).toBe('not_started');
  });

  it('calls it missed again once their own window has also passed', () => {
    expect(
      resolveResultStatus({ ...base, closesAt: YESTERDAY, windowOpenUntil: YESTERDAY }),
    ).toBe('missed');
  });

  /**
   * Excused beats missed. A student who was not expected to sit it has not
   * failed to do anything, and showing them in the chase list is how a teacher
   * learns to ignore the chase list.
   */
  it('never marks a student who was not required as missed', () => {
    expect(resolveResultStatus({ ...base, isMandatory: false, closesAt: YESTERDAY })).toBe('excused');
  });

  it('still shows an excused student who chose to sit it as submitted', () => {
    expect(
      resolveResultStatus({ ...base, isMandatory: false, hasSubmitted: true, closesAt: YESTERDAY }),
    ).toBe('submitted');
  });

  /**
   * No roster means no opinion about who should have sat it, which is the paper
   * wide view. Nobody can be missing from a list that was never drawn up.
   */
  it('treats an unknown obligation as not started rather than missed', () => {
    expect(resolveResultStatus({ ...base, isMandatory: null, closesAt: YESTERDAY })).toBe('not_started');
  });
});
