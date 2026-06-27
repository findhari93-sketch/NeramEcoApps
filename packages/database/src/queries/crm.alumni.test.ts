import { describe, it, expect } from 'vitest';
import { graduateStudentsToAlumni, restoreAlumniToActive } from './crm';

/**
 * Minimal chainable Supabase mock. update()/in()/eq()/select() return the same
 * builder, which is awaitable and resolves to the configured result for the
 * table. insert() resolves to { error: null }. Records the payload passed to
 * update() per table so tests can assert the exact fields written.
 */
function makeMockClient(results: Record<string, { data: any[]; error: any }>) {
  const updates: Record<string, any> = {};

  function builder(table: string) {
    const result = results[table] || { data: [], error: null };
    const chain: any = {
      update(payload: any) {
        updates[table] = payload;
        return chain;
      },
      insert() {
        return Promise.resolve({ error: null });
      },
      in() {
        return chain;
      },
      eq() {
        return chain;
      },
      select() {
        return Promise.resolve(result);
      },
      then(resolve: any, reject: any) {
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return chain;
  }

  return {
    client: { from: (table: string) => builder(table) } as any,
    updates,
  };
}

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';

describe('graduateStudentsToAlumni', () => {
  it('rejects an invalid academic year format', async () => {
    const { client } = makeMockClient({});
    await expect(
      graduateStudentsToAlumni(['u1'], ADMIN_ID, { academicYear: '2025' }, client),
    ).rejects.toThrow(/YYYY-YY/);
  });

  it('returns zeroes for an empty cohort without touching the DB', async () => {
    const { client } = makeMockClient({});
    const result = await graduateStudentsToAlumni([], ADMIN_ID, { academicYear: '2025-26' }, client);
    expect(result).toEqual({ graduated: 0, enrollmentsDeactivated: 0 });
  });

  it('flips users to alumni, archives them, stamps the cohort, and deactivates enrollments', async () => {
    const { client, updates } = makeMockClient({
      users: { data: [{ id: 'u1' }, { id: 'u2' }], error: null },
      nexus_enrollments: { data: [{ id: 'e1' }], error: null },
    });

    const result = await graduateStudentsToAlumni(
      ['u1', 'u2'],
      ADMIN_ID,
      { academicYear: '2025-26', reason: 'Done' },
      client,
    );

    expect(result).toEqual({ graduated: 2, enrollmentsDeactivated: 1 });

    // The users update sets the alumni gate + CRM archive + cohort.
    expect(updates.users).toMatchObject({
      is_alumni: true,
      academic_year: '2025-26',
      lifecycle_status: 'archived',
      archived_by: ADMIN_ID,
      archived_reason: 'Done',
    });
    expect(updates.users.alumni_since).toBeTruthy();

    // The enrollment update deactivates and records the removal (the category is
    // constrained to a fixed set; graduation uses 'course_completed').
    expect(updates.nexus_enrollments).toMatchObject({
      is_active: false,
      removal_reason_category: 'course_completed',
      removed_by: ADMIN_ID,
    });
  });
});

describe('restoreAlumniToActive', () => {
  it('returns zero for an empty list', async () => {
    const { client } = makeMockClient({});
    expect(await restoreAlumniToActive([], ADMIN_ID, client)).toEqual({ restored: 0 });
  });

  it('clears the alumni gate and the CRM archive', async () => {
    const { client, updates } = makeMockClient({
      users: { data: [{ id: 'u1' }], error: null },
    });

    const result = await restoreAlumniToActive(['u1'], ADMIN_ID, client);

    expect(result).toEqual({ restored: 1 });
    expect(updates.users).toMatchObject({
      is_alumni: false,
      alumni_since: null,
      lifecycle_status: 'active',
      archived_at: null,
      archived_by: null,
      archived_reason: null,
    });
  });
});
