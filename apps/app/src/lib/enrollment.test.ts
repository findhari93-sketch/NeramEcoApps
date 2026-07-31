import { describe, test, expect } from 'vitest';
import { isEnrolledStudent } from './enrollment';

/**
 * A minimal in-memory stand-in for the Supabase query builder.
 *
 * It stores real rows and actually applies the `.eq()` filters the function
 * under test asks for, so the assertions below are about which rows the rule
 * accepts, not about which methods got called. That is what makes the
 * "break year student still qualifies" test meaningful: if the implementation
 * ever adds `.eq('participation_status', 'active')`, the dormant row stops
 * matching and that test goes red.
 */
function fakeClient(rows: Array<Record<string, unknown>>, forcedError?: { message: string }) {
  const filters: Array<[string, unknown]> = [];
  let queriedTable: string | null = null;

  const resolve = () => {
    if (forcedError) return { data: null, error: forcedError };
    const matched = rows.filter((row) => filters.every(([col, val]) => row[col] === val));
    return { data: matched, error: null };
  };

  const builder: Record<string, unknown> = {
    select: () => builder,
    limit: () => builder,
    eq: (col: string, val: unknown) => {
      filters.push([col, val]);
      return builder;
    },
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(resolve()).then(onFulfilled, onRejected),
  };

  return {
    client: {
      from: (table: string) => {
        queriedTable = table;
        return builder;
      },
    },
    get table() {
      return queriedTable;
    },
  };
}

const ACTIVE_STUDENT = {
  user_id: 'u1',
  role: 'student',
  is_active: true,
  participation_status: 'active',
};
const DORMANT_STUDENT = {
  user_id: 'u1',
  role: 'student',
  is_active: true,
  participation_status: 'dormant',
};
const GRADUATED_STUDENT = {
  user_id: 'u1',
  role: 'student',
  is_active: false,
  participation_status: 'active',
};
const ACTIVE_TEACHER = {
  user_id: 'u1',
  role: 'teacher',
  is_active: true,
  participation_status: 'active',
};

describe('isEnrolledStudent', () => {
  test('accepts a student with an active enrollment', async () => {
    const { client } = fakeClient([ACTIVE_STUDENT]);
    expect(await isEnrolledStudent('u1', client as never)).toBe(true);
  });

  test('accepts a break year student, dormancy does not remove access', async () => {
    const { client } = fakeClient([DORMANT_STUDENT]);
    expect(await isEnrolledStudent('u1', client as never)).toBe(true);
  });

  test('rejects a graduated or removed student whose enrollment is inactive', async () => {
    const { client } = fakeClient([GRADUATED_STUDENT]);
    expect(await isEnrolledStudent('u1', client as never)).toBe(false);
  });

  test('rejects a teacher enrollment', async () => {
    const { client } = fakeClient([ACTIVE_TEACHER]);
    expect(await isEnrolledStudent('u1', client as never)).toBe(false);
  });

  test('rejects a lead with no enrollment row at all', async () => {
    const { client } = fakeClient([]);
    expect(await isEnrolledStudent('u1', client as never)).toBe(false);
  });

  test('rejects another user, the rule is scoped to the given user id', async () => {
    const { client } = fakeClient([{ ...ACTIVE_STUDENT, user_id: 'someone-else' }]);
    expect(await isEnrolledStudent('u1', client as never)).toBe(false);
  });

  test('fails closed when the query errors', async () => {
    const { client } = fakeClient([ACTIVE_STUDENT], { message: 'connection lost' });
    expect(await isEnrolledStudent('u1', client as never)).toBe(false);
  });

  test('reads the enrollment table', async () => {
    const fake = fakeClient([ACTIVE_STUDENT]);
    await isEnrolledStudent('u1', fake.client as never);
    expect(fake.table).toBe('nexus_enrollments');
  });
});
