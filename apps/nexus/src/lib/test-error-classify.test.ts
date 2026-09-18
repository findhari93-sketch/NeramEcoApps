import { describe, expect, it } from 'vitest';
import {
  AUTO_SUBMIT_RETRY_DELAYS_MS,
  factsFromErrorRow,
  failureCodeOf,
  isExpectedRefusal,
  nextAutoRetryDelay,
  submitFailureKind,
} from './test-error-classify';

/**
 * Fixtures are the real rows on paper acf8084d (History of Architecture Test,
 * an exam run), read on production 2026-09-17. The banner said "21 students
 * could not submit" and "12 students failed to open the paper". Every "failed to
 * open" row was the app refusing on purpose, and most "could not submit" rows
 * were students who had already submitted.
 */

describe('failureCodeOf', () => {
  it('prefers the code the server sent', () => {
    expect(failureCodeOf({ code: 'LIVE_RUN', message: 'anything' })).toBe('LIVE_RUN');
  });

  it('reads the code back out of the exact sentence on a row written before codes were stored', () => {
    expect(failureCodeOf({ message: 'You have used all your attempts at this test.' })).toBe('ATTEMPT_LIMIT_REACHED');
    expect(
      failureCodeOf({ message: 'This paper is your class exam right now. Take it from the exam, where it counts.' }),
    ).toBe('LIVE_RUN');
    expect(failureCodeOf({ message: 'This attempt is already finished. Start a new one to try again.' })).toBe(
      'ATTEMPT_CLOSED',
    );
    expect(failureCodeOf({ message: 'EXAM_CLOSED' })).toBe('EXAM_CLOSED');
    expect(failureCodeOf({ message: 'This exam opens at 18/8/2026, 2:00:00 pm.' })).toBe('EXAM_NOT_OPEN');
    expect(
      failureCodeOf({ message: 'Finish your catch-up for Perspective Cube Composition first, then this test opens for you.' }),
    ).toBe('CATCHUP_REQUIRED');
    expect(failureCodeOf({ message: 'Finish your 2 pending catch-up classes first, then this test opens for you.' })).toBe(
      'CATCHUP_REQUIRED',
    );
  });

  it('tolerates the whitespace the errors route trims', () => {
    expect(failureCodeOf({ message: '  You have used all your attempts at this test.\n' })).toBe('ATTEMPT_LIMIT_REACHED');
  });

  it('has no code for a genuine crash', () => {
    expect(failureCodeOf({ message: 'Failed to fetch' })).toBeNull();
    expect(failureCodeOf({ message: 'Submit failed (HTTP 500)' })).toBeNull();
    expect(failureCodeOf({})).toBeNull();
  });
});

describe('isExpectedRefusal', () => {
  it.each([
    ['ATTEMPT_LIMIT_REACHED', 403],
    ['LIVE_RUN', 409],
    ['EXAM_NOT_OPEN', 403],
    ['EXAM_CLOSED', 403],
    ['CLASS_TEST_CLOSED', 403],
    ['CATCHUP_REQUIRED', 403],
    ['VIDEO_REQUIRED', 403],
    ['NOT_COMPLETED', 403],
    ['WRONG_ENGINE', 403],
  ])('treats %s on load as the door working, not the app failing', (code, status) => {
    expect(isExpectedRefusal({ phase: 'load', code, status })).toBe(true);
  });

  it('matches the historical load rows on acf8084d by their sentence alone', () => {
    expect(
      isExpectedRefusal({ phase: 'load', message: 'You have used all your attempts at this test.', status: 403 }),
    ).toBe(true);
    expect(
      isExpectedRefusal({
        phase: 'load',
        message: 'This paper is your class exam right now. Take it from the exam, where it counts.',
        status: 409,
      }),
    ).toBe(true);
  });

  it('treats the window refusals the route sends without a code as expected too', () => {
    for (const message of ['This test has closed', 'This test is not open yet', 'Test has expired', 'Test is not yet available']) {
      expect(isExpectedRefusal({ phase: 'load', message, status: 403 })).toBe(true);
    }
  });

  it('never calls a server crash or a sign-in failure expected, whatever it says', () => {
    expect(isExpectedRefusal({ phase: 'load', code: 'EXAM_CLOSED', status: 500 })).toBe(false);
    expect(isExpectedRefusal({ phase: 'load', message: 'Invalid token', status: 401 })).toBe(false);
    expect(isExpectedRefusal({ phase: 'load', message: 'Failed to fetch' })).toBe(false);
  });

  it('keeps a failed submit a failure, including the EXAM_CLOSED bug fixed in fd1c945d', () => {
    expect(isExpectedRefusal({ phase: 'submit', message: 'EXAM_CLOSED', status: 500 })).toBe(false);
    expect(isExpectedRefusal({ phase: 'submit', message: 'Submit failed (HTTP 502)', status: 502 })).toBe(false);
  });

  it('calls a submit on a closed attempt expected only when that paper really was submitted', () => {
    const sentence = 'This attempt is already finished. Start a new one to try again.';
    expect(isExpectedRefusal({ phase: 'submit', message: sentence, status: 409, attemptStatus: 'submitted' })).toBe(true);
    expect(isExpectedRefusal({ phase: 'submit', code: 'ATTEMPT_CLOSED', status: 409, attemptStatus: 'abandoned' })).toBe(
      false,
    );
    expect(isExpectedRefusal({ phase: 'submit', code: 'ATTEMPT_CLOSED', status: 409 })).toBe(false);
  });

  it('never excuses an image or render failure', () => {
    expect(isExpectedRefusal({ phase: 'image', message: 'Question image failed to load' })).toBe(false);
    expect(isExpectedRefusal({ phase: 'render', code: 'LIVE_RUN' })).toBe(false);
  });
});

describe('factsFromErrorRow', () => {
  it('reads code, status and attempt status out of the stored detail', () => {
    expect(
      factsFromErrorRow({
        phase: 'submit',
        message: 'x',
        detail: { code: 'ATTEMPT_CLOSED', status: 409, attempt_status: 'submitted' },
      }),
    ).toEqual({ phase: 'submit', message: 'x', code: 'ATTEMPT_CLOSED', status: 409, attemptStatus: 'submitted' });
  });

  it('lets a looked-up attempt status stand in when the row did not carry one', () => {
    const facts = factsFromErrorRow({ phase: 'submit', message: 'x', detail: { status: 409 } }, 'submitted');
    expect(facts.attemptStatus).toBe('submitted');
  });

  it('survives a row with no detail, or a detail that is not an object', () => {
    expect(factsFromErrorRow({ phase: 'load', message: 'x', detail: null })).toEqual({
      phase: 'load',
      message: 'x',
      code: null,
      status: null,
      attemptStatus: null,
    });
    expect(factsFromErrorRow({ phase: 'load', message: 'x', detail: 'oops' }).status).toBeNull();
  });
});

describe('submitFailureKind', () => {
  it('sends a closed attempt to the "was it submitted" check', () => {
    expect(submitFailureKind({ code: 'ATTEMPT_CLOSED', status: 409 })).toBe('attempt_closed');
    expect(
      submitFailureKind({ message: 'This attempt is already finished. Start a new one to try again.', status: 409 }),
    ).toBe('attempt_closed');
  });

  it('names a closed exam', () => {
    expect(submitFailureKind({ code: 'EXAM_CLOSED', status: 403 })).toBe('exam_closed');
  });

  it('lets everything else be tried again', () => {
    expect(submitFailureKind({ status: 500, message: 'boom' })).toBe('retry');
    expect(submitFailureKind({ status: null, message: 'Failed to fetch' })).toBe('retry');
    expect(submitFailureKind({ status: 401, message: 'Invalid token' })).toBe('retry');
  });
});

describe('nextAutoRetryDelay', () => {
  it('backs off 5s, 15s, 30s and then stops', () => {
    expect(AUTO_SUBMIT_RETRY_DELAYS_MS).toEqual([5000, 15000, 30000]);
    expect(nextAutoRetryDelay(0)).toBe(5000);
    expect(nextAutoRetryDelay(1)).toBe(15000);
    expect(nextAutoRetryDelay(2)).toBe(30000);
    expect(nextAutoRetryDelay(3)).toBeNull();
  });
});
