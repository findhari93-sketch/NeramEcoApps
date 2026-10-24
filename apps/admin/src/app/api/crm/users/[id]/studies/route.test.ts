// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  row: null as any,
  readError: null as any,
  enrolments: [] as any[],
  updates: [] as { table: string; patch: any; ids?: string[] }[],
  history: vi.fn(),
}));

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => ({
      select: () => {
        if (table === 'users') {
          return { eq: () => ({ maybeSingle: () => Promise.resolve({ data: db.row, error: db.readError }) }) };
        }
        const chain: any = { eq: () => chain, then: (resolve: any) => resolve({ data: db.enrolments, error: null }) };
        return chain;
      },
      update: (patch: any) => {
        const entry: { table: string; patch: any; ids?: string[] } = { table, patch };
        db.updates.push(entry);
        return {
          eq: () => Promise.resolve({ error: null }),
          in: (_col: string, ids: string[]) => {
            entry.ids = ids;
            return Promise.resolve({ error: null });
          },
        };
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
    new Request(`http://admin.test/api/crm/users/${USER}/studies`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(admin ? { 'x-neram-admin-id': admin } : {}) },
      body: JSON.stringify(body),
    }),
    { params: { id: USER } },
  );
}

const usersUpdates = () => db.updates.filter((u) => u.table === 'users');
const enrolmentUpdates = () => db.updates.filter((u) => u.table === 'nexus_enrollments');

describe('PATCH /api/crm/users/[id]/studies', () => {
  beforeEach(() => {
    db.row = { id: USER, study_stage: null, twelfth_passed_year: null };
    db.readError = null;
    db.enrolments = [];
    db.updates = [];
    db.history.mockReset();
  });

  it('refuses a caller the middleware did not verify', async () => {
    expect((await patch({ studyStage: '12th' }, null)).status).toBe(401);
  });

  it('refuses a stage outside the four, and a missing one', async () => {
    for (const bad of [{ studyStage: '9th' }, { studyStage: 'Break year' }, {}]) {
      expect((await patch(bad)).status).toBe(400);
    }
    expect(db.updates).toHaveLength(0);
  });

  it('refuses a year without a break year, or a year in the future', async () => {
    expect((await patch({ studyStage: '12th', twelfthPassedYear: 2025 })).status).toBe(400);
    expect((await patch({ studyStage: 'gap_year', twelfthPassedYear: new Date().getFullYear() + 1 })).status).toBe(400);
    expect((await patch({ studyStage: 'gap_year', twelfthPassedYear: '2025' })).status).toBe(400);
    expect(db.updates).toHaveLength(0);
  });

  it('records a break year with the year, and audits both', async () => {
    const res = await patch({ studyStage: 'gap_year', twelfthPassedYear: 2025 });
    expect(await res.json()).toEqual({ studyStage: 'gap_year', twelfthPassedYear: 2025 });
    expect(usersUpdates()[0].patch).toMatchObject({
      study_stage: 'gap_year',
      twelfth_passed_year: 2025,
      study_stage_set_by: ADMIN,
    });
    expect(db.history).toHaveBeenCalledWith(expect.anything(), USER, 'study_stage', null, 'gap_year', ADMIN);
    expect(db.history).toHaveBeenCalledWith(expect.anything(), USER, 'twelfth_passed_year', null, 2025, ADMIN);
  });

  it('clears the year when the stage moves off a break year', async () => {
    db.row = { id: USER, study_stage: 'gap_year', twelfth_passed_year: 2025 };
    await patch({ studyStage: '12th' });
    expect(usersUpdates()[0].patch).toMatchObject({ study_stage: '12th', twelfth_passed_year: null });
  });

  it('writes nothing to users when nothing changes', async () => {
    db.row = { id: USER, study_stage: '12th', twelfth_passed_year: null };
    await patch({ studyStage: '12th' });
    expect(usersUpdates()).toHaveLength(0);
    expect(db.history).not.toHaveBeenCalled();
  });

  it('brings an enrolled student\'s Nexus class in step, as staff', async () => {
    db.row = { id: USER, study_stage: 'gap_year', twelfth_passed_year: null };
    db.enrolments = [
      { id: 'e1', current_standard: '12th' },
      { id: 'e2', current_standard: 'gap_year' },
    ];
    await patch({ studyStage: 'gap_year' });
    expect(enrolmentUpdates()).toHaveLength(1);
    expect(enrolmentUpdates()[0]).toMatchObject({
      ids: ['e1'],
      patch: { current_standard: 'gap_year', current_standard_source: 'staff', current_standard_set_by: ADMIN },
    });
  });

  it('says plainly when the database update is not applied yet', async () => {
    db.readError = { code: '42703', message: 'column users.study_stage does not exist' };
    expect((await patch({ studyStage: '12th' })).status).toBe(503);
  });
});
