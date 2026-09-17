// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type TestUser = { id: string; user_type: string; staff_role: string | null };

const state = vi.hoisted(() => ({
  user: null as TestUser | null,
  overrides: {} as Record<string, boolean>,
  settingReads: 0,
}));

vi.mock('@neram/database', () => ({
  getNexusSetting: async () => {
    state.settingReads += 1;
    return { key: 'feature_flags', value: state.overrides };
  },
}));

vi.mock('../study-materials', () => ({
  getRequestUser: async () => {
    if (!state.user) throw new Error('Invalid Microsoft token: 401');
    return state.user;
  },
  staffRoleOf: (user: TestUser) =>
    user.staff_role ?? (user.user_type === 'admin' ? 'admin' : user.user_type === 'teacher' ? 'teacher' : null),
  isInternalStaff: (user: TestUser) => user.staff_role === 'admin' || user.staff_role === 'manager',
}));

import { ApiError } from '../api-errors';
import { __clearPadFlagCache, assertPadStaff, assertPadStudent, resolvePadCaller } from './caller';

const teacher: TestUser = { id: 'teacher-1', user_type: 'teacher', staff_role: 'teacher' };
const manager: TestUser = { id: 'manager-1', user_type: 'admin', staff_role: 'manager' };
const student: TestUser = { id: 'student-1', user_type: 'student', staff_role: null };

beforeEach(() => {
  __clearPadFlagCache();
  state.user = null;
  state.overrides = {};
  state.settingReads = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('resolvePadCaller', () => {
  it('answers 404 on both surfaces while the flags are at their defaults', async () => {
    for (const user of [teacher, student]) {
      state.user = user;
      const refusal = await resolvePadCaller('Bearer x').catch((err: unknown) => err);
      expect(refusal).toBeInstanceOf(ApiError);
      expect(refusal).toMatchObject({ status: 404, message: 'Not found' });
    }
  });

  it('opens each surface only with its own flag', async () => {
    state.overrides = { 'staff.answer-pad': true };
    state.user = teacher;
    await expect(resolvePadCaller('Bearer x')).resolves.toMatchObject({ role: 'staff', internal: false });
    state.user = student;
    await expect(resolvePadCaller('Bearer x')).rejects.toMatchObject({ status: 404 });

    __clearPadFlagCache();
    state.overrides = { 'student.answer-pad': true };
    await expect(resolvePadCaller('Bearer x')).resolves.toMatchObject({ role: 'student', internal: false });
    state.user = teacher;
    await expect(resolvePadCaller('Bearer x')).rejects.toMatchObject({ status: 404 });
  });

  it('marks admins and managers as internal staff', async () => {
    state.overrides = { 'staff.answer-pad': true };
    state.user = manager;
    await expect(resolvePadCaller('Bearer x')).resolves.toMatchObject({ role: 'staff', internal: true, user: manager });
  });

  it('refuses a bad token before reading any flag', async () => {
    await expect(resolvePadCaller('Bearer expired')).rejects.toThrow(/^Invalid Microsoft token: 401$/);
    expect(state.settingReads).toBe(0);
  });

  it('holds the flags for fifteen seconds, then reads them again', async () => {
    vi.useFakeTimers();
    state.overrides = { 'student.answer-pad': true };
    state.user = student;

    await resolvePadCaller('Bearer x');
    await resolvePadCaller('Bearer x');
    expect(state.settingReads).toBe(1);

    // Switched off in the admin panel: the pad goes dark within the window.
    state.overrides = {};
    vi.advanceTimersByTime(15_000);
    await expect(resolvePadCaller('Bearer x')).rejects.toMatchObject({ status: 404 });
    expect(state.settingReads).toBe(2);
  });
});

describe('role assertions', () => {
  const caller = (role: 'staff' | 'student') => ({ user: role === 'staff' ? teacher : student, role, internal: false }) as never;

  it('lets each role through its own door only', () => {
    expect(() => assertPadStaff(caller('staff'))).not.toThrow();
    expect(() => assertPadStudent(caller('student'))).not.toThrow();
    expect(() => assertPadStaff(caller('student'))).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => assertPadStudent(caller('staff'))).toThrow(expect.objectContaining({ status: 403 }));
  });
});
