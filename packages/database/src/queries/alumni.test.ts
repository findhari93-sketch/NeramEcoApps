import { describe, it, expect } from 'vitest';
import { deriveYearOfStudy, isGraduateArchitect, upsertAlumniProfile, createManualAlumnus } from './alumni';

describe('deriveYearOfStudy', () => {
  it('returns the 1-based year of study from the start year', () => {
    expect(deriveYearOfStudy(2026, new Date(2026, 8, 1))).toBe(1); // Sept 2026
    expect(deriveYearOfStudy(2026, new Date(2028, 8, 1))).toBe(3);
  });

  it('returns null before the course starts or when the year is unknown', () => {
    expect(deriveYearOfStudy(2030, new Date(2026, 8, 1))).toBeNull();
    expect(deriveYearOfStudy(null)).toBeNull();
    expect(deriveYearOfStudy(undefined)).toBeNull();
  });

  it('caps at 6', () => {
    expect(deriveYearOfStudy(2010, new Date(2026, 8, 1))).toBe(6);
  });
});

describe('isGraduateArchitect', () => {
  it('uses expected_graduation_year when set', () => {
    expect(isGraduateArchitect(2020, 2025, 5, new Date(2026, 0, 1))).toBe(true);
    expect(isGraduateArchitect(2020, 2027, 5, new Date(2026, 0, 1))).toBe(false);
  });

  it('falls back to start year + course length', () => {
    expect(isGraduateArchitect(2020, null, 5, new Date(2026, 0, 1))).toBe(true); // 6 years on
    expect(isGraduateArchitect(2024, null, 5, new Date(2026, 0, 1))).toBe(false); // 2 years on
  });

  it('is false when nothing is known', () => {
    expect(isGraduateArchitect(null, null)).toBe(false);
  });
});

/** Minimal chainable mock supporting the upsert path (select/eq/maybeSingle, update|insert/select/single). */
function makeMock(existing: any) {
  let lastPayload: any = null;
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    update: (p: any) => {
      lastPayload = { op: 'update', ...p };
      return chain;
    },
    insert: (p: any) => {
      lastPayload = { op: 'insert', ...p };
      return chain;
    },
    maybeSingle: () => Promise.resolve({ data: existing, error: null }),
    single: () => Promise.resolve({ data: lastPayload, error: null }),
  };
  return { client: { from: () => chain } as any, getPayload: () => lastPayload };
}

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';

describe('upsertAlumniProfile', () => {
  it('inserts when no profile exists, stamping user_id + created_by', async () => {
    const { client } = makeMock(null);
    const result: any = await upsertAlumniProfile('u1', { course_branch: 'Interior Design' }, ADMIN_ID, client);
    expect(result.op).toBe('insert');
    expect(result.user_id).toBe('u1');
    expect(result.created_by).toBe(ADMIN_ID);
    expect(result.course_branch).toBe('Interior Design');
  });

  it('updates when a profile already exists, only allowed fields', async () => {
    const { client } = makeMock({ id: 'p1' });
    const result: any = await upsertAlumniProfile(
      'u1',
      { linkedin_url: 'https://linkedin.com/in/x', is_verified: true, hacker: 'nope' } as any,
      ADMIN_ID,
      client,
    );
    expect(result.op).toBe('update');
    expect(result.linkedin_url).toBe('https://linkedin.com/in/x');
    expect(result.is_verified).toBe(true);
    expect(result.updated_by).toBe(ADMIN_ID);
    expect('hacker' in result).toBe(false); // not in the allow-list
  });
});

describe('createManualAlumnus', () => {
  it('rejects an empty name before any DB call', async () => {
    await expect(createManualAlumnus({ name: '   ' } as any, ADMIN_ID, {} as any)).rejects.toThrow(/Name is required/);
  });

  it('rejects a malformed academic year', async () => {
    await expect(
      createManualAlumnus({ name: 'Old Student', academicYear: '2016' } as any, ADMIN_ID, {} as any),
    ).rejects.toThrow(/YYYY-YY/);
  });
});
