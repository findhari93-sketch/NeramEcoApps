// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  row: null as any,
  updates: [] as any[],
  history: vi.fn(),
}));

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: db.row, error: null }) }) }),
      update: (patch: any) => {
        db.updates.push(patch);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  }),
  recordUserHistory: (...args: unknown[]) => db.history(...args),
}));

import { PATCH } from './route';

const USER = '00000000-0000-4000-8000-000000000042';
const ADMIN = '00000000-0000-4000-8000-000000000001';

function patch(body: unknown, admin: string | null = ADMIN) {
  return PATCH(
    new Request(`http://admin.test/api/crm/users/${USER}/language`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(admin ? { 'x-neram-admin-id': admin } : {}) },
      body: JSON.stringify(body),
    }),
    { params: { id: USER } },
  );
}

describe('PATCH /api/crm/users/[id]/language', () => {
  beforeEach(() => {
    db.row = { id: USER, home_language: null, limited_english: false };
    db.updates = [];
    db.history.mockReset();
  });

  it('refuses a caller the middleware did not verify', async () => {
    expect((await patch({ homeLanguage: 'tamil' }, null)).status).toBe(401);
  });

  it('refuses a word that is not one of the six languages', async () => {
    for (const bad of ['Tamil', 'ta', 'marathi', 1]) {
      expect((await patch({ homeLanguage: bad })).status).toBe(400);
    }
    expect(db.updates).toHaveLength(0);
  });

  it('records Telugu and audits it once', async () => {
    const res = await patch({ homeLanguage: 'telugu' });
    expect(await res.json()).toEqual({ homeLanguage: 'telugu', limitedEnglish: false });
    expect(db.updates[0]).toMatchObject({ home_language: 'telugu' });
    expect(db.history).toHaveBeenCalledWith(expect.anything(), USER, 'home_language', null, 'telugu', ADMIN);
  });

  it('writes nothing when nothing changes', async () => {
    db.row.home_language = 'tamil';
    await patch({ homeLanguage: 'tamil', limitedEnglish: false });
    expect(db.updates).toHaveLength(0);
    expect(db.history).not.toHaveBeenCalled();
  });

  it('clears back to "nobody recorded it" with null', async () => {
    db.row.home_language = 'hindi';
    await patch({ homeLanguage: null });
    expect(db.updates[0]).toMatchObject({ home_language: null });
  });

  it('refuses a non-boolean limited English tick', async () => {
    expect((await patch({ limitedEnglish: 'yes' })).status).toBe(400);
  });
});
