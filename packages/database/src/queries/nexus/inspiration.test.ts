import { describe, expect, it } from 'vitest';
import {
  getDrawingSharingOptOut,
  getInspirationItem,
  getInspirationItemsForSubmission,
  listInspirationAttempts,
  searchInspiration,
  setDrawingSharingOptOut,
  setInspirationSave,
  toSearchArgs,
  type InspirationRow,
} from './inspiration';

/** A client whose query builder records every call and resolves to `result`. */
function fakeClient(result: { data: unknown; error: unknown; count?: number }) {
  const calls: Array<[string, unknown[]]> = [];
  const chain: any = new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(result);
        return (...args: unknown[]) => {
          calls.push([prop, args]);
          return chain;
        };
      },
    },
  );
  const client: any = {
    rpc: (...args: unknown[]) => {
      calls.push(['rpc', args]);
      return Promise.resolve(result);
    },
    from: (...args: unknown[]) => {
      calls.push(['from', args]);
      return chain;
    },
  };
  return { client, calls };
}

const row = (over: Partial<InspirationRow>): InspirationRow =>
  ({ id: 'a', match_kind: 'text', total_count: 7, ...over }) as InspirationRow;

describe('toSearchArgs', () => {
  it('turns an empty query and empty types into nulls and clamps the page size', () => {
    expect(toSearchArgs({ query: '   ', types: [], limit: 500, offset: -4 }, 'viewer')).toEqual({
      p_query: null,
      p_types: null,
      p_exam: null,
      p_by: null,
      p_year: null,
      p_sort: 'relevant',
      p_scope: 'visible',
      p_viewer_id: 'viewer',
      p_saved_only: false,
      p_limit: 60,
      p_offset: 0,
    });
  });

  it('passes filters through', () => {
    const args = toSearchArgs(
      { query: ' bag ', types: ['street_view'], exam: 'NATA', by: 'alumni', year: 2024, sort: 'saved', scope: 'hidden', savedOnly: true, limit: 30, offset: 30 },
      'v',
    );
    expect(args).toMatchObject({ p_query: 'bag', p_types: ['street_view'], p_exam: 'NATA', p_by: 'alumni', p_year: 2024, p_sort: 'saved', p_scope: 'hidden', p_saved_only: true, p_limit: 30, p_offset: 30 });
  });
});

describe('searchInspiration', () => {
  it('reads the total and match kind off the first row', async () => {
    const { client, calls } = fakeClient({ data: [row({ id: 'a' }), row({ id: 'b' })], error: null });
    const out = await searchInspiration({ query: 'bag' }, 'v', client);
    expect(calls[0][0]).toBe('rpc');
    expect(calls[0][1][0]).toBe('nexus_inspiration_search');
    expect(out).toMatchObject({ total: 7, matchKind: 'text' });
    expect(out.rows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('answers zero for an empty page', async () => {
    const { client } = fakeClient({ data: [], error: null });
    expect(await searchInspiration({}, 'v', client)).toEqual({ rows: [], total: 0, matchKind: null });
  });

  it('throws the database error', async () => {
    const { client } = fakeClient({ data: null, error: new Error('boom') });
    await expect(searchInspiration({}, 'v', client)).rejects.toThrow('boom');
  });
});

describe('getInspirationItem', () => {
  it('splits the item from its pair', async () => {
    const { client } = fakeClient({ data: [row({ id: 'p', match_kind: 'pair' }), row({ id: 'i', match_kind: 'item' })], error: null });
    const out = await getInspirationItem('i', 'v', 'visible', client);
    expect(out.item?.id).toBe('i');
    expect(out.pair?.id).toBe('p');
  });
});

describe('setInspirationSave', () => {
  it('upserts without failing on a second save', async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    await setInspirationSave('item', 'user', true, client);
    const upsert = calls.find(([name]) => name === 'upsert');
    expect(upsert?.[1]).toEqual([{ user_id: 'user', item_id: 'item' }, { onConflict: 'user_id,item_id', ignoreDuplicates: true }]);
  });

  it('deletes by user and item when unsaving', async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    await setInspirationSave('item', 'user', false, client);
    expect(calls.map(([name]) => name)).toEqual(['from', 'delete', 'eq', 'eq']);
  });
});

describe('setDrawingSharingOptOut', () => {
  it("writes the user's opt-out, only on a student row", async () => {
    const { client, calls } = fakeClient({ data: [{ id: 'u1' }], error: null });
    expect(await setDrawingSharingOptOut('u1', true, client)).toBe(true);
    expect(calls).toEqual([
      ['from', ['users']],
      ['update', [{ share_drawings_opt_out: true }]],
      ['eq', ['id', 'u1']],
      ['eq', ['user_type', 'student']],
      ['select', ['id']],
    ]);
  });

  it('answers false when no student row matched', async () => {
    const { client } = fakeClient({ data: [], error: null });
    expect(await setDrawingSharingOptOut('teacher-1', true, client)).toBe(false);
  });

  it('throws the database error', async () => {
    const { client } = fakeClient({ data: null, error: new Error('boom') });
    await expect(setDrawingSharingOptOut('u1', false, client)).rejects.toThrow('boom');
  });
});

describe('getInspirationItemsForSubmission', () => {
  it('splits the original and the reference', async () => {
    const { client } = fakeClient({
      data: [
        { id: 'o', source_kind: 'submission_original', curation: 'auto', is_visible: true, auto_eligible: true },
        { id: 'r', source_kind: 'submission_reference', curation: 'hidden', is_visible: false, auto_eligible: true },
      ],
      error: null,
    });
    expect(await getInspirationItemsForSubmission('sub', client)).toEqual({
      original: { item_id: 'o', curation: 'auto', visible: true, auto_eligible: true },
      reference: { item_id: 'r', curation: 'hidden', visible: false, auto_eligible: true },
    });
  });

  it('answers nulls when the sync has not made items yet', async () => {
    const { client } = fakeClient({ data: [], error: null });
    expect(await getInspirationItemsForSubmission('sub', client)).toEqual({ original: null, reference: null });
  });
});

describe('listInspirationAttempts', () => {
  it('reads counts and rows from the function', async () => {
    const { client, calls } = fakeClient({
      data: { students: '14', shown: '5', rows: [{ submission_id: null, original_item_id: 'i', practised_from: true }] },
      error: null,
    });
    const out = await listInspirationAttempts('item', 'viewer', false, 24, client);
    expect(out.students).toBe(14);
    expect(out.shown).toBe(5);
    expect(out.rows).toHaveLength(1);
    expect(calls[0]).toEqual(['rpc', ['nexus_inspiration_attempts', { p_item_id: 'item', p_viewer_id: 'viewer', p_staff: false, p_limit: 24 }]]);
  });

  it('answers empty when the item is missing or not visible', async () => {
    const { client } = fakeClient({ data: null, error: null });
    expect(await listInspirationAttempts('item', 'viewer', false, 24, client)).toEqual({ students: 0, shown: 0, rows: [] });
  });
});

describe('getDrawingSharingOptOut', () => {
  it('reads the flag', async () => {
    const { client } = fakeClient({ data: { share_drawings_opt_out: true }, error: null });
    expect(await getDrawingSharingOptOut('u', client)).toBe(true);
  });
});
