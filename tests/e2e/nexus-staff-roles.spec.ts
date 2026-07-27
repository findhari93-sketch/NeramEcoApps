import { test, expect, type APIRequestContext } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Staff role tiers: admin / manager / teacher, plus the can_teach flag.
 *
 * Run with:  pnpm test:e2e tests/e2e/nexus-staff-roles.spec.ts --project=nexus-chrome --no-deps
 *
 * These use /api/auth/test-login to mint a token per tier, so they exercise the
 * real /api/auth/me derivation and the real route guards rather than mocks.
 * test-login is blocked when NODE_ENV=production, so this suite only runs against
 * a local or preview server.
 */

interface TestSession {
  token: string;
  userId: string;
  staffRole: string | null;
  canTeach: boolean;
  capabilities: Record<string, boolean>;
  classroomId: string | null;
}

/**
 * Mint a session at a given tier. Stable per-scenario emails (never
 * `${Date.now()}`) so accounts do not accumulate, matching the convention in
 * tests/utils/credentials.ts.
 */
async function login(
  request: APIRequestContext,
  email: string,
  opts: { staffRole?: 'admin' | 'manager' | 'teacher'; canTeach?: boolean } = {},
): Promise<TestSession> {
  const res = await request.post(`${APP_URLS.nexus}/api/auth/test-login`, {
    data: { email, role: 'teacher', ...opts },
  });
  expect(res.ok(), `test-login failed for ${email}: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  return {
    token: body.testToken,
    userId: body.user.id,
    staffRole: body.staffRole ?? null,
    canTeach: body.canTeach !== false,
    capabilities: body.capabilities || {},
    classroomId: body.classrooms?.[0]?.id ?? null,
  };
}

const auth = (s: TestSession) => ({ Authorization: `Bearer ${s.token}` });

test.describe('Staff role tiers', () => {
  test('admin holds every capability, including system settings', async ({ request }) => {
    const admin = await login(request, 'e2e-role-admin@neramclasses.com', { staffRole: 'admin' });

    expect(admin.staffRole).toBe('admin');
    expect(admin.capabilities['system.roles']).toBe(true);
    expect(admin.capabilities['system.feature_flags']).toBe(true);
    expect(admin.capabilities['structure.classroom.delete']).toBe(true);
    expect(admin.capabilities['teach.timetable.schedule']).toBe(true);
  });

  test('manager runs the cohort but is denied system settings', async ({ request }) => {
    const manager = await login(request, 'e2e-role-manager@neramclasses.com', {
      staffRole: 'manager',
    });

    expect(manager.staffRole).toBe('manager');
    // Has the operational powers.
    expect(manager.capabilities['structure.enrollment.remove']).toBe(true);
    expect(manager.capabilities['structure.batch.manage']).toBe(true);
    expect(manager.capabilities['teach.timetable.schedule']).toBe(true);
    // But not the system ones.
    expect(manager.capabilities['system.roles']).toBe(false);
    expect(manager.capabilities['system.feature_flags']).toBe(false);
    expect(manager.capabilities['system.settings']).toBe(false);
    expect(manager.capabilities['structure.classroom.delete']).toBe(false);
  });

  test('manager PATCH on /api/settings is refused', async ({ request }) => {
    const manager = await login(request, 'e2e-role-manager@neramclasses.com', {
      staffRole: 'manager',
    });

    const res = await request.patch(`${APP_URLS.nexus}/api/settings`, {
      headers: auth(manager),
      data: { key: 'feature_flags', value: {} },
    });
    expect(res.status()).toBe(403);
  });

  test('manager cannot change roles', async ({ request }) => {
    const manager = await login(request, 'e2e-role-manager@neramclasses.com', {
      staffRole: 'manager',
    });

    const res = await request.patch(`${APP_URLS.nexus}/api/admin/users`, {
      headers: auth(manager),
      data: { userId: manager.userId, staff_role: 'admin' },
    });
    expect(res.status()).toBe(403);
  });

  test('external teacher loses the structural powers it used to have', async ({ request }) => {
    const teacher = await login(request, 'e2e-role-teacher@neramclasses.com', {
      staffRole: 'teacher',
    });

    expect(teacher.staffRole).toBe('teacher');
    // Keeps teaching.
    expect(teacher.capabilities['teach.grade']).toBe(true);
    expect(teacher.capabilities['teach.content.author']).toBe(true);
    expect(teacher.capabilities['teach.attendance.mark']).toBe(true);
    // Loses structure and scheduling.
    expect(teacher.capabilities['structure.enrollment.remove']).toBe(false);
    expect(teacher.capabilities['structure.batch.manage']).toBe(false);
    expect(teacher.capabilities['structure.classroom.teams_link']).toBe(false);
    expect(teacher.capabilities['teach.timetable.schedule']).toBe(false);
  });

  test('external teacher cannot create a class', async ({ request }) => {
    const teacher = await login(request, 'e2e-role-teacher@neramclasses.com', {
      staffRole: 'teacher',
    });
    test.skip(!teacher.classroomId, 'No classroom provisioned for the test account');

    const res = await request.post(`${APP_URLS.nexus}/api/timetable`, {
      headers: auth(teacher),
      data: {
        classroom_id: teacher.classroomId,
        title: 'E2E should be refused',
        scheduled_date: '2027-01-04',
        start_time: '19:00',
        end_time: '20:00',
      },
    });
    expect(res.status()).toBe(403);
  });

  test('external teacher cannot remove a student from the classroom', async ({ request }) => {
    const teacher = await login(request, 'e2e-role-teacher@neramclasses.com', {
      staffRole: 'teacher',
    });
    test.skip(!teacher.classroomId, 'No classroom provisioned for the test account');

    const res = await request.delete(
      `${APP_URLS.nexus}/api/classrooms/${teacher.classroomId}/enrollments`,
      {
        headers: auth(teacher),
        data: { enrollment_ids: ['00000000-0000-0000-0000-000000000000'], reason_category: 'other' },
      },
    );
    // 403 on the capability, never a 200 or a 500.
    expect(res.status()).toBe(403);
  });
});

test.describe('can_teach (tutor eligibility)', () => {
  test('a non-teaching manager is absent from the tutor picker', async ({ request }) => {
    // Shanthi's case: full manager authority, never takes a class.
    const office = await login(request, 'e2e-role-office@neramclasses.com', {
      staffRole: 'manager',
      canTeach: false,
    });
    expect(office.canTeach).toBe(false);
    expect(office.capabilities['teach.tutor']).toBe(false);
    // Every other manager capability is untouched.
    expect(office.capabilities['structure.enrollment.remove']).toBe(true);
    expect(office.capabilities['teach.timetable.schedule']).toBe(true);

    const admin = await login(request, 'e2e-role-admin@neramclasses.com', { staffRole: 'admin' });
    const res = await request.get(`${APP_URLS.nexus}/api/timetable/teachers`, {
      headers: auth(admin),
    });
    expect(res.ok()).toBeTruthy();

    const { teachers } = await res.json();
    const ids = (teachers || []).map((t: any) => t.id);
    expect(ids).not.toContain(office.userId);
  });

  test('a non-teaching manager cannot be set as the tutor of a class', async ({ request }) => {
    // The picker hides them, but the server is the actual gate.
    const office = await login(request, 'e2e-role-office@neramclasses.com', {
      staffRole: 'manager',
      canTeach: false,
    });
    const admin = await login(request, 'e2e-role-admin@neramclasses.com', { staffRole: 'admin' });
    test.skip(!admin.classroomId, 'No classroom provisioned for the test account');

    const res = await request.post(`${APP_URLS.nexus}/api/timetable`, {
      headers: auth(admin),
      data: {
        classroom_id: admin.classroomId,
        title: 'E2E tutor eligibility',
        scheduled_date: '2027-01-05',
        start_time: '19:00',
        end_time: '20:00',
        teacher_id: office.userId,
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toMatch(/not available to take classes/i);
  });

  test('a teaching manager IS offered as a tutor', async ({ request }) => {
    // Tamil's case: manager who sometimes teaches as backup.
    const backup = await login(request, 'e2e-role-manager@neramclasses.com', {
      staffRole: 'manager',
      canTeach: true,
    });
    expect(backup.capabilities['teach.tutor']).toBe(true);

    const res = await request.get(`${APP_URLS.nexus}/api/timetable/teachers`, {
      headers: auth(backup),
    });
    expect(res.ok()).toBeTruthy();
    const { teachers } = await res.json();
    expect((teachers || []).map((t: any) => t.id)).toContain(backup.userId);
  });
});

test.describe('Previously unauthenticated routes now require staff', () => {
  test('/api/devices refuses an anonymous request', async ({ request }) => {
    // This route served the whole student device dataset with no auth at all.
    const res = await request.get(`${APP_URLS.nexus}/api/devices?type=stats`);
    expect(res.status()).toBeGreaterThanOrEqual(401);
    expect(res.status()).toBeLessThan(500);
  });

  test('/api/devices allows staff', async ({ request }) => {
    const admin = await login(request, 'e2e-role-admin@neramclasses.com', { staffRole: 'admin' });
    const res = await request.get(`${APP_URLS.nexus}/api/devices?type=stats`, {
      headers: auth(admin),
    });
    expect(res.ok()).toBeTruthy();
  });

  test('/api/students refuses an anonymous request', async ({ request }) => {
    // Returned the full roster with emails and phone numbers to any caller.
    const res = await request.get(`${APP_URLS.nexus}/api/students`);
    expect(res.status()).toBeGreaterThanOrEqual(401);
    expect(res.status()).toBeLessThan(500);
  });
});
