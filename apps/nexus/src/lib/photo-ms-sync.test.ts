import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * The Microsoft side of an approved photo: the one door every approval uses
 * (pushApprovedPhotosToMicrosoft) and the daily second attempt
 * (retryMicrosoftPhotoPushes).
 *
 * Graph is mocked at @neram/auth, so these run the real push path end to end
 * against a fake users row and assert the status it records, which is what the
 * retry reads back.
 */

const graph = vi.hoisted(() => ({
  setUserPhoto: vi.fn(),
  getUserPhotoResult: vi.fn(),
  classifyGraphError: vi.fn(() => ({ message: 'denied', fix: 'Grant ProfilePhoto.ReadWrite.All' })),
}));
vi.mock('@neram/auth', () => graph);

const db = vi.hoisted(() => ({
  client: null as any,
  getNexusSetting: vi.fn(),
}));
vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => db.client,
  getNexusSetting: db.getNexusSetting,
  createUserAvatar: vi.fn(),
  getLatestMsAvatarHash: vi.fn(),
  decideMicrosoftPull: vi.fn(),
  shouldFetchMicrosoftPhoto: vi.fn(),
}));

import {
  MS_PUSH_FEATURE,
  RETRYABLE_PUSH_STATUSES,
  pushApprovedPhotosToMicrosoft,
  retryMicrosoftPhotoPushes,
  type MsPushResult,
} from './photo-ms-sync';

const PHOTO_URL =
  'https://db.neramclasses.com/storage/v1/object/public/profile-pictures/u1/1.jpg';

/**
 * PostgREST-shaped stub. Users are looked up by id; every users update is kept
 * with the id it was aimed at; a list query (the retry's) records its filters.
 */
function fakeSupabase(users: Record<string, any>, listRows: Array<{ id: string }> = []) {
  const updates: Array<{ id: unknown; payload: any }> = [];
  const listQueries: Array<Array<[string, ...unknown[]]>> = [];

  function from(table: string) {
    const calls: Array<[string, ...unknown[]]> = [];
    let payload: any = null;
    let idFilter: unknown = null;

    const chain: any = {
      select: (...a: unknown[]) => (calls.push(['select', ...a]), chain),
      eq: (column: string, value: unknown) => {
        calls.push(['eq', column, value]);
        if (column === 'id') idFilter = value;
        return chain;
      },
      not: (...a: unknown[]) => (calls.push(['not', ...a]), chain),
      in: (...a: unknown[]) => (calls.push(['in', ...a]), chain),
      or: (...a: unknown[]) => (calls.push(['or', ...a]), chain),
      order: (...a: unknown[]) => (calls.push(['order', ...a]), chain),
      limit: async (...a: unknown[]) => {
        calls.push(['limit', ...a]);
        listQueries.push(calls);
        return { data: listRows, error: null };
      },
      update: (next: any) => {
        payload = next;
        return chain;
      },
      insert: async () => ({ error: null }),
      maybeSingle: async () => {
        if (table === 'users') return { data: users[idFilter as string] ?? null, error: null };
        // user_avatars: an uploaded photo, so no "adopt a Google copy" detour.
        return { data: { source: 'upload' }, error: null };
      },
      then: (resolve: any, reject: any) => {
        if (payload && table === 'users') updates.push({ id: idFilter, payload });
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      },
    };
    return chain;
  }

  return { client: { from }, updates, listQueries };
}

function flagIs(on: boolean) {
  db.getNexusSetting.mockResolvedValue({ value: { [MS_PUSH_FEATURE]: on } });
}

function lastStatusFor(updates: Array<{ id: unknown; payload: any }>, id: string) {
  const mine = updates.filter((u) => u.id === id && 'photo_ms_sync_status' in u.payload);
  return mine[mine.length - 1]?.payload;
}

beforeEach(() => {
  graph.setUserPhoto.mockReset();
  graph.getUserPhotoResult.mockReset();
  db.getNexusSetting.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) as unknown as BodyInit, {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pushApprovedPhotosToMicrosoft', () => {
  it('pushes the approved photo to Graph and records synced', async () => {
    flagIs(true);
    const fake = fakeSupabase({ u1: { id: 'u1', ms_oid: 'oid-1', avatar_url: PHOTO_URL } });
    db.client = fake.client;
    graph.setUserPhoto.mockResolvedValue({ ok: true });
    graph.getUserPhotoResult.mockResolvedValue({
      ok: true,
      buffer: Buffer.from([1, 2, 3]),
      contentType: 'image/jpeg',
    });

    const results = await pushApprovedPhotosToMicrosoft(['u1']);

    expect(results).toEqual([{ userId: 'u1', status: 'synced', message: undefined }]);
    expect(graph.setUserPhoto).toHaveBeenCalledWith('oid-1', expect.any(Buffer), 'image/jpeg');
    expect(lastStatusFor(fake.updates, 'u1')).toMatchObject({
      photo_ms_sync_status: 'synced',
      photo_ms_sync_error: null,
    });
  });

  it('records no_mailbox for a brand new account instead of throwing', async () => {
    flagIs(true);
    const fake = fakeSupabase({ u1: { id: 'u1', ms_oid: 'oid-1', avatar_url: PHOTO_URL } });
    db.client = fake.client;
    graph.setUserPhoto.mockResolvedValue({ ok: false, status: 404, error: 'Graph 404' });

    const results = await pushApprovedPhotosToMicrosoft(['u1']);

    expect(results[0].status).toBe('no_mailbox');
    expect(lastStatusFor(fake.updates, 'u1')).toMatchObject({
      photo_ms_sync_status: 'no_mailbox',
      photo_ms_synced_at: null,
    });
  });

  it('does nothing on Microsoft when the switch is off, and says so', async () => {
    flagIs(false);
    const fake = fakeSupabase({ u1: { id: 'u1', ms_oid: 'oid-1', avatar_url: PHOTO_URL } });
    db.client = fake.client;

    const results = await pushApprovedPhotosToMicrosoft(['u1', 'u2']);

    expect(results.map((r) => r.status)).toEqual(['disabled', 'disabled']);
    expect(graph.setUserPhoto).not.toHaveBeenCalled();
    expect(fake.updates).toHaveLength(0);
  });

  it('treats a settings read that fails as the default, which is on', async () => {
    db.getNexusSetting.mockRejectedValue(new Error('settings down'));
    const fake = fakeSupabase({ u1: { id: 'u1', ms_oid: null, avatar_url: PHOTO_URL } });
    db.client = fake.client;

    const results = await pushApprovedPhotosToMicrosoft(['u1']);

    expect(results[0].status).toBe('no_account');
  });

  it('returns nothing and reads nothing for an empty list, and pushes a repeated id once', async () => {
    expect(await pushApprovedPhotosToMicrosoft([])).toEqual([]);
    expect(db.getNexusSetting).not.toHaveBeenCalled();

    flagIs(true);
    const fake = fakeSupabase({ u1: { id: 'u1', ms_oid: 'oid-1', avatar_url: PHOTO_URL } });
    db.client = fake.client;
    graph.setUserPhoto.mockResolvedValue({ ok: false, status: 500, error: 'boom' });

    const results = await pushApprovedPhotosToMicrosoft(['u1', 'u1']);
    expect(results).toHaveLength(1);
    expect(graph.setUserPhoto).toHaveBeenCalledTimes(1);
  });
});

describe('retryMicrosoftPhotoPushes', () => {
  it('asks only for teacher-approved students whose last push failed', async () => {
    const fake = fakeSupabase({}, [{ id: 'u1' }, { id: 'u2' }]);
    const push = vi.fn(
      async (userId: string): Promise<MsPushResult> => ({
        userId,
        status: userId === 'u1' ? 'synced' : 'no_mailbox',
      }),
    );

    const summary = await retryMicrosoftPhotoPushes({
      supabase: fake.client,
      push,
      enabled: async () => true,
    });

    const q = fake.listQueries[0];
    expect(q).toContainEqual(['eq', 'photo_status', 'approved']);
    expect(q).toContainEqual(['not', 'ms_oid', 'is', null]);
    // Only a push that already ran and failed. An automatic approval is never
    // pushed until a teacher confirms it, so it is excluded outright.
    expect(q).toContainEqual(['in', 'photo_ms_sync_status', RETRYABLE_PUSH_STATUSES]);
    expect(q).toContainEqual(['or', 'photo_review_method.is.null,photo_review_method.neq.auto']);
    expect(JSON.stringify(q)).not.toContain('photo_ms_sync_status.is.null');
    expect(RETRYABLE_PUSH_STATUSES).not.toContain('synced');
    expect(RETRYABLE_PUSH_STATUSES).not.toContain('no_account');
    // Newest approvals first, so a fresh account is retried ahead of old ones.
    expect(q).toContainEqual(['order', 'photo_reviewed_at', { ascending: false, nullsFirst: false }]);

    expect(push).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({
      enabled: true,
      considered: 2,
      synced: 1,
      stillFailing: 1,
      byStatus: { synced: 1, no_mailbox: 1 },
    });
  });

  it('does nothing at all when the switch is off', async () => {
    const fake = fakeSupabase({}, [{ id: 'u1' }]);
    const push = vi.fn();

    const summary = await retryMicrosoftPhotoPushes({
      supabase: fake.client,
      push,
      enabled: async () => false,
    });

    expect(summary.enabled).toBe(false);
    expect(fake.listQueries).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
  });

  it('counts a push that throws as still failing and keeps going', async () => {
    const fake = fakeSupabase({}, [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }]);
    const push = vi.fn(async (userId: string): Promise<MsPushResult> => {
      if (userId === 'u2') throw new Error('network');
      return { userId, status: 'synced' };
    });

    const summary = await retryMicrosoftPhotoPushes({
      supabase: fake.client,
      push,
      enabled: async () => true,
    });

    expect(push).toHaveBeenCalledTimes(3);
    expect(summary).toMatchObject({ synced: 2, stillFailing: 1, byStatus: { synced: 2, failed: 1 } });
  });

  it('stops starting new pushes once its time budget is spent', async () => {
    const fake = fakeSupabase({}, [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }]);
    const push = vi.fn();

    const summary = await retryMicrosoftPhotoPushes({
      supabase: fake.client,
      push,
      enabled: async () => true,
      budgetMs: -1,
    });

    expect(summary.considered).toBe(3);
    expect(push).not.toHaveBeenCalled();
  });

  it('reports a list query that fails instead of throwing', async () => {
    const client = {
      from: () => {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          not: () => chain,
          in: () => chain,
          or: () => chain,
          order: () => chain,
          limit: async () => ({ data: null, error: { message: 'column does not exist' } }),
        };
        return chain;
      },
    };

    const summary = await retryMicrosoftPhotoPushes({
      supabase: client,
      push: vi.fn(),
      enabled: async () => true,
    });

    expect(summary).toMatchObject({ considered: 0, error: 'column does not exist' });
  });
});
