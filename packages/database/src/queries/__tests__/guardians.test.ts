// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { getGuardiansFor, getChildrenFor, linkGuardian } from '../guardians';

type Row = Record<string, any>;

/** A tiny in-memory stand-in for the PostgREST builder: eq, in, is, then await. */
function fakeClient(tables: Record<string, Row[]>) {
  const inserted: Row[] = [];
  const builder = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let insertRow: Row | null = null;
    const run = () => {
      if (insertRow) return { data: { id: 'new-link', ...insertRow }, error: null };
      const rows = (tables[table] || []).filter((r) => filters.every((f) => f(r)));
      return { data: rows, error: null };
    };
    const api: any = {
      select: () => api,
      order: () => api,
      limit: () => api,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), api),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), api),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), api),
      insert: (row: Row) => ((insertRow = row), inserted.push(row), api),
      maybeSingle: () => Promise.resolve({ data: run().data[0] ?? null, error: null }),
      single: () => Promise.resolve(run()),
      then: (resolve: (v: unknown) => void) => resolve(run()),
    };
    return api;
  };
  return { client: { from: builder } as any, inserted };
}

const users = [
  { id: 'parent-1', name: 'Sameera Najmal', email: 'sameera@example.org', phone: '+919000000001' },
  { id: 'parent-2', name: 'Nexus Parent', email: null, phone: null },
  { id: 'kid-1', name: 'Aisha Eshal', email: 'aisha@neramclasses.com', phone: null },
];

describe('getGuardiansFor', () => {
  it('merges Admin links and Nexus parent logins, once per pair', async () => {
    const { client } = fakeClient({
      users,
      user_guardian_links: [
        { id: 'l1', guardian_user_id: 'parent-1', student_user_id: 'kid-1', relationship: 'parent', source: 'demo', revoked_at: null },
        { id: 'l0', guardian_user_id: 'parent-2', student_user_id: 'kid-1', relationship: 'parent', source: 'staff', revoked_at: '2026-10-01' },
      ],
      nexus_parent_links: [
        { parent_user_id: 'parent-1', student_user_id: 'kid-1', relationship: 'parent', is_active: true, revoked_at: null },
        { parent_user_id: 'parent-2', student_user_id: 'kid-1', relationship: 'guardian', is_active: true, revoked_at: null },
      ],
    });
    const out = await getGuardiansFor(['kid-1'], client);
    expect(out['kid-1']).toHaveLength(2);
    expect(out['kid-1'][0]).toMatchObject({ link_id: 'l1', name: 'Sameera Najmal', source: 'demo' });
    expect(out['kid-1'][1]).toMatchObject({ link_id: null, name: 'Nexus Parent', source: 'nexus', relationship: 'guardian' });
  });

  it('returns nothing for no ids without a query', async () => {
    expect(await getGuardiansFor([], fakeClient({}).client)).toEqual({});
  });
});

describe('getChildrenFor', () => {
  it("names the child, not the parent", async () => {
    const { client } = fakeClient({
      users,
      user_guardian_links: [
        { id: 'l1', guardian_user_id: 'parent-1', student_user_id: 'kid-1', relationship: 'parent', source: 'staff', revoked_at: null },
      ],
      nexus_parent_links: [],
    });
    const kids = await getChildrenFor('parent-1', client);
    expect(kids).toHaveLength(1);
    expect(kids[0].name).toBe('Aisha Eshal');
  });
});

describe('linkGuardian', () => {
  it('refuses a person as their own parent', async () => {
    await expect(
      linkGuardian({ guardianUserId: 'kid-1', studentUserId: 'kid-1' }, fakeClient({}).client)
    ).rejects.toThrow(/own parent/);
  });

  it('returns the live link instead of a duplicate', async () => {
    const live = { id: 'l1', guardian_user_id: 'parent-1', student_user_id: 'kid-1', relationship: 'parent', source: 'staff', revoked_at: null };
    const { client, inserted } = fakeClient({ user_guardian_links: [live] });
    const link = await linkGuardian({ guardianUserId: 'parent-1', studentUserId: 'kid-1' }, client);
    expect(link.id).toBe('l1');
    expect(inserted).toHaveLength(0);
  });

  it('inserts a staff link by default', async () => {
    const { client, inserted } = fakeClient({ user_guardian_links: [] });
    await linkGuardian({ guardianUserId: 'parent-1', studentUserId: 'kid-1', createdBy: 'staff-1' }, client);
    expect(inserted[0]).toMatchObject({ relationship: 'parent', source: 'staff', created_by: 'staff-1' });
  });
});
