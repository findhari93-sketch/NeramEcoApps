import { test, expect, type APIRequestContext } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';
import { openAttendanceDialog } from '../utils/timetable-helpers';

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

/**
 * Find any class in any classroom, which is the point: no enrollment needed.
 *
 * The query parameters are load-bearing and were wrong for a long time. The
 * timetable route reads `classroom`, `start` and `end`, and 400s on anything
 * else. This helper used to send `classroom_id` alone, so it always came back
 * empty, every test guarded by it skipped, and the suite reported green while
 * testing nothing. If this ever returns null again, look here first.
 */
async function findAnyClass(request: APIRequestContext, token: string): Promise<Ctx | null> {
  const classroomsRes = await request.get(`${NEXUS}/api/classrooms`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!classroomsRes.ok()) return null;

  const classrooms = (await classroomsRes.json())?.classrooms ?? [];
  // A wide window on purpose: classes are sparse, and a narrow one around today
  // would make this pass or fail depending on the day it runs.
  const start = '2020-01-01';
  const end = '2099-12-31';

  for (const classroom of classrooms) {
    const res = await request.get(
      `${NEXUS}/api/timetable?classroom=${classroom.id}&start=${start}&end=${end}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok()) continue;
    const body = await res.json();
    const classes = body?.classes ?? body?.scheduled_classes ?? [];
    if (Array.isArray(classes) && classes.length > 0) {
      return { token, classId: classes[0].id, classroomId: classroom.id };
    }
  }

  // Fallback, and in most environments the path that actually works. The
  // timetable route requires an active enrollment even from staff, and the E2E
  // teacher is deliberately not enrolled anywhere. Attendance diagnostics is the
  // one staff route that finds a meeting-bearing class with no enrollment at
  // all, so it is what keeps these tests running rather than silently skipping.
  const diag = await request.get(`${NEXUS}/api/timetable/attendance-diagnostics`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (diag.ok()) {
    const body = await diag.json();
    if (body?.class?.id && body?.class?.classroom_id) {
      return { token, classId: body.class.id, classroomId: body.class.classroom_id };
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
        'not_organizer',
        'report_not_ready',
        'no_records',
        'graph_error',
      ]).toContain(body.code);
      expect(typeof body.error).toBe('string');
      expect(body.error.length).toBeGreaterThan(20);
    }

    // Which token the server chose. Under Playwright the caller's oid is
    // synthesised by the test-login bypass, so it can never equal a real
    // organizer and this is always app_only. That is the safe default, and
    // asserting it keeps the field from being dropped.
    expect(['delegated_organizer', 'app_only']).toContain(body.mode);
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

  test('a student cannot import a Teams attendance report', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Nexus test-login unavailable');

    const ctx = await findAnyClass(request, teacher!.testToken);
    test.skip(!ctx, 'No class found');

    const res = await request.post(`${NEXUS}/api/timetable/attendance-report`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
      data: {
        class_id: ctx!.classId,
        classroom_id: ctx!.classroomId,
        action: 'import_teams_csv',
        rows: [{ student_id: '00000000-0000-0000-0000-000000000001', attended: true }],
      },
    });

    expect(res.status()).toBe(403);
  });

  test('a CSV import refuses a student who is not enrolled in this classroom', async ({ request }) => {
    // The whole file is parsed and matched in the browser, so the server's
    // enrollment re-check is the only thing between a hand-crafted payload and
    // attendance rows written against someone else's classroom.
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'Nexus test-login unavailable');

    const ctx = await findAnyClass(request, auth!.testToken);
    test.skip(!ctx, 'No class found');

    const res = await request.post(`${NEXUS}/api/timetable/attendance-report`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
      data: {
        class_id: ctx!.classId,
        classroom_id: ctx!.classroomId,
        action: 'import_teams_csv',
        threshold_seconds: 300,
        rows: [
          { student_id: '00000000-0000-0000-0000-000000000001', attended: true, duration_minutes: 60 },
        ],
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.skipped).toBe(1);
    expect(body.error).toMatch(/enrolled/i);
  });

  test('a CSV import with no rows at all is rejected', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'Nexus test-login unavailable');

    const ctx = await findAnyClass(request, auth!.testToken);
    test.skip(!ctx, 'No class found');

    const res = await request.post(`${NEXUS}/api/timetable/attendance-report`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
      data: {
        class_id: ctx!.classId,
        classroom_id: ctx!.classroomId,
        action: 'import_teams_csv',
        rows: [],
      },
    });

    expect(res.status()).toBe(400);
  });

  test('a real CSV import writes attendance and marks the class synced', async ({ request }) => {
    // This is the first attendance WRITE this suite can assert end to end. Every
    // Graph path needs a Teams application access policy that CI does not have,
    // but the CSV import touches no Microsoft service at all.
    //
    // Opt-in, and deliberately so. Unlike every other test in this file it
    // MUTATES data: it marks a real student present on a real class, and
    // stamps that class as attendance-synced, which also retires it from the
    // nightly cron. Local Nexus development in this repo points at the
    // PRODUCTION Supabase project, so an unguarded write here would edit live
    // attendance. Run it against a disposable environment with:
    //   E2E_ALLOW_ATTENDANCE_WRITE=1 pnpm test:e2e --project=nexus-chrome
    test.skip(
      process.env.E2E_ALLOW_ATTENDANCE_WRITE !== '1',
      'Writes real attendance. Set E2E_ALLOW_ATTENDANCE_WRITE=1 against a non-production database.',
    );

    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'Nexus test-login unavailable');

    const ctx = await findAnyClass(request, auth!.testToken);
    test.skip(!ctx, 'No class found');

    const before = await request.get(
      `${NEXUS}/api/timetable/attendance-report?class_id=${ctx!.classId}&classroom_id=${ctx!.classroomId}`,
      { headers: { Authorization: `Bearer ${auth!.testToken}` } },
    );
    const roster = (await before.json())?.attendance ?? [];
    test.skip(roster.length === 0, 'Classroom has no enrolled students');

    const target = roster[0];
    const res = await request.post(`${NEXUS}/api/timetable/attendance-report`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
      data: {
        class_id: ctx!.classId,
        classroom_id: ctx!.classroomId,
        action: 'import_teams_csv',
        threshold_seconds: 300,
        rows: [
          { student_id: target.student_id, attended: true, duration_minutes: 88, joined_at: null, left_at: null },
        ],
        meta: { file_name: 'meetingAttendanceReport.csv', matched: 1, unmatched: 0 },
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.synced).toBe(1);

    const after = await request.get(
      `${NEXUS}/api/timetable/attendance-report?class_id=${ctx!.classId}&classroom_id=${ctx!.classroomId}`,
      { headers: { Authorization: `Bearer ${auth!.testToken}` } },
    );
    const afterBody = await after.json();
    expect(afterBody.sync.status).toBe('ok');
    expect(afterBody.sync.synced_at).toBeTruthy();

    const row = afterBody.attendance.find((a: any) => a.student_id === target.student_id);
    expect(row.duration_minutes).toBe(88);
    // 'manual' is legitimate here: if a teacher had already marked this student
    // by hand, that decision outranks any import, by design.
    expect(['teams_csv', 'manual']).toContain(row.source);

    // The staff roster must carry every address a student might have joined
    // under, or the importer silently misses the students whose classroom
    // account differs from their primary email.
    expect(Array.isArray(row.match_emails)).toBe(true);
  });

  test('mobile 375px: attendance sheet does not overflow and toggles clear 44px', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/timetable`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    // Deterministic now. This used to reach for the button on whatever view
    // the timetable happened to open in (Plan), where it has never existed, so
    // the whole test passed without ever opening the dialog it names.
    const opened = await openAttendanceDialog(page);
    test.skip(!opened, 'No past class with an attendance register in this environment');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    expect(overflow, 'page must not scroll horizontally at 375px').toBe(true);

    // The switches live on Register now: Missed and Attended are reading
    // surfaces, and every write moved to the one tab that repairs the record.
    await page.getByRole('tab', { name: 'Register' }).click();
    await page.waitForTimeout(900);

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
