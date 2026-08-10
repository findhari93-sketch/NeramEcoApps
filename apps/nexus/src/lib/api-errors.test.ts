import { describe, it, expect } from 'vitest';
import { ApiError, httpStatusForError, errorResponse, describeError } from './api-errors';

/**
 * This helper decides what a client is told when a route throws, and it is on the
 * path of roughly fifty routes. The distinctions it draws matter to real people:
 * "sign in again", "you may not be here", and "we broke" call for three different
 * reactions, and collapsing any of them into 500 sends the user to support for
 * something they could have fixed themselves.
 */
describe('an unauthenticated caller is told to sign in, not that we broke', () => {
  it('maps a missing Authorization header to 401', () => {
    expect(httpStatusForError(new Error('Missing or invalid Authorization header'))).toBe(401);
  });

  it('maps an expired or bogus Microsoft token to 401', () => {
    expect(httpStatusForError(new Error('Invalid Microsoft token'))).toBe(401);
  });

  it('maps a dead parent session to 401, not 403', () => {
    // The session is gone, so signing in again is the fix. That is a different
    // instruction from "you are not allowed here", which no re-login solves.
    for (const m of [
      'Invalid or expired parent session',
      'Parent access has been revoked',
      'Parent session is no longer valid',
      'Parent account is no longer valid',
    ]) {
      expect(httpStatusForError(new Error(m)), m).toBe(401);
    }
  });
});

describe('a wrong-role caller is refused, not 500', () => {
  it('maps the parent refusal to 403', () => {
    // The regression this guards. verifyMsToken fails closed on any par_ token for
    // a route that did not opt in, which is right, but the message was unclassified
    // so every route a parent could reach answered 500. A wrong-role request looked
    // to the client exactly like a broken server.
    expect(httpStatusForError(new Error('Parent accounts cannot access this resource.'))).toBe(403);
  });

  it('maps the generic authorization failure to 403', () => {
    expect(httpStatusForError(new Error('Not authorized'))).toBe(403);
  });

  it('anchors the match so a longer message is not misclassified', () => {
    // Anchored on both ends: a 500 that merely mentions authorization must stay a
    // 500 rather than being quietly downgraded to a refusal.
    expect(httpStatusForError(new Error('Not authorized to reach the upstream billing service'))).toBe(500);
  });
});

describe('everything else is a genuine 500', () => {
  it('does not dress up an unexpected failure as an auth problem', () => {
    expect(httpStatusForError(new Error('connect ETIMEDOUT'))).toBe(500);
    expect(httpStatusForError(new Error(''))).toBe(500);
  });

  it('handles a thrown non-Error without crashing', () => {
    expect(httpStatusForError('a bare string')).toBe(500);
    expect(httpStatusForError(null)).toBe(500);
    expect(httpStatusForError(undefined)).toBe(500);
  });
});

describe('an explicit ApiError always wins', () => {
  it('uses the status the thrower chose', () => {
    expect(httpStatusForError(new ApiError('Nope', 409))).toBe(409);
    expect(httpStatusForError(new ApiError('Gone', 410))).toBe(410);
  });

  it('is not overridden by a message that looks like an auth failure', () => {
    // A caller who says 418 means 418, even if the words match a pattern.
    expect(httpStatusForError(new ApiError('Not authorized', 418))).toBe(418);
  });
});

/**
 * The Question Bank 500 that could not be diagnosed from its own log. Forty catch
 * blocks used `err instanceof Error ? err.message : 'Internal server error'`, and
 * a PostgrestError is a plain object, so every database failure printed the same
 * eight words. These assert the cause survives to the log.
 */
describe('describeError names what actually broke', () => {
  const postgrestError = {
    message: 'column nexus_qb_questions.section does not exist',
    details: '',
    hint: 'Perhaps you meant to reference the column "nexus_qb_questions.section_order".',
    code: '42703',
  };

  it('keeps the message, the code and the hint of a PostgrestError', () => {
    const detail = describeError(postgrestError);
    expect(detail).toContain('column nexus_qb_questions.section does not exist');
    expect(detail).toContain('42703');
    expect(detail).toContain('Perhaps you meant');
    expect(detail).not.toBe('Internal server error');
  });

  it('surfaces a network failure, which arrives in the same shape', () => {
    // supabase-js wraps a dead connection into the PostgrestError shape too, so
    // the log has to distinguish "cannot reach the database" from "bad SQL".
    const detail = describeError({
      message: 'TypeError: fetch failed',
      details: 'Caused by: AggregateError: (ECONNREFUSED)',
      hint: '',
      code: '',
    });
    expect(detail).toContain('fetch failed');
    expect(detail).toContain('ECONNREFUSED');
  });

  it('omits the fields PostgREST left blank', () => {
    expect(describeError({ message: 'boom', details: '', hint: '', code: '' })).toBe('boom');
  });

  it('uses the message of a real Error', () => {
    expect(describeError(new Error('SUPABASE_SERVICE_ROLE_KEY is not set'))).toBe(
      'SUPABASE_SERVICE_ROLE_KEY is not set',
    );
  });

  it('never returns [object Object]', () => {
    expect(describeError({})).not.toContain('[object Object]');
    expect(describeError({ unexpected: 'shape' })).toContain('unexpected');
  });

  it('survives the awkward values', () => {
    expect(describeError(null)).toBe('null');
    expect(describeError(undefined)).toBe('undefined');
    expect(describeError('a bare string')).toBe('a bare string');
    expect(describeError(42)).toBe('42');
  });
});

describe('errorResponse', () => {
  it('keeps the original message and applies the classified status', async () => {
    const res = errorResponse(new Error('Parent accounts cannot access this resource.'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Parent accounts cannot access this resource.' });
  });

  it('falls back to the supplied text for a non-Error', async () => {
    const res = errorResponse(null, 'Failed to load the roster');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to load the roster' });
  });
});
