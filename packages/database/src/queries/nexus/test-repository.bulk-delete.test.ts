import { describe, expect, it } from 'vitest';
import { softDeleteTests } from './test-repository';

/**
 * Bulk delete is the one library action that cannot be undone from the UI, and
 * every child table of nexus_tests is ON DELETE CASCADE. These tests hold the
 * two properties that keep it safe: it never issues a hard delete, and it only
 * touches ids that actually resolved to a live test.
 */

interface Call {
  table: string;
  patch: Record<string, unknown> | null;
  ids: string[];
}

/** Minimal stand-in for the PostgREST builder, recording what it was asked to do. */
function stubClient(existing: string[]) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, patch: null, ids: [] };
      const chain: Record<string, unknown> = {
        update(patch: Record<string, unknown>) {
          call.patch = patch;
          return chain;
        },
        in(_column: string, ids: string[]) {
          call.ids = ids;
          return chain;
        },
        // The tests update ends in .select('id') and is awaited as a promise.
        select() {
          calls.push(call);
          return Promise.resolve({
            data: call.ids.filter((id) => existing.includes(id)).map((id) => ({ id })),
            error: null,
          });
        },
        // The placements update has no .select(), so the chain itself is awaited.
        then(onFulfilled: (v: { error: null }) => unknown) {
          calls.push(call);
          return Promise.resolve({ error: null }).then(onFulfilled);
        },
      };
      return chain;
    },
  };
  return { client: client as never, calls };
}

describe('softDeleteTests', () => {
  it('does nothing at all for an empty or junk id list', async () => {
    const { client, calls } = stubClient(['a']);
    expect(await softDeleteTests([], client)).toEqual([]);
    expect(await softDeleteTests(['', null as never, undefined as never], client)).toEqual([]);
    // The regression this guards: an `.in('id', [])` reaching the database and
    // matching in a way nobody intended.
    expect(calls).toHaveLength(0);
  });

  it('deduplicates ids before touching the database', async () => {
    const { client, calls } = stubClient(['a', 'b']);
    const deleted = await softDeleteTests(['a', 'a', 'b', 'a'], client);

    expect(deleted.sort()).toEqual(['a', 'b']);
    expect(calls[0].table).toBe('nexus_tests');
    expect(calls[0].ids).toEqual(['a', 'b']);
  });

  it('deactivates rather than deletes, so attempt history survives', async () => {
    const { client, calls } = stubClient(['a']);
    await softDeleteTests(['a'], client);

    // is_active = false on both tables, and no .delete() anywhere: a hard delete
    // would cascade into nexus_test_attempts and destroy real student scores.
    expect(calls[0].patch).toEqual({ is_active: false });
    expect(calls[1].table).toBe('nexus_test_placements');
    expect(calls[1].patch).toEqual({ is_active: false });
  });

  it('only frees placements for tests that really existed', async () => {
    const { client, calls } = stubClient(['a']);
    const deleted = await softDeleteTests(['a', 'ghost'], client);

    expect(deleted).toEqual(['a']);
    // 'ghost' must not reach the placements update, or a stale id from the
    // client could unhook a placement belonging to a test still in use.
    expect(calls[1].ids).toEqual(['a']);
  });

  it('skips the placements update entirely when nothing matched', async () => {
    const { client, calls } = stubClient([]);
    expect(await softDeleteTests(['gone'], client)).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});
