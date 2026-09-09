import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface Row {
  id: string;
  parent_id: string | null;
  name: string;
}

// Hoisted so the mock factory (which vitest lifts above the imports) can reach it.
const state = vi.hoisted(() => ({
  treeRows: [] as Row[],
  treeQueries: 0,
  rowQueries: 0,
  extraRows: new Map<string, Row>(),
}));

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        limit: async () => {
          state.treeQueries += 1;
          return { data: state.treeRows, error: null };
        },
        eq: (_column: string, id: string) => ({
          maybeSingle: async () => {
            state.rowQueries += 1;
            return { data: state.extraRows.get(id) ?? null, error: null };
          },
        }),
      }),
    }),
  }),
}));

import { buildBreadcrumb, __clearBreadcrumbCache } from './study-breadcrumb';

/** Home > Foundation Books > Chapter 1 */
const TREE: Row[] = [
  { id: 'root-1', parent_id: null, name: 'Home' },
  { id: 'books', parent_id: 'root-1', name: 'Foundation Books' },
  { id: 'ch1', parent_id: 'books', name: 'Chapter 1' },
];

describe('buildBreadcrumb', () => {
  beforeEach(() => {
    __clearBreadcrumbCache();
    state.treeRows = [...TREE];
    state.treeQueries = 0;
    state.rowQueries = 0;
    state.extraRows = new Map();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns an empty trail for the root', async () => {
    expect(await buildBreadcrumb(null)).toEqual([]);
    expect(state.treeQueries).toBe(0);
  });

  it('builds a root-first trail', async () => {
    expect(await buildBreadcrumb('ch1')).toEqual([
      { id: 'root-1', name: 'Home' },
      { id: 'books', name: 'Foundation Books' },
      { id: 'ch1', name: 'Chapter 1' },
    ]);
  });

  it('reads the whole tree once, not once per level', async () => {
    await buildBreadcrumb('ch1');
    expect(state.treeQueries).toBe(1);
    expect(state.rowQueries).toBe(0);
  });

  it('serves a second walk from cache without touching the database', async () => {
    await buildBreadcrumb('ch1');
    await buildBreadcrumb('books');
    expect(state.treeQueries).toBe(1);
  });

  it('re-reads the tree once the ttl has elapsed', async () => {
    await buildBreadcrumb('ch1');
    vi.advanceTimersByTime(60_000);
    await buildBreadcrumb('ch1');
    expect(state.treeQueries).toBe(2);
  });

  it('stops at a cycle instead of walking it fifty times', async () => {
    state.treeRows = [
      { id: 'a', parent_id: 'b', name: 'A' },
      { id: 'b', parent_id: 'a', name: 'B' },
    ];
    const trail = await buildBreadcrumb('a');
    expect(trail).toEqual([
      { id: 'b', name: 'B' },
      { id: 'a', name: 'A' },
    ]);
  });

  it('stops cleanly when an ancestor is missing', async () => {
    state.treeRows = [{ id: 'orphan', parent_id: 'gone', name: 'Orphan' }];
    expect(await buildBreadcrumb('orphan')).toEqual([{ id: 'orphan', name: 'Orphan' }]);
  });

  it('falls back to a direct read for a folder created since the tree was cached', async () => {
    state.extraRows.set('fresh', { id: 'fresh', parent_id: 'books', name: 'Fresh' });
    const trail = await buildBreadcrumb('fresh');
    expect(trail).toEqual([
      { id: 'root-1', name: 'Home' },
      { id: 'books', name: 'Foundation Books' },
      { id: 'fresh', name: 'Fresh' },
    ]);
    expect(state.rowQueries).toBe(1);
  });

  it('memoises that fallback for the rest of the window', async () => {
    state.extraRows.set('fresh', { id: 'fresh', parent_id: 'books', name: 'Fresh' });
    await buildBreadcrumb('fresh');
    await buildBreadcrumb('fresh');
    expect(state.rowQueries).toBe(1);
  });
});
