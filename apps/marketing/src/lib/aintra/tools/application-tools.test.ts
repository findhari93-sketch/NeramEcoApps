import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  apps: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  creates: [] as Record<string, unknown>[],
  place: { pincode: '600020', city: 'Chennai', district: 'Chennai', state: 'Tamil Nadu', country: 'IN' } as Record<string, string> | null,
  e2e: false,
}));

vi.mock('@neram/database', () => ({
  createAdminClient: () => ({
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        state.updates.push(patch);
        return {
          eq: () => ({
            select: () => ({ single: async () => ({ data: { ...(state.apps[0] ?? {}), ...patch }, error: null }) }),
          }),
        };
      },
    }),
  }),
  getActiveFeeStructures: async () => [
    { id: 'fs-crash', course_type: 'both', program_type: 'crash_course', duration: '3 Months', display_name: 'Crash Course' },
    { id: 'fs-1y', course_type: 'both', program_type: 'year_long', duration: '12 months', display_name: 'One Year Long Program' },
  ],
}));
vi.mock('@neram/database/queries', () => ({
  getApplicationsByUserId: async () => state.apps,
  createApplication: async (_s: unknown, input: Record<string, unknown>) => {
    state.creates.push(input);
    return { id: 'new-draft', ...input };
  },
}));
vi.mock('@/lib/pincode-lookup', () => ({ lookupPostalCode: async () => state.place }));
vi.mock('@/lib/e2e-mode', () => ({ isE2ETestRun: () => state.e2e }));

import { applicationPromptFor, pickProgramme, prepareApplicationSubmitTool, saveApplicationDetailsTool } from './application-tools';

const ctx = { userId: 'user-1', name: 'Priya', phoneVerified: true, phone: '9876543210', email: 'p@example.com', now: new Date('2026-10-20T06:00:00Z') };

beforeEach(() => {
  state.apps = [];
  state.updates = [];
  state.creates = [];
  state.place = { pincode: '600020', city: 'Chennai', district: 'Chennai', state: 'Tamil Nadu', country: 'IN' };
  state.e2e = false;
});

describe('saveApplicationDetailsTool', () => {
  it('asks a guest to sign in on the card, and writes nothing', async () => {
    const r = await saveApplicationDetailsTool({ student_name: 'Priya' }, { userId: null, name: null, phoneVerified: false });
    expect(r).toMatchObject({ ok: true, data: { mode: 'needs_sign_in' }, card: '[[book:apply]]' });
    expect(state.creates).toHaveLength(0);
  });

  it('starts a draft with the account phone and email, and says what is next', async () => {
    const r = await saveApplicationDetailsTool({ student_name: 'Priya Kumar', father_name: 'Kumar S' }, ctx);
    expect(state.creates[0]).toMatchObject({ user_id: 'user-1', status: 'draft', first_name: 'Priya Kumar', phone: '9876543210', email: 'p@example.com' });
    expect(r.ok && (r.data as any).saved).toEqual(['first_name', 'father_name']);
    expect(r.ok && (r.data as any).next_step).toMatch(/what they are studying now and exam year/);
    expect(r.ok && r.card).toBeUndefined();
  });

  it('updates the existing draft, resolving the PIN code and the programme', async () => {
    state.apps = [{ id: 'd1', status: 'draft', first_name: 'Priya', interest_course: 'nata', phone: '9876543210', email: 'x@y.z' }];
    const r = await saveApplicationDetailsTool({ pincode: '600020', programme: '1-year' }, ctx);
    expect(state.creates).toHaveLength(0);
    expect(state.updates[0]).toMatchObject({ pincode: '600020', city: 'Chennai', state: 'Tamil Nadu', fee_structure_id: 'fs-1y', fee_source: 'standard' });
    expect(r.ok && (r.data as any).pin_code_place).toBe('Chennai, Tamil Nadu');
  });

  it('does not save an unknown PIN code, or a programme before the course', async () => {
    state.place = null;
    state.apps = [{ id: 'd1', status: 'draft' }];
    const r = await saveApplicationDetailsTool({ pincode: '999999', programme: 'crash' }, ctx);
    expect(r.ok && (r.data as any).not_saved).toMatchObject({ pincode: expect.any(String), programme: expect.stringMatching(/course first/) });
  });

  it('never starts a second application for someone who has applied', async () => {
    state.apps = [{ id: 'a1', status: 'submitted', application_number: 'NERAM-1' }];
    const r = await saveApplicationDetailsTool({ student_name: 'Priya' }, ctx);
    expect(r).toMatchObject({ ok: true, data: { mode: 'already_applied', application_number: 'NERAM-1' } });
    expect(state.creates).toHaveLength(0);
  });

  it('writes nothing in an E2E run', async () => {
    state.e2e = true;
    expect(await saveApplicationDetailsTool({ student_name: 'Priya' }, ctx)).toMatchObject({ ok: false, error: 'test_mode' });
  });
});

describe('prepareApplicationSubmitTool', () => {
  it('lists the gaps until the draft is complete', async () => {
    state.apps = [{ id: 'd1', status: 'draft', first_name: 'Priya' }];
    const r = await prepareApplicationSubmitTool(ctx);
    expect(r).toMatchObject({ ok: false, error: 'not_complete' });
  });

  it('shows the submit card for a complete draft', async () => {
    state.apps = [
      {
        id: 'd1',
        status: 'draft',
        first_name: 'Priya Kumar',
        father_name: 'Kumar S',
        applicant_category: 'working_professional',
        academic_data: { twelfth_year: 2020 },
        target_exam_year: 2027,
        interest_course: 'not_sure',
        pincode: '600020',
        city: 'Chennai',
        date_of_birth: '2002-01-01',
      },
    ];
    expect(await prepareApplicationSubmitTool(ctx)).toMatchObject({ ok: true, card: '[[book:apply]]' });
  });
});

describe('applicationPromptFor', () => {
  it('tells Aintra what is saved and what to ask next', async () => {
    state.apps = [{ id: 'd1', status: 'draft', first_name: 'Priya', interest_course: 'nata', fee_structure_id: 'fs-1y' }];
    const text = await applicationPromptFor('user-1');
    expect(text).toContain('Student: Priya');
    expect(text).toContain('Programme: One Year Long Program');
    expect(text).toContain("Still needed: father's name");
  });

  it('says nothing for a guest', async () => {
    expect(await applicationPromptFor(null)).toBe('');
  });
});

describe('pickProgramme', () => {
  const all = [
    { id: 'both-1y', label: 'One Year', programme: '1-year' as const, courseType: 'both' },
    { id: 'nata-1y', label: 'NATA One Year', programme: '1-year' as const, courseType: 'nata' },
  ];
  it('prefers the course-specific programme, else the one for both exams', () => {
    expect(pickProgramme(all, '1-year', 'nata')?.id).toBe('nata-1y');
    expect(pickProgramme(all, '1-year', 'jee_paper2')?.id).toBe('both-1y');
    expect(pickProgramme(all, '2-year', 'nata')).toBeNull();
  });
});
