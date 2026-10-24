import { describe, expect, it } from 'vitest';
import { contactMatch, findPossibleMatches, mergePeople, searchDemoPeople } from './people-search';

const user = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  phone: null,
  email: null,
  user_type: 'student',
  metadata: null,
  ...extra,
});

/** A chainable PostgREST stand-in: each table answers with its rows, filtered by the eq/in/ilike calls made. */
function fakeDb(tables: Record<string, Array<Record<string, unknown>>>) {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = [];
  return {
    calls,
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const q: any = {
        select: () => q,
        order: () => q,
        not: () => q,
        or: (...args: unknown[]) => {
          calls.push({ table, op: 'or', args });
          return q;
        },
        eq: (col: string, v: unknown) => {
          rows = rows.filter((r) => r[col] === v);
          return q;
        },
        in: (col: string, vs: unknown[]) => {
          rows = rows.filter((r) => vs.includes(r[col]));
          return q;
        },
        ilike: (col: string, pattern: string) => {
          calls.push({ table, op: 'ilike', args: [col, pattern] });
          const needle = pattern.replace(/%/g, '').replace(/\\(.)/g, '$1').toLowerCase();
          rows = rows.filter((r) =>
            pattern.includes('%') ? String(r[col]).toLowerCase().includes(needle) : String(r[col]).toLowerCase() === needle,
          );
          return q;
        },
        limit: () => q,
        then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
      };
      return q;
    },
  };
}

describe('contactMatch', () => {
  it('labels a parent number', () => {
    expect(contactMatch('parent', '8860555096')).toEqual({ reason: 'family_number', label: "Parent's number", number: '8860555096' });
  });
  it("labels the person's own older number", () => {
    expect(contactMatch('self', '+916508347929').reason).toBe('other_number');
  });
  it('labels an unknown relation as a family number', () => {
    expect(contactMatch('unknown', '9000000000').label).toBe('A family number on file');
  });
});

describe('mergePeople', () => {
  it('keeps direct hits first, one row per person, within the limit', () => {
    const a = user('a', 'A');
    const b = user('b', 'B');
    const c = user('c', 'C');
    expect(mergePeople([a, b], [b, c], 8).map((u) => u.id)).toEqual(['a', 'b', 'c']);
    expect(mergePeople([a, b], [c], 2).map((u) => u.id)).toEqual(['a', 'b']);
  });
});

describe('findPossibleMatches', () => {
  const rayna = user('rayna', 'Rayna Choudhary', { phone: '+91 9953332431' });
  const db = () =>
    fakeDb({
      users: [rayna, user('kamya', 'kamya', { user_type: 'lead', email: 'k@example.com' }), user('staff', 'Kamya', { user_type: 'admin' })],
      user_contacts: [{ user_id: 'rayna', kind: 'phone', value: '8860555096', value_key: '8860555096', relation: 'parent' }],
      demo_class_registrations: [],
    });

  it("finds the student a parent's number belongs to", async () => {
    const people = await findPossibleMatches(db() as any, { phone: '8860555096', name: 'Rayana' });
    expect(people.map((p) => p.id)).toEqual(['rayna']);
    expect(people[0].matched).toEqual({ reason: 'family_number', label: "Parent's number", number: '8860555096' });
  });

  it('finds an exact name, any case, and leaves staff out', async () => {
    const people = await findPossibleMatches(db() as any, { phone: '9840400882', name: ' Kamya ' });
    expect(people.map((p) => p.id)).toEqual(['kamya']);
    expect(people[0].matched?.reason).toBe('same_name');
  });

  it('finds nobody for a new number and a new name', async () => {
    expect(await findPossibleMatches(db() as any, { phone: '9344845152', name: 'Meiaakash' })).toEqual([]);
  });

  it('does not match on a name shorter than three letters', async () => {
    const d = db();
    await findPossibleMatches(d as any, { phone: '9344845152', name: 'Ka' });
    expect(d.calls.some((c) => c.op === 'ilike' && c.table === 'users')).toBe(false);
  });
});

describe('searchDemoPeople', () => {
  it("brings up the student when staff type the parent's number", async () => {
    const d = fakeDb({
      users: [user('rayna', 'Rayna Choudhary', { phone: '+91 9953332431' })],
      user_contacts: [{ user_id: 'rayna', kind: 'phone', value: '8860555096', value_key: '8860555096', relation: 'parent' }],
      demo_class_registrations: [],
    });
    // The fake ignores or(); the users query returns everyone, so make the direct search miss.
    (d as any).from = ((orig) => (table: string) => {
      const q = orig.call(d, table);
      if (table === 'users') {
        const or = q.or;
        q.or = (...args: unknown[]) => {
          or(...args);
          return q.eq('id', '__none__');
        };
      }
      return q;
    })(d.from);
    const people = await searchDemoPeople(d as any, '8860555096');
    expect(people.map((p) => p.id)).toEqual(['rayna']);
    expect(people[0].matched?.label).toBe("Parent's number");
  });
});
