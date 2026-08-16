import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../../utils/credentials';
import { assertNoHorizontalOverflow } from '../../utils/mobile-helpers';
import {
  seedEligibilityFixture,
  markAttended,
  markAbsence,
  cleanupEligibilityFixture,
  type EligibilityFixture,
} from '../../utils/nexus-exam-eligibility-factory';

/**
 * A scheduled test is mandatory only for students who attended (or caught up
 * on) the class(es) it covers -- everyone else is auto-excused, with the
 * new-joiner bucket getting a self-serve reschedule and no other bucket
 * needing one (Phase 2). See apps/nexus/src/lib/exam-eligibility-roster.ts
 * for the bucket rules this spec is checking end to end.
 *
 * Each scenario gets its own throwaway classroom (see the factory) so the
 * three buckets never have to share fixture state, and so a failure in one
 * scenario cannot leave stale attendance/absence rows behind for another.
 */

const DAY_MS = 86_400_000;

async function firstLibraryTestId(request: any, token: string): Promise<string | null> {
  const res = await request.get(`${APP_URLS.nexus}/api/question-bank/tests/library`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) return null;
  const json = await res.json();
  const tests = json?.data?.tests ?? json?.data ?? [];
  return Array.isArray(tests) && tests.length > 0 ? tests[0].id : null;
}

async function scheduleExam(
  request: any,
  token: string,
  fixture: EligibilityFixture,
  testId: string,
  coveredClassIds: string[],
): Promise<string> {
  const res = await request.post(`${APP_URLS.nexus}/api/exams`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      classroom_ids: [fixture.classroomId],
      test_id: testId,
      title: 'E2E Eligibility Exam',
      opens_at: new Date(Date.now() + 3600_000).toISOString(),
      closes_at: new Date(Date.now() + 7200_000).toISOString(),
      duration_minutes: 30,
      passing_pct: 40,
      covered_class_ids: coveredClassIds,
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const body = await res.json();
  return body.data.exams[0].id as string;
}

test.describe('Exam eligibility', () => {
  let teacherToken: string | null;
  let studentToken: string | null;

  test.beforeAll(async ({ request }) => {
    const [t, s] = await Promise.all([
      getTestAuthToken(request, 'teacher'),
      getTestAuthToken(request, 'student'),
    ]);
    teacherToken = t?.testToken ?? null;
    studentToken = s?.testToken ?? null;
  });

  test('AC1: attended both covered classes -> mandatory_attended', async ({ request }) => {
    test.skip(!teacherToken, 'No teacher token available in this environment');
    const testId = await firstLibraryTestId(request, teacherToken!);
    test.skip(!testId, 'No paper available in the library to schedule');

    const fixture = await seedEligibilityFixture({
      studentEnrolledAt: new Date(Date.now() - 10 * DAY_MS).toISOString(),
    });
    try {
      await Promise.all([
        markAttended(fixture.lectureClassIds[0], fixture.studentUserId),
        markAttended(fixture.lectureClassIds[1], fixture.studentUserId),
      ]);

      const examId = await scheduleExam(request, teacherToken!, fixture, testId!, fixture.lectureClassIds);

      const res = await request.get(`${APP_URLS.nexus}/api/exams/${examId}/eligibility`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      const row = body.data.rows.find((r: any) => r.student_id === fixture.studentUserId);
      expect(row?.bucket).toBe('mandatory_attended');
      expect(row?.is_mandatory).toBe(true);
      expect(body.data.summary.mandatory).toBeGreaterThanOrEqual(1);
    } finally {
      await cleanupEligibilityFixture(fixture.classroomId);
    }
  });

  test('AC2: missed both, neither caught up -> excused_pending_catchup, and self-serve reschedule refuses it', async ({
    request,
  }) => {
    test.skip(!teacherToken || !studentToken, 'No token available in this environment');
    const testId = await firstLibraryTestId(request, teacherToken!);
    test.skip(!testId, 'No paper available in the library to schedule');

    const fixture = await seedEligibilityFixture({
      studentEnrolledAt: new Date(Date.now() - 10 * DAY_MS).toISOString(),
    });
    try {
      // No attendance, no absence rows at all: the missing-evidence fallback
      // this bucket also covers, exercised for real rather than only in the
      // unit tests.
      const examId = await scheduleExam(request, teacherToken!, fixture, testId!, fixture.lectureClassIds);

      const res = await request.get(`${APP_URLS.nexus}/api/exams/${examId}/eligibility`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      const body = await res.json();
      const row = body.data.rows.find((r: any) => r.student_id === fixture.studentUserId);
      expect(row?.bucket).toBe('excused_pending_catchup');
      expect(row?.is_mandatory).toBe(false);

      // This bucket has no self-serve path (Phase 2, teacher-only) -- the
      // student route must refuse it, not silently allow a reschedule.
      const optionsRes = await request.get(`${APP_URLS.nexus}/api/student/exams/${examId}/reschedule-options`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(optionsRes.status()).toBe(403);
    } finally {
      await cleanupEligibilityFixture(fixture.classroomId);
    }
  });

  test('AC3: missed one, caught up on it -> mandatory_caught_up', async ({ request }) => {
    test.skip(!teacherToken, 'No teacher token available in this environment');
    const testId = await firstLibraryTestId(request, teacherToken!);
    test.skip(!testId, 'No paper available in the library to schedule');

    const fixture = await seedEligibilityFixture({
      studentEnrolledAt: new Date(Date.now() - 10 * DAY_MS).toISOString(),
    });
    try {
      await markAbsence(fixture.lectureClassIds[0], fixture.classroomId, fixture.studentUserId, { caughtUp: true });
      await markAbsence(fixture.lectureClassIds[1], fixture.classroomId, fixture.studentUserId, { caughtUp: true });

      const examId = await scheduleExam(request, teacherToken!, fixture, testId!, fixture.lectureClassIds);
      const res = await request.get(`${APP_URLS.nexus}/api/exams/${examId}/eligibility`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      const body = await res.json();
      const row = body.data.rows.find((r: any) => r.student_id === fixture.studentUserId);
      expect(row?.bucket).toBe('mandatory_caught_up');
      expect(row?.is_mandatory).toBe(true);
    } finally {
      await cleanupEligibilityFixture(fixture.classroomId);
    }
  });

  test('AC4: enrolled after both covered classes -> excused_new_joiner, and self-serve reschedule succeeds', async ({
    request,
  }) => {
    test.skip(!teacherToken || !studentToken, 'No token available in this environment');
    const testId = await firstLibraryTestId(request, teacherToken!);
    test.skip(!testId, 'No paper available in the library to schedule');

    // Enrolled "tomorrow" relative to both lecture dates (which are 4 and 2
    // days in the past), so this is unambiguously a new joiner.
    const fixture = await seedEligibilityFixture({ studentEnrolledAt: new Date().toISOString() });
    try {
      const examId = await scheduleExam(request, teacherToken!, fixture, testId!, fixture.lectureClassIds);

      const eligRes = await request.get(`${APP_URLS.nexus}/api/exams/${examId}/eligibility`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      const eligBody = await eligRes.json();
      const row = eligBody.data.rows.find((r: any) => r.student_id === fixture.studentUserId);
      expect(row?.bucket).toBe('excused_new_joiner');
      expect(row?.is_mandatory).toBe(false);

      // Self-serve: options, then a real reschedule, with no teacher involved.
      const optionsRes = await request.get(`${APP_URLS.nexus}/api/student/exams/${examId}/reschedule-options`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(optionsRes.ok()).toBeTruthy();
      const options = (await optionsRes.json()).data;
      expect(options.eligible).toBe(true);
      expect(options.min_date <= options.max_date).toBe(true);

      const rescheduleRes = await request.post(`${APP_URLS.nexus}/api/student/exams/${examId}/reschedule`, {
        headers: { Authorization: `Bearer ${studentToken}` },
        data: { date: options.min_date },
      });
      expect(rescheduleRes.status(), await rescheduleRes.text()).toBe(201);
      const makeup = (await rescheduleRes.json()).data.makeup;
      expect(makeup.source).toBe('self_serve_new_joiner');
    } finally {
      await cleanupEligibilityFixture(fixture.classroomId);
    }
  });

  test('AC5: an exam with nothing covered stays mandatory for everyone, unchanged from before this feature', async ({
    request,
  }) => {
    test.skip(!teacherToken, 'No teacher token available in this environment');
    const testId = await firstLibraryTestId(request, teacherToken!);
    test.skip(!testId, 'No paper available in the library to schedule');

    // Enrolled after the lectures AND never attended -- if the empty-covered
    // default were broken this student would show excused, not mandatory.
    const fixture = await seedEligibilityFixture({ studentEnrolledAt: new Date().toISOString() });
    try {
      const examId = await scheduleExam(request, teacherToken!, fixture, testId!, []);
      const res = await request.get(`${APP_URLS.nexus}/api/exams/${examId}/eligibility`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      const body = await res.json();
      expect(body.data.covered_classes).toHaveLength(0);
      const row = body.data.rows.find((r: any) => r.student_id === fixture.studentUserId);
      expect(row?.bucket).toBe('mandatory_attended');
      expect(row?.is_mandatory).toBe(true);
    } finally {
      await cleanupEligibilityFixture(fixture.classroomId);
    }
  });

  test('AC6: a teacher override always wins, and clearing it restores the automatic bucket', async ({ request }) => {
    test.skip(!teacherToken, 'No teacher token available in this environment');
    const testId = await firstLibraryTestId(request, teacherToken!);
    test.skip(!testId, 'No paper available in the library to schedule');

    const fixture = await seedEligibilityFixture({
      studentEnrolledAt: new Date(Date.now() - 10 * DAY_MS).toISOString(),
    });
    try {
      // No attendance/catch-up: starts excused_pending_catchup.
      const examId = await scheduleExam(request, teacherToken!, fixture, testId!, fixture.lectureClassIds);

      const setRes = await request.post(`${APP_URLS.nexus}/api/exams/${examId}/eligibility-override`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
        data: { student_id: fixture.studentUserId, override: 'mandatory', note: 'E2E override' },
      });
      expect(setRes.status()).toBe(201);

      const afterSet = await (
        await request.get(`${APP_URLS.nexus}/api/exams/${examId}/eligibility`, {
          headers: { Authorization: `Bearer ${teacherToken}` },
        })
      ).json();
      const overriddenRow = afterSet.data.rows.find((r: any) => r.student_id === fixture.studentUserId);
      expect(overriddenRow?.bucket).toBe('teacher_override_mandatory');
      expect(overriddenRow?.is_mandatory).toBe(true);
      // The automatic read is preserved underneath the override, not erased.
      expect(overriddenRow?.auto_bucket).toBe('excused_pending_catchup');

      const clearRes = await request.delete(
        `${APP_URLS.nexus}/api/exams/${examId}/eligibility-override?student_id=${fixture.studentUserId}`,
        { headers: { Authorization: `Bearer ${teacherToken}` } },
      );
      expect(clearRes.ok()).toBeTruthy();

      const afterClear = await (
        await request.get(`${APP_URLS.nexus}/api/exams/${examId}/eligibility`, {
          headers: { Authorization: `Bearer ${teacherToken}` },
        })
      ).json();
      const restoredRow = afterClear.data.rows.find((r: any) => r.student_id === fixture.studentUserId);
      expect(restoredRow?.bucket).toBe('excused_pending_catchup');
      expect(restoredRow?.override).toBeNull();
    } finally {
      await cleanupEligibilityFixture(fixture.classroomId);
    }
  });

  test('unauthorized: a student cannot read the eligibility roster', async ({ request }) => {
    test.skip(!teacherToken || !studentToken, 'No token available in this environment');
    const testId = await firstLibraryTestId(request, teacherToken!);
    test.skip(!testId, 'No paper available in the library to schedule');

    const fixture = await seedEligibilityFixture({
      studentEnrolledAt: new Date(Date.now() - 10 * DAY_MS).toISOString(),
    });
    try {
      const examId = await scheduleExam(request, teacherToken!, fixture, testId!, fixture.lectureClassIds);
      const res = await request.get(`${APP_URLS.nexus}/api/exams/${examId}/eligibility`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect([401, 403]).toContain(res.status());
    } finally {
      await cleanupEligibilityFixture(fixture.classroomId);
    }
  });

  test('unauthorized: an unauthenticated caller cannot read the eligibility roster', async ({ request }) => {
    test.skip(!teacherToken, 'No teacher token available in this environment');
    const testId = await firstLibraryTestId(request, teacherToken!);
    test.skip(!testId, 'No paper available in the library to schedule');

    const fixture = await seedEligibilityFixture({
      studentEnrolledAt: new Date(Date.now() - 10 * DAY_MS).toISOString(),
    });
    try {
      const examId = await scheduleExam(request, teacherToken!, fixture, testId!, fixture.lectureClassIds);
      const res = await request.get(`${APP_URLS.nexus}/api/exams/${examId}/eligibility`);
      expect([401, 403]).toContain(res.status());
    } finally {
      await cleanupEligibilityFixture(fixture.classroomId);
    }
  });

  test('mobile: the schedule dialog entry point fits 375px', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Could not authenticate as teacher in this environment');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${APP_URLS.nexus}/teacher/tests`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await assertNoHorizontalOverflow(page);
  });
});
