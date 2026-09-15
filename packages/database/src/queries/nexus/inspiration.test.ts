import { describe, expect, it } from 'vitest';
import {
  getInspirationItem,
  searchInspiration,
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
