import { describe, expect, it, vi } from 'vitest';
import { countRowsByKey, countRowsForIds, fetchAllRows } from './paged-rows';

/**
 * A stand-in for PostgREST that behaves the way the real one actually does: it
 * honours the caller's `range` but never returns more than `serverCap` rows,
 * and it reports neither an error nor any hint that it truncated.
 *
 * That silence is the entire bug. A fake that returned everything asked for
 * would pass against the old `.range(0, 100000)` code and prove nothing.
 */
function fakeTable(rows: any[], serverCap = 1000) {
  const calls: Array<[number, number]> = [];
  const build = () => ({
    range(from: number, to: number) {
      calls.push([from, to]);
      const requested = to - from + 1;
      return Promise.resolve({
        data: rows.slice(from, from + Math.min(requested, serverCap)),
        error: null,
      });
    },
  });
  return { build, calls };
}

const rowsFor = (spec: Record<string, number>) =>
  Object.entries(spec).flatMap(([test_id, n]) => Array.from({ length: n }, () => ({ test_id })));

describe('fetchAllRows', () => {
  it('returns every row when the data spans more than one page', async () => {
    const rows = Array.from({ length: 1236 }, (_, i) => ({ i }));
    const { build } = fakeTable(rows);
    await expect(fetchAllRows(build)).resolves.toHaveLength(1236);
  });

  it('builds a fresh query per page, because a PostgREST builder is single-use', async () => {
    const rows = Array.from({ length: 1236 }, (_, i) => ({ i }));
    const { build } = fakeTable(rows);
    const spy = vi.fn(build);
    await fetchAllRows(spy);
    expect(spy.mock.calls.length).toBeGreaterThan(1);
  });

  it('stops on the first short page rather than polling forever', async () => {
    const { build, calls } = fakeTable(Array.from({ length: 10 }, (_, i) => ({ i })));
    await fetchAllRows(build);
    expect(calls).toHaveLength(1);
  });

  it('returns an empty array for no rows without erroring', async () => {
    const { build } = fakeTable([]);
    await expect(fetchAllRows(build)).resolves.toEqual([]);
  });

  // A partial tally that reports itself as complete is the failure this module
  // exists to end, so a mid-read error must not degrade into "what we got".
  it('throws instead of returning a partial read when a page errors', async () => {
    let page = 0;
    const build = () => ({
      range: () => {
        page += 1;
        return Promise.resolve(
          page === 1
            ? { data: Array.from({ length: 500 }, (_, i) => ({ i })), error: null }
            : { data: null, error: new Error('connection reset') },
        );
      },
    });
    await expect(fetchAllRows(build)).rejects.toThrow('connection reset');
  });

  it('pages exactly to the boundary when the total is a multiple of the page size', async () => {
    const { build } = fakeTable(Array.from({ length: 1000 }, (_, i) => ({ i })));
    await expect(fetchAllRows(build)).resolves.toHaveLength(1000);
  });
});

describe('countRowsByKey', () => {
  /**
   * The exact production shape on 2026-08-06: 28 student-built tests holding
   * 1,236 question rows. Under the old single-range read, every test beyond the
   * thousandth row reported a wrong count, usually zero. This is the regression
   * test for the screen that showed "0 questions" on a 49-question paper.
   */
  it('counts correctly past the 1000-row server cap', async () => {
    const spec: Record<string, number> = { a: 544, b: 300, c: 250, d: 142 };
    const { build } = fakeTable(rowsFor(spec));
    const counts = await countRowsByKey(build as any, 'test_id');
    expect(counts.get('a')).toBe(544);
    expect(counts.get('b')).toBe(300);
    expect(counts.get('c')).toBe(250);
    expect(counts.get('d')).toBe(142);
  });

  it('reproduces the old truncation when the read is capped, proving the fake is faithful', async () => {
    const { build } = fakeTable(rowsFor({ a: 900, b: 200 }));
    const onePage = await build().range(0, 100000);
    const truncated = new Map<string, number>();
    for (const r of onePage.data as any[]) truncated.set(r.test_id, (truncated.get(r.test_id) || 0) + 1);
    expect(truncated.get('a')).toBe(900);
    expect(truncated.get('b')).toBe(100); // the bug: 200 rows, 100 counted
  });

  it('omits a key with no rows rather than reporting zero', async () => {
    const { build } = fakeTable(rowsFor({ a: 3 }));
    const counts = await countRowsByKey(build as any, 'test_id');
    expect(counts.has('missing')).toBe(false);
    expect(counts.get('missing')).toBeUndefined();
  });

  it('ignores rows whose key is absent or not a string', async () => {
    const { build } = fakeTable([{ test_id: 'a' }, { test_id: null }, {}, { test_id: 7 }]);
    const counts = await countRowsByKey(build as any, 'test_id');
    expect(counts.get('a')).toBe(1);
    expect(counts.size).toBe(1);
  });

  // A uuid can never collide with Object.prototype, but a Map makes that
  // guarantee structural rather than incidental.
  it('is not confused by keys that shadow Object.prototype', async () => {
    const { build } = fakeTable(rowsFor({ constructor: 2, __proto__: 3 } as any));
    const counts = await countRowsByKey(build as any, 'test_id');
    expect(counts.get('constructor')).toBe(2);
  });
});

describe('countRowsForIds', () => {
  /** Records the ids each chunk asked for, so chunking can be asserted. */
  function fakeClient(rowsByKey: Record<string, number>) {
    const chunks: string[][] = [];
    const client = {
      from: () => ({
        select: () => ({
          in: (_col: string, ids: string[]) => {
            chunks.push(ids);
            const rows = ids.flatMap((id) =>
              Array.from({ length: rowsByKey[id] || 0 }, () => ({ test_id: id })),
            );
            return {
              range: (from: number, to: number) =>
                Promise.resolve({ data: rows.slice(from, from + Math.min(to - from + 1, 1000)), error: null }),
            };
          },
        }),
      }),
    };
    return { client, chunks };
  }

  it('chunks a long id list so the URL cannot overflow into a 414', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `t${i}`);
    const { client, chunks } = fakeClient(Object.fromEntries(ids.map((id) => [id, 1])));
    const counts = await countRowsForIds(client as any, 'nexus_test_questions', 'test_id', ids);
    expect(chunks).toHaveLength(3);
    expect(chunks.every((c) => c.length <= 200)).toBe(true);
    expect(counts.size).toBe(450);
  });

  it('sums a key that appears across more than one chunk', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `t${i}`);
    const { client } = fakeClient(Object.fromEntries(ids.map((id) => [id, 2])));
    const counts = await countRowsForIds(client as any, 'nexus_test_questions', 'test_id', ids);
    expect(counts.get('t0')).toBe(2);
    expect(counts.get('t249')).toBe(2);
  });

  it('deduplicates ids and short-circuits on an empty list', async () => {
    const { client, chunks } = fakeClient({ a: 5 });
    const counts = await countRowsForIds(client as any, 'x', 'test_id', ['a', 'a', 'a']);
    expect(chunks[0]).toEqual(['a']);
    expect(counts.get('a')).toBe(5);

    const empty = await countRowsForIds(client as any, 'x', 'test_id', []);
    expect(empty.size).toBe(0);
    expect(chunks).toHaveLength(1); // no second round trip
  });
});
