// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  users: [] as any[],
  lifecycle: [] as any[],
  followUps: [] as any[],
  inCalls: [] as { table: string; ids: string[] }[],
}));

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => ({
      select: () => {
        if (table === 'crm_follow_ups') {
          // .in(user_id).in(status).not(...).order(...)
          let ids: string[] = [];
          const chain: any = {
            in: (col: string, values: string[]) => {
              if (col === 'user_id') ids = values;
              return chain;
            },
            not: () => chain,
            order: () =>
              Promise.resolve({ data: db.followUps.filter((f) => ids.includes(f.user_id)), error: null }),
          };
          return chain;
        }
        return {
          in: (_col: string, ids: string[]) => {
            db.inCalls.push({ table, ids });
            const rows = (table === 'users' ? db.users : db.lifecycle).filter((r) => ids.includes(r.id));
            return Promise.resolve({ data: rows, error: null });
          },
        };
      },
    }),
  }),
}));

import { POST } from './route';

const ADMIN = { 'x-neram-admin-id': '00000000-0000-4000-8000-000000000001' };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function post(body: unknown, headers: Record<string, string> = ADMIN) {
  return POST(
    new Request('http://admin.test/api/people/facts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );
}

describe('POST /api/people/facts', () => {
  beforeEach(() => {
    db.users = [];
    db.lifecycle = [];
    db.followUps = [];
    db.inCalls = [];
  });

  it('refuses a caller the middleware did not verify', async () => {
    const res = await post({ ids: [id(1)] }, {});
    expect(res.status).toBe(401);
  });

  it('returns the ring facts and a recorded language as is', async () => {
    db.users = [{ id: id(1), name: 'Asha', avatar_url: null, user_type: 'student', preferred_language: 'en', home_language: 'hindi', limited_english: false }];
    db.lifecycle = [{ id: id(1), lifecycle_stage: 'active_student', student_profile_id: 'sp', state: 'Tamil Nadu' }];
    const body = await (await post({ ids: [id(1)] })).json();
    expect(body.people[id(1)]).toMatchObject({
      userType: 'student',
      lifecycleStage: 'active_student',
      studentProfileId: 'sp',
      homeLanguage: 'hindi',
      guess: null,
    });
  });

  it('guesses from the profile place when nothing is recorded', async () => {
    db.users = [{ id: id(2), name: 'Ravi', user_type: 'lead', preferred_language: 'en', home_language: null }];
    db.lifecycle = [{ id: id(2), city: 'Hyderabad' }];
    const body = await (await post({ ids: [id(2)] })).json();
    expect(body.people[id(2)].guess).toMatchObject({ key: 'telugu', source: 'city' });
  });

  it('answers places for people with no account', async () => {
    const body = await (await post({ places: [{ key: 'chennai||', city: 'Chennai' }, { key: 'x', city: 'Dubai' }] })).json();
    expect(body.places['chennai||']).toMatchObject({ key: 'tamil' });
    expect(body.places.x).toBeNull();
  });

  it('drops ids that are not UUIDs and chunks long lists', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => id(i + 1));
    await post({ ids: [...ids, 'not-a-uuid', ids[0]] });
    const userCalls = db.inCalls.filter((c) => c.table === 'users');
    expect(userCalls.map((c) => c.ids.length)).toEqual([200, 200, 50]);
    expect(userCalls.flatMap((c) => c.ids)).not.toContain('not-a-uuid');
  });

  it('carries the glance details and the newest interest logged', async () => {
    db.users = [{ id: id(3), name: 'Kavya', user_type: 'lead', home_language: null }];
    db.lifecycle = [
      { id: id(3), exam_year: 2027, current_standard: '12th', city: 'Madurai', state: 'Tamil Nadu', engagement: 'engaged', last_meaningful_activity_at: '2026-10-20T10:00:00Z' },
    ];
    db.followUps = [
      { user_id: id(3), interest_level: 'hot' },
      { user_id: id(3), interest_level: 'cold' },
    ];
    const body = await (await post({ ids: [id(3)] })).json();
    expect(body.people[id(3)]).toMatchObject({
      examYear: 2027,
      currentStandard: '12th',
      city: 'Madurai',
      engagement: 'engaged',
      interest: 'hot',
    });
  });
});
