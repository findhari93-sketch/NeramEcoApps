import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRequestUser: vi.fn(),
  flags: null as Record<string, boolean> | null,
}));

vi.mock('@/lib/study-materials', () => ({
  getRequestUser: (h: string | null) => mocks.getRequestUser(h),
  isStaff: (u: { user_type: string }) => u.user_type === 'teacher' || u.user_type === 'admin',
}));

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: mocks.flags ? { value: mocks.flags } : null, error: null }),
        }),
      }),
    }),
  }),
}));

import { assertInspirationStaff, parseItemId, resolveInspirationCaller } from './inspiration-access';

const student = { id: 's1', user_type: 'student' };
const teacher = { id: 't1', user_type: 'teacher' };

describe('resolveInspirationCaller', () => {
  beforeEach(() => {
    mocks.getRequestUser.mockReset();
    mocks.flags = null;
  });

  it('keeps students out while student.inspiration is off, which is the default', async () => {
    mocks.getRequestUser.mockResolvedValue(student);
    await expect(resolveInspirationCaller('Bearer real')).rejects.toMatchObject({ status: 404 });
  });

  it('lets students in once the flag is on', async () => {
    mocks.getRequestUser.mockResolvedValue(student);
    mocks.flags = { 'student.inspiration': true };
    await expect(resolveInspirationCaller('Bearer real')).resolves.toMatchObject({ staff: false, user: student });
  });

  it('lets staff in by default and keeps them out when switched off', async () => {
    mocks.getRequestUser.mockResolvedValue(teacher);
    await expect(resolveInspirationCaller('Bearer real')).resolves.toMatchObject({ staff: true });
    mocks.flags = { 'staff.inspiration': false };
    await expect(resolveInspirationCaller('Bearer real')).rejects.toMatchObject({ status: 404 });
  });

  it('treats a local test token as every feature on, like the E2E client does', async () => {
    mocks.getRequestUser.mockResolvedValue(student);
    await expect(resolveInspirationCaller('Bearer test_abc')).resolves.toMatchObject({ staff: false });
  });
});

describe('assertInspirationStaff and parseItemId', () => {
  it('refuses students', () => {
    expect(() => assertInspirationStaff({ user: student as never, staff: false })).toThrow('Only teachers can change Inspiration.');
    expect(() => assertInspirationStaff({ user: teacher as never, staff: true })).not.toThrow();
  });

  it('accepts only a UUID', () => {
    expect(parseItemId('11111111-1111-4111-8111-111111111111')).toBe('11111111-1111-4111-8111-111111111111');
    expect(() => parseItemId('../../etc')).toThrow('Drawing not found');
  });
});
