// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  users: [] as any[],
  lifecycle: [] as any[],
  followUps: [] as any[],
  leads: [] as any[],
  demos: [] as any[],
  /** Before 20261226100000_users_study_stage.sql: users has no study columns. */
  noStudyColumns: false,
  inCalls: [] as { table: string; ids: string[]; columns: string }[],
}));

vi.mock('@neram/database', async () => {
  const { mapClassToStandard } = await import('../../../../../../../packages/database/src/queries/nexus/onboarding-prefill');
  const rowsOf: Record<string, () => any[]> = {
    users: () => db.users,
    user_lifecycle_view: () => db.lifecycle,
    crm_follow_ups: () => db.followUps,
    lead_profiles: () => db.leads,
    demo_class_registrations: () => db.demos,
  };
  return {
    mapClassToStandard,
    getSupabaseAdminClient: () => ({
      from: (table: string) => ({
        // Every read is select(...).in(id or user_id, ids) plus filters; the chain
        // resolves when awaited, keeping the table's own order (newest first in the fixtures).
        select: (columns: string) => {
          let ids: string[] = [];
          const chain: any = {
            in: (col: string, values: string[]) => {
              if (col === 'id' || col === 'user_id') {
                ids = values;
                db.inCalls.push({ table, ids: values, columns });
              }
              return chain;
            },
            not: () => chain,
            order: () => chain,
            then: (resolve: (v: unknown) => void) => {
              if (table === 'users' && db.noStudyColumns && columns.includes('study_stage')) {
                return resolve({ data: null, error: { code: '42703', message: 'column users.study_stage does not exist' } });
              }
              const key = table === 'users' || table === 'user_lifecycle_view' ? 'id' : 'user_id';
              return resolve({ data: rowsOf[table]().filter((r) => ids.includes(r[key])), error: null });
            },
          };
          return chain;
        },
      }),
    }),
  };
});

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
    db.leads = [];
    db.demos = [];
    db.noStudyColumns = false;
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

  describe('the class', () => {
    it('takes a break year from the application, with the year they finished', async () => {
      db.users = [{ id: id(4), name: 'Divya', user_type: 'lead' }];
      db.leads = [
        { user_id: id(4), academic_data: { current_class: '12_completed', twelfth_year: '2025' }, applicant_category: 'school_student' },
        { user_id: id(4), academic_data: { current_class: '12' }, applicant_category: 'school_student' },
      ];
      db.demos = [{ user_id: id(4), current_class: '12th' }];
      const body = await (await post({ ids: [id(4)] })).json();
      expect(body.people[id(4)]).toMatchObject({ currentStandard: 'gap_year', studySource: 'application', twelfthPassedYear: 2025 });
    });

    it('lets staff overrule the forms, and Nexus overrule staff', async () => {
      db.users = [
        { id: id(5), user_type: 'lead', study_stage: 'gap_year', twelfth_passed_year: 2024 },
        { id: id(6), user_type: 'student', study_stage: 'gap_year' },
      ];
      db.lifecycle = [{ id: id(6), current_standard: '12th' }];
      db.demos = [{ user_id: id(5), current_class: '12th' }];
      const body = await (await post({ ids: [id(5), id(6)] })).json();
      expect(body.people[id(5)]).toMatchObject({ currentStandard: 'gap_year', studySource: 'staff', twelfthPassedYear: 2024 });
      expect(body.people[id(6)]).toMatchObject({ currentStandard: '12th', studySource: 'nexus', twelfthPassedYear: null });
    });

    it('reads a demo booking when nothing else says', async () => {
      db.users = [{ id: id(7), user_type: 'lead' }];
      db.demos = [{ user_id: id(7), current_class: '12th-pass' }];
      const body = await (await post({ ids: [id(7)] })).json();
      expect(body.people[id(7)]).toMatchObject({ currentStandard: 'gap_year', studySource: 'demo' });
    });

    it('still answers before the study columns exist on this database', async () => {
      db.noStudyColumns = true;
      db.users = [{ id: id(8), name: 'Arun', user_type: 'lead' }];
      db.demos = [{ user_id: id(8), current_class: '11th' }];
      const res = await post({ ids: [id(8)] });
      expect(res.status).toBe(200);
      expect((await res.json()).people[id(8)]).toMatchObject({ name: 'Arun', currentStandard: '11th' });
    });
  });
});
