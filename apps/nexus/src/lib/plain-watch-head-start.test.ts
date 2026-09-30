import { describe, it, expect } from 'vitest';
import { startedPlainBeforeRecap } from './plain-watch-head-start';

const PUBLISHED = '2026-09-04T00:30:00.000Z';

/**
 * A minimal chain for the two reads the helper makes: the recap's publish time,
 * then any plain-recording grant issued before it. Records the filters so a test
 * can prove the grant read is scoped the way the rule needs.
 */
function mockSupabase(opts: {
  publishedAt?: string | null;
  grants?: Array<{ issued_at: string }>;
  recapError?: boolean;
  grantError?: boolean;
}) {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = [];
  const from = (table: string) => {
    const chain: any = {};
    for (const op of ['select', 'eq', 'is', 'lt', 'limit']) {
      chain[op] = (...args: unknown[]) => {
        calls.push({ table, op, args });
        return chain;
      };
    }
    chain.maybeSingle = async () =>
      opts.recapError
        ? { data: null, error: { message: 'boom' } }
        : { data: opts.publishedAt === undefined ? null : { published_at: opts.publishedAt }, error: null };
    chain.then = (resolve: (v: unknown) => unknown) =>
      resolve(
        opts.grantError
          ? { data: null, error: { message: 'boom' } }
          : { data: (opts.grants || []).filter((g) => g.issued_at < PUBLISHED), error: null },
      );
    return chain;
  };
  return { client: { from } as any, calls };
}

const ARGS = { studentId: 'stu-1', classId: 'cls-1', recapId: 'rec-1' };

describe('startedPlainBeforeRecap', () => {
  it('is true when a plain grant was issued before the recap went live', async () => {
    const { client } = mockSupabase({
      publishedAt: PUBLISHED,
      grants: [{ issued_at: '2026-09-03T23:50:00.000Z' }],
    });
    expect(await startedPlainBeforeRecap(client, ARGS)).toBe(true);
  });

  it('is false when the only plain grants came after the recap went live', async () => {
    const { client } = mockSupabase({
      publishedAt: PUBLISHED,
      grants: [{ issued_at: '2026-09-04T00:45:00.000Z' }],
    });
    expect(await startedPlainBeforeRecap(client, ARGS)).toBe(false);
  });

  it('reads only this student, this class, and plain (not recap) grants before publish', async () => {
    const { client, calls } = mockSupabase({ publishedAt: PUBLISHED, grants: [] });
    await startedPlainBeforeRecap(client, ARGS);
    const grantCalls = calls.filter((c) => c.table === 'nexus_class_recap_stream_grants');
    expect(grantCalls).toEqual(
      expect.arrayContaining([
        { table: 'nexus_class_recap_stream_grants', op: 'eq', args: ['student_id', 'stu-1'] },
        { table: 'nexus_class_recap_stream_grants', op: 'eq', args: ['scheduled_class_id', 'cls-1'] },
        { table: 'nexus_class_recap_stream_grants', op: 'is', args: ['recap_id', null] },
        { table: 'nexus_class_recap_stream_grants', op: 'lt', args: ['issued_at', PUBLISHED] },
      ]),
    );
  });

  // Fails closed: without a publish time there is nothing to have started before,
  // and the student goes to the guided recap exactly as they did before.
  it('is false when the recap has no publish time', async () => {
    const { client } = mockSupabase({ publishedAt: null, grants: [{ issued_at: '2026-09-01T00:00:00.000Z' }] });
    expect(await startedPlainBeforeRecap(client, ARGS)).toBe(false);
  });

  it('is false when either read errors', async () => {
    expect(
      await startedPlainBeforeRecap(mockSupabase({ recapError: true }).client, ARGS),
    ).toBe(false);
    expect(
      await startedPlainBeforeRecap(
        mockSupabase({ publishedAt: PUBLISHED, grantError: true }).client,
        ARGS,
      ),
    ).toBe(false);
  });
});
