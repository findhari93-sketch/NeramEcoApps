import { describe, it, expect, vi } from 'vitest';

vi.mock('@neram/database', () => ({}));
vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: vi.fn() }));

import { isStaff } from './exam-access';

describe('isStaff', () => {
  // NXS-0126: users.can_teach defaults to true on EVERY row, students included,
  // so counting it made every student "staff". The student exam page then got
  // the staff shape (no window) and crashed, and every exam staff gate let
  // students through.
  it('a student is not staff, even though can_teach defaults to true', () => {
    expect(isStaff({ user_type: 'student', staff_role: null, can_teach: true })).toBe(false);
  });

  it('leads and parents are not staff', () => {
    expect(isStaff({ user_type: 'lead', staff_role: null, can_teach: true })).toBe(false);
    expect(isStaff({ user_type: 'parent', staff_role: null, can_teach: true })).toBe(false);
  });

  it('anyone with a staff_role is staff, whatever their user_type', () => {
    expect(isStaff({ user_type: 'student', staff_role: 'manager', can_teach: false })).toBe(true);
    expect(isStaff({ user_type: 'admin', staff_role: 'manager', can_teach: false })).toBe(true);
    expect(isStaff({ user_type: 'teacher', staff_role: 'teacher', can_teach: true })).toBe(true);
  });

  it('teacher and admin user types without a staff_role stay staff', () => {
    expect(isStaff({ user_type: 'teacher', staff_role: null, can_teach: true })).toBe(true);
    expect(isStaff({ user_type: 'admin', staff_role: null, can_teach: false })).toBe(true);
  });
});
