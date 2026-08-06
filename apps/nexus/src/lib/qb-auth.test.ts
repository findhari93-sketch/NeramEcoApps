// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The two verifiers, and the distinction between them.
 *
 * verifyQBAccess answers "may you read THIS classroom's bank". Passing it a
 * hardcoded null classroom, which several routes did, turned it into "no
 * student may read anything" and returned the developer sentence
 * "classroom_id is required" to a student's screen. verifyQBAccessAnyClassroom
 * is the question those routes actually meant to ask.
 */

const state = {
  /** users row returned for the token, or null for "no such user". */
  user: null as any,
  /** nexus_enrollments rows for that user. */
  enrolments: [] as Array<{ classroom_id: string }>,
  /** nexus_qb_classroom_links rows that come back active. */
  qbLinks: [] as Array<{ classroom_id: string; is_active: boolean }>,
  tokenValid: true,
};

vi.mock('./ms-verify', () => ({
  verifyMsToken: vi.fn(async () => {
    if (!state.tokenValid) throw new Error('bad token');
    return { oid: 'ms-oid-1' };
  }),
}));

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => makeClient(),
  getUserRoleInClassroom: vi.fn(async () => 'student'),
  isQBEnabledForClassroom: vi.fn(async () => true),
}));

/**
 * The narrowest Supabase stand-in that still exercises the real call chain:
 * .select().eq()... terminated by .single() or awaited as a list.
 */
function makeClient() {
  return {
    from(table: string) {
      const rows =
        table === 'users'
          ? state.user
            ? [state.user]
            : []
          : table === 'nexus_enrollments'
            ? state.enrolments
            : table === 'nexus_qb_classroom_links'
              ? state.qbLinks.filter((l) => l.is_active)
              : [];

      const builder: any = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        limit: () => builder,
        single: async () => ({ data: rows[0] ?? null, error: null }),
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (resolve: (v: any) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
      };
      return builder;
    },
  };
}

import { verifyQBAccess, verifyQBAccessAnyClassroom } from './qb-auth';

const STUDENT = { id: 'u-student', user_type: 'student', staff_role: null, can_teach: null };
const TEACHER = { id: 'u-teacher', user_type: 'teacher', staff_role: 'teacher', can_teach: true };

beforeEach(() => {
  state.user = STUDENT;
  state.enrolments = [];
  state.qbLinks = [];
  state.tokenValid = true;
});

describe('verifyQBAccessAnyClassroom', () => {
  it('lets staff through with no classroom and no enrolment', async () => {
    state.user = TEACHER;
    const result = await verifyQBAccessAnyClassroom('Bearer t');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.caller.id).toBe('u-teacher');
  });

  it('lets a student through on any one QB-enabled enrolment', async () => {
    state.enrolments = [{ classroom_id: 'c-1' }];
    state.qbLinks = [{ classroom_id: 'c-1', is_active: true }];
    const result = await verifyQBAccessAnyClassroom('Bearer t');
    expect(result.ok).toBe(true);
  });

  it('refuses a student with no enrolment, and never mentions classroom_id', async () => {
    const result = await verifyQBAccessAnyClassroom('Bearer t');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      const body = await result.response.json();
      // The whole point of this helper: a student must never be shown a
      // parameter name they have no way to supply.
      expect(body.error).not.toContain('classroom_id');
      expect(body.error).toContain('Question Bank');
    }
  });

  it('refuses a student whose classrooms all have the bank switched off', async () => {
    state.enrolments = [{ classroom_id: 'c-1' }];
    state.qbLinks = [{ classroom_id: 'c-1', is_active: false }];
    const result = await verifyQBAccessAnyClassroom('Bearer t');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('401s without a header and on a bad token', async () => {
    const noHeader = await verifyQBAccessAnyClassroom(null);
    expect(noHeader.ok).toBe(false);
    if (!noHeader.ok) expect(noHeader.response.status).toBe(401);

    state.tokenValid = false;
    const badToken = await verifyQBAccessAnyClassroom('Bearer nope');
    expect(badToken.ok).toBe(false);
    if (!badToken.ok) expect(badToken.response.status).toBe(401);
  });

  it('404s when the token resolves to nobody', async () => {
    state.user = null;
    const result = await verifyQBAccessAnyClassroom('Bearer t');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(404);
  });
});

describe('verifyQBAccess', () => {
  it('still 400s a student who genuinely omitted a classroom_id', async () => {
    const result = await verifyQBAccess('Bearer t', null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      const body = await result.response.json();
      expect(body.error).toBe('classroom_id is required');
    }
  });

  it('passes a student who named an enrolled, QB-enabled classroom', async () => {
    const result = await verifyQBAccess('Bearer t', 'c-1');
    expect(result.ok).toBe(true);
  });
});
