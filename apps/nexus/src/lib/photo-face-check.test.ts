import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The write path of automatic photo approval.
 *
 * Gemini is mocked here, deliberately, unlike drawing-eval's tests: the budget
 * guard is shared code already covered there. What these tests pin down is
 * what reaches the database, because every property that matters is a write
 * that must or must not happen: an approval guarded against a teacher's
 * concurrent decision, an audit row with no human reviewer, and nothing at all
 * written when the AI controls refuse the call.
 */

const ai = vi.hoisted(() => {
  class AiBlockedError extends Error {}
  return { generateGemini: vi.fn(), AiBlockedError };
});
vi.mock('@neram/ai', () => ai);

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => {
    throw new Error('tests pass their own client');
  },
}));

const msPush = vi.hoisted(() => ({ pushApprovedPhotoToMicrosoft: vi.fn() }));
vi.mock('./photo-ms-sync', () => msPush);

import { FACE_CHECK_SCHEMA, runFaceCheck, runFaceCheckWithin } from './photo-face-check';
import { FACE_ISSUES, buildStoredCheck } from './photo-auto-review';

const URL = 'https://db-staging.neramclasses.com/storage/v1/object/public/documents/ms-avatars/u1/1.jpg';
const NOW = new Date('2026-09-10T10:00:00Z');
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

const CLEAR = {
  faces: 1,
  real_photo: true,
  face_clear: true,
  appropriate: true,
  confidence: 0.96,
  issues: [],
};

function student(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    ms_oid: 'oid-1',
    is_alumni: false,
    avatar_url: URL,
    photo_status: 'pending',
    photo_ai_check: null,
    photo_avatar_id: 'av-old',
    ...overrides,
  };
}

interface FakeState {
  user: any;
  avatar?: any;
  /** Rows an approval update reports, 0 to simulate a teacher deciding first. */
  approvalRows?: number;
  updateError?: any;
}

/**
 * PostgREST-shaped stub that records every update (with its filters) and every
 * insert, so a test can assert exactly what reached the database.
 */
function fakeSupabase(state: FakeState) {
  const updates: Array<{ table: string; payload: any; filters: Array<[string, unknown]> }> = [];
  const inserts: Array<{ table: string; payload: any }> = [];

  function from(table: string) {
    const filters: Array<[string, unknown]> = [];
    let payload: any = null;

    const chain: any = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return chain;
      },
      update: (next: any) => {
        payload = next;
        return chain;
      },
      insert: async (row: any) => {
        inserts.push({ table, payload: row });
        return { error: null };
      },
      maybeSingle: async () => ({
        data: table === 'users' ? state.user : (state.avatar ?? null),
        error: null,
      }),
      then: (resolve: any, reject: any) => {
        if (!payload) return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        updates.push({ table, payload, filters });
        if (state.updateError) {
          return Promise.resolve({ data: null, error: state.updateError }).then(resolve, reject);
        }
        const rows = payload.photo_status === 'approved' ? (state.approvalRows ?? 1) : 1;
        return Promise.resolve({
          data: Array.from({ length: rows }, () => ({ id: state.user?.id })),
          error: null,
        }).then(resolve, reject);
      },
    };
    return chain;
  }

  return { client: { from }, updates, inserts };
}

function imageFetch(bytes: Uint8Array = JPEG, contentType = 'image/jpeg') {
  return vi.fn(
    async () =>
      new Response(bytes as unknown as BodyInit, {
        status: 200,
        headers: { 'content-type': contentType },
      }),
  ) as unknown as typeof fetch;
}

function answer(verdict: unknown) {
  return { text: JSON.stringify(verdict), model: 'gemini-2.5-flash' };
}

const opts = (db: ReturnType<typeof fakeSupabase>, fetchImpl = imageFetch()) => ({
  supabase: db.client,
  fetchImpl,
  now: () => NOW,
  actorId: 'u1',
});

beforeEach(() => {
  ai.generateGemini.mockReset();
  msPush.pushApprovedPhotoToMicrosoft.mockReset();
});

describe('runFaceCheck', () => {
  it('approves one clear face with a guarded update and an audit row with no human reviewer', async () => {
    ai.generateGemini.mockResolvedValue(answer(CLEAR));
    const db = fakeSupabase({ user: student(), avatar: { id: 'av-1', storage_path: URL } });

    const outcome = await runFaceCheck('u1', opts(db));

    expect(outcome).toMatchObject({ status: 'approved', recorded: true });

    const call = ai.generateGemini.mock.calls[0][0];
    expect(call.feature).toBe('nexus.photo-face-check');
    expect(call.parts[0].inline_data.mime_type).toBe('image/jpeg');

    const approval = db.updates.find((u) => u.payload.photo_status === 'approved');
    expect(approval?.payload).toMatchObject({
      photo_review_method: 'auto',
      photo_reviewed_by: null,
      photo_avatar_id: 'av-1',
    });
    // A person always beats the machine: still pending, and still this photo.
    expect(approval?.filters).toContainEqual(['photo_status', 'pending']);
    expect(approval?.filters).toContainEqual(['avatar_url', URL]);

    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0]).toMatchObject({
      table: 'nexus_photo_reviews',
      payload: { decision: 'approved', method: 'auto', reviewed_by: null },
    });
    expect(db.inserts[0].payload.ai_check.verdict.faces).toBe(1);
  });

  it('never copies an automatic approval to Microsoft', async () => {
    ai.generateGemini.mockResolvedValue(answer(CLEAR));
    const db = fakeSupabase({ user: student() });
    await runFaceCheck('u1', opts(db));
    expect(msPush.pushApprovedPhotoToMicrosoft).not.toHaveBeenCalled();
  });

  it('lets a teacher who decided first win, and logs nothing', async () => {
    ai.generateGemini.mockResolvedValue(answer(CLEAR));
    const db = fakeSupabase({ user: student(), approvalRows: 0 });

    const outcome = await runFaceCheck('u1', opts(db));

    expect(outcome.status).toBe('skipped');
    expect(db.inserts).toHaveLength(0);
  });

  it('keeps an unclear photo for the teacher, records why, and never rejects', async () => {
    ai.generateGemini.mockResolvedValue(
      answer({ ...CLEAR, face_clear: false, confidence: 0.6, issues: ['face_covered'] }),
    );
    const db = fakeSupabase({ user: student() });

    const outcome = await runFaceCheck('u1', opts(db));

    expect(outcome).toMatchObject({ status: 'kept_pending', recorded: true });
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].payload).toEqual({ photo_ai_check: expect.any(Object) });
    expect(db.updates[0].payload.photo_ai_check.verdict.issues).toEqual(['face_covered']);
    expect(db.inserts).toHaveLength(0);
  });

  it('writes nothing at all when the AI controls refuse the call', async () => {
    ai.generateGemini.mockRejectedValue(new ai.AiBlockedError('Switched off'));
    const db = fakeSupabase({ user: student() });

    const outcome = await runFaceCheck('u1', opts(db));

    expect(outcome).toMatchObject({ status: 'blocked', recorded: false });
    expect(db.updates).toHaveLength(0);
    expect(db.inserts).toHaveLength(0);
  });

  it('records a failure so the photo is not sent again straight away', async () => {
    ai.generateGemini.mockRejectedValue(new Error('Gemini API error: 500'));
    const db = fakeSupabase({ user: student() });

    const outcome = await runFaceCheck('u1', opts(db));

    expect(outcome).toMatchObject({ status: 'failed', recorded: true });
    expect(db.updates[0].payload.photo_ai_check).toMatchObject({ verdict: null, avatar_url: URL });
    expect(db.updates[0].payload.photo_status).toBeUndefined();
  });

  it('records an unreadable answer as a failure rather than guessing', async () => {
    ai.generateGemini.mockResolvedValue({ text: 'sorry, I cannot help', model: 'm' });
    const db = fakeSupabase({ user: student() });

    const outcome = await runFaceCheck('u1', opts(db));

    expect(outcome.status).toBe('failed');
    expect(db.updates.some((u) => u.payload.photo_status === 'approved')).toBe(false);
  });

  it('skips a student who cannot sign in to Nexus without spending anything', async () => {
    const fetchImpl = imageFetch();
    const db = fakeSupabase({ user: student({ ms_oid: null }) });

    const outcome = await runFaceCheck('u1', opts(db, fetchImpl));

    expect(outcome.status).toBe('skipped');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(ai.generateGemini).not.toHaveBeenCalled();
  });

  it('does not check the same photo twice', async () => {
    const db = fakeSupabase({
      user: student({ photo_ai_check: buildStoredCheck(CLEAR, URL, 'm', NOW) }),
    });
    const outcome = await runFaceCheck('u1', opts(db));
    expect(outcome.status).toBe('skipped');
    expect(ai.generateGemini).not.toHaveBeenCalled();
  });

  it('never sends a GIF to Gemini', async () => {
    const gif = new TextEncoder().encode('GIF89a....');
    const db = fakeSupabase({ user: student() });

    const outcome = await runFaceCheck('u1', opts(db, imageFetch(gif, 'image/gif')));

    expect(outcome.status).toBe('failed');
    expect(ai.generateGemini).not.toHaveBeenCalled();
  });

  it('reads a JPEG that storage served without a useful type', async () => {
    ai.generateGemini.mockResolvedValue(answer(CLEAR));
    const db = fakeSupabase({ user: student() });

    await runFaceCheck('u1', opts(db, imageFetch(JPEG, 'application/octet-stream')));

    expect(ai.generateGemini.mock.calls[0][0].parts[0].inline_data.mime_type).toBe('image/jpeg');
  });

  it('reports a database that refuses the approval as not recorded', async () => {
    ai.generateGemini.mockResolvedValue(answer(CLEAR));
    const db = fakeSupabase({ user: student(), updateError: { message: 'column does not exist' } });

    const outcome = await runFaceCheck('u1', opts(db));

    expect(outcome).toMatchObject({ status: 'failed', recorded: false });
    expect(db.inserts).toHaveLength(0);
  });
});

describe('runFaceCheckWithin', () => {
  it('gives up on a slow check without failing the caller', async () => {
    ai.generateGemini.mockImplementation(
      () => new Promise((resolveLater) => setTimeout(() => resolveLater(answer(CLEAR)), 200)),
    );
    const db = fakeSupabase({ user: student() });

    const outcome = await runFaceCheckWithin('u1', 20, opts(db));

    expect(outcome).toMatchObject({ status: 'failed', recorded: false });
  });
});

describe('FACE_CHECK_SCHEMA', () => {
  it('offers the model exactly the issues the rules understand', () => {
    expect(FACE_CHECK_SCHEMA.properties.issues.items.enum).toEqual([...FACE_ISSUES]);
  });
});
