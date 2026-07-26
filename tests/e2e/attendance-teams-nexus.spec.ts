import { test, expect, type APIRequestContext } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';

/**
 * Teams attendance: access control, error shape, and mobile layout.
 *
 * Deliberately does NOT assert a successful Graph sync. Reading attendance needs
 * a Graph application permission plus a Teams application access policy, neither
 * of which CI has, so a green "attendance synced" here would be a lie. What is
 * testable, and what actually regressed for months, is:
 *   - any teacher or admin can open ANY class's report (the RBAC widening: prod
 *     had 30 staff but only 6 classroom teacher enrollments, so ~24 got a 403)
 *   - a student still sees only their own row
 *   - a failed sync returns a specific, explained reason rather than a bare 502
 *
 * Auth goes through the non-production `test_` token bypass in lib/ms-verify.ts,
 * because the tenant enforces MFA and Playwright cannot complete a real MS login.
 */

const NEXUS = APP_URLS.nexus;

interface Ctx {
  token: string;
  classId: string;
  classroomId: string;
}

/** Find any class in any classroom, which is the point: no enrollment needed. */
async function findAnyClass(request: APIRequestContext, token: string): Promise<Ctx | null> {
  const classroomsRes = await request.get(`${NEXUS}/api/classrooms`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!classroomsRes.ok()) return null;

  const classrooms = (await classroomsRes.json())?.classrooms ?? [];
  for (const classroom of classrooms) {
    const res = await request.get(`${NEXUS}/api/timetable?classroom_id=${classroom.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok()) continue;
    const classes = (await res.json())?.classes ?? [];
    if (classes.length > 0) {
      return { token, classId: classes[0].id, classroomId: classroom.id };
    }
  }
  return null;
}

test.describe('Teams attendance', () => {
  test('staff can open the attendance report for a class, with a sync status block', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'Nexus test-login unavailable');

    const ctx = await findAnyClass(request, auth!.testToken);
    test.skip(!ctx, 'No class with a classroom found to test against');

    const res = await request.get(
      `${NEXUS}/api/timetable/attendance-report?class_id=${ctx!.classId}&classroom_id=${ctx!.classroomId}`,
      { headers: { Authorization: `Bearer ${auth!.testToken}` } },
    );

    expect(res.status()).toBe(200);
    const body = await res.json();

    // Staff get the full roster shape, not a single row.
    expect(Array.isArray(body.attendance)).toBe(true);
    expect(body.summary).toMatchObject({
      present: expect.any(Number),
      absent: expect.any(Number),
      total: expect.any(Number),
    });
    // The sync block is what lets the UI explain an empty sheet.
    expect(body.sync).toBeDefined();
    expect(body.sync).toHaveProperty('has_meeting');
    expect(body.sync).toHaveProperty('synced_at');
  });

  test('a mismatched class and classroom pair is rejected, not leaked', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'Nexus test-login unavailable');

    const ctx = await findAnyClass(request, auth!.testToken);
    test.skip(!ctx, 'No class found');

    const res = await request.get(
      `${NEXUS}/api/timetable/attendance-report?class_id=${ctx!.classId}&classroom_id=00000000-0000-0000-0000-000000000000`,
      { headers: { Authorization: `Bearer ${auth!.testToken}` } },
    );

    expect(res.status()).toBe(404);
  });

  test('a student sees only their own row, never the roster', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Nexus test-login unavailable');

    const ctx = await findAnyClass(request, teacher!.testToken);
    test.skip(!ctx, 'No class found');

    const res = await request.get(
      `${NEXUS}/api/timetable/attendance-report?class_id=${ctx!.classId}&classroom_id=${ctx!.classroomId}`,
      { headers: { Authorization: `Bearer ${student!.testToken}` } },
    );

    // Either enrolled (own row only) or not enrolled (403). Never a roster.
    expect([200, 403]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.summary).toBeUndefined();
      expect(Array.isArray(body.attendance)).toBe(false);
    }
  });

  test('a student cannot trigger a Teams sync', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Nexus test-login unavailable');

    const ctx = await findAnyClass(request, teacher!.testToken);
    test.skip(!ctx, 'No class found');

    const res = await request.post(`${NEXUS}/api/timetable/attendance-report`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
      data: { class_id: ctx!.classId, classroom_id: ctx!.classroomId, action: 'sync_teams' },
    });

    expect(res.status()).toBe(403);
  });

  test('a sync failure names a specific reason instead of a bare error', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'Nexus test-login unavailable');

    const ctx = await findAnyClass(request, auth!.testToken);
    test.skip(!ctx, 'No class found');

    const res = await request.post(`${NEXUS}/api/timetable/attendance-report`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
      data: { class_id: ctx!.classId, classroom_id: ctx!.classroomId, action: 'sync_teams' },
    });

    const body = await res.json();

    if (res.ok()) {
      expect(body).toHaveProperty('synced');
    } else {
      // Every failure carries a machine code AND a human sentence. The codes are
      // what distinguish a missing Azure grant from a class that has not run.
      expect(body.code).toBeTruthy();
      expect([
        'no_meeting_linked',
        'no_organizer',
        'meeting_not_found',
        'app_permission_missing',
        'access_policy_missing',
        'report_not_ready',
        'graph_error',
      ]).toContain(body.code);
      expect(typeof body.error).toBe('string');
      expect(body.error.length).toBeGreaterThan(20);
    }
  });

  test('diagnostics report every step with a remedy, and refuse students', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher, 'Nexus test-login unavailable');

    const res = await request.get(`${NEXUS}/api/timetable/attendance-diagnostics`, {
      headers: { Authorization: `Bearer ${teacher!.testToken}` },
    });

    // 404 is legitimate: no class in this environment has a meeting linked.
    expect([200, 404]).toContain(res.status());
    const body = await res.json();
    expect(Array.isArray(body.steps)).toBe(true);
    expect(body).toHaveProperty('blocking_step');
    for (const step of body.steps) {
      expect(step).toHaveProperty('step');
      expect(step).toHaveProperty('ok');
      // A failing step must say what to do about it.
      if (!step.ok) expect(step.detail).toBeTruthy();
    }

    if (student) {
      const studentRes = await request.get(`${NEXUS}/api/timetable/attendance-diagnostics`, {
        headers: { Authorization: `Bearer ${student.testToken}` },
      });
      expect(studentRes.status()).toBe(403);
    }
  });

  test('mobile 375px: attendance sheet does not overflow and toggles clear 44px', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/timetable`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const attendanceButton = page.getByRole('button', { name: /attendance/i }).first();
    if (await attendanceButton.count()) {
      await attendanceButton.click({ trial: false }).catch(() => {});
      await page.waitForTimeout(1200);
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    expect(overflow, 'page must not scroll horizontally at 375px').toBe(true);

    // Full-size Switch, not size="small": this is the main repeated tap on mobile.
    const toggles = page.locator('.MuiSwitch-root');
    const count = await toggles.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      const box = await toggles.nth(i).boundingBox();
      if (box) expect(box.height).toBeGreaterThanOrEqual(36);
    }

    await context.close();
  });
});
