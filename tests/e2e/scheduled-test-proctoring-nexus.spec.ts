import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * Proctoring's server contract: nexus_exams.proctoring_enabled/violation_limit
 * flow through to GET /api/tests/attempt's `proctoring` field, each violation
 * POST to /api/tests/attempt/violation returns an authoritative running count,
 * and the sitting auto-submits through the SAME submitAttempt path a normal
 * submit uses once the server says should_auto_submit.
 *
 * Deliberately API-level rather than driving real browser visibilitychange/
 * fullscreen events: those are unreliable to trust across CI environments
 * (headless Chromium's Fullscreen API support varies), where this contract
 * -- what the server actually decides -- does not. The take page's own
 * wiring (the interstitial, the warning toast) is exercised by
 * scheduled-test-proctoring-nexus-mobile.spec.ts, which checks what renders
 * rather than trying to fake the events that would drive it.
 *
 * Self-skips whenever the shared teacher/student classroom, a library paper,
 * or the environment itself is not available -- see the credentials.ts note
 * on Entra MFA blocking a real Microsoft login for e2e.
 */

const NEXUS = APP_URLS.nexus;

async function firstTest(request: any, token: string): Promise<{ id: string } | null> {
  const res = await request.get(`${NEXUS}/api/question-bank/tests/library`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) return null;
  const json = await res.json();
  const tests = json?.data?.tests ?? json?.data ?? [];
  // Newest-first, so tests[0] on a shared staging library is as likely to be an
  // empty draft shell left over from another suite's run as a real paper.
  const withQuestions = Array.isArray(tests) ? tests.find((t: any) => (t.question_count || 0) > 0) : null;
  return withQuestions ? { id: withQuestions.id } : null;
}

test.describe('Scheduled test proctoring: the server-side contract', () => {
  let examId: string | null = null;
  let teacherToken: string | null = null;

  test.afterAll(async ({ request }) => {
    if (!examId || !teacherToken) return;
    await request
      .delete(`${NEXUS}/api/exams/${examId}`, { headers: { Authorization: `Bearer ${teacherToken}` } })
      .catch(() => null);
  });

  test('warns twice then auto-submits on the third strike, via the real submit path', async ({
    request,
  }) => {
    // Real network: the exam-schedule POST alone takes 10-16s in this
    // environment (Teams announce + student notify fan-out), and this test
    // chains several more calls after it.
    test.setTimeout(90_000);
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Nexus dev server / test-login unavailable');
    teacherToken = teacher!.testToken;

    const classroomId = student!.classrooms?.[0]?.id;
    test.skip(!classroomId, 'Test student account has no classroom enrolment');

    const paper = await firstTest(request, teacher!.testToken);
    test.skip(!paper, 'No paper available in the library to schedule');

    // Generous attempt limit: the attempt-limit path is covered by
    // nexus-exam-attempt-override.spec.ts, this test is only about violations.
    const scheduled = await request.post(`${NEXUS}/api/exams`, {
      headers: { Authorization: `Bearer ${teacher!.testToken}` },
      data: {
        classroom_ids: [classroomId],
        test_id: paper!.id,
        title: 'E2E proctored practice test',
        opens_at: new Date(Date.now() - 60_000).toISOString(),
        closes_at: new Date(Date.now() + 3600_000).toISOString(),
        mode: 'practice',
        attempt_limit: 5,
        proctoring_enabled: true,
        violation_limit: 2,
      },
    });
    if (scheduled.status() !== 201) {
      test.skip(true, 'Could not schedule into the student account\'s classroom in this environment');
      return;
    }
    const scheduledBody = await scheduled.json();
    examId = scheduledBody.data.exams[0].id;

    const examRes = await request.get(`${NEXUS}/api/exams/${examId}`, {
      headers: { Authorization: `Bearer ${teacher!.testToken}` },
    });
    const placementId = (await examRes.json()).data.placement?.id;
    test.skip(!placementId, 'Scheduled test has no placement to open');

    // ── Student starts the sitting ──────────────────────────────────────
    const startRes = await request.get(
      `${NEXUS}/api/tests/attempt?test_id=${paper!.id}&placement_id=${placementId}`,
      { headers: { Authorization: `Bearer ${student!.testToken}` } },
    );
    expect(startRes.ok()).toBeTruthy();
    const startBody = await startRes.json();
    const attemptId = startBody.attempt.id;

    // The GET response is what turns proctoring on for the take page at all.
    expect(startBody.proctoring).toMatchObject({ enabled: true, violation_limit: 2 });

    // ── Strike 1: logged, not yet enough ────────────────────────────────
    const v1 = await request.post(`${NEXUS}/api/tests/attempt/violation`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
      data: { attempt_id: attemptId, kind: 'tab_switch' },
    });
    expect(v1.ok()).toBeTruthy();
    const v1Body = await v1.json();
    expect(v1Body.violation_count).toBe(1);
    expect(v1Body.should_auto_submit).toBe(false);

    // ── Strike 2: crosses violation_limit ───────────────────────────────
    const v2 = await request.post(`${NEXUS}/api/tests/attempt/violation`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
      data: { attempt_id: attemptId, kind: 'fullscreen_exit' },
    });
    expect(v2.ok()).toBeTruthy();
    const v2Body = await v2.json();
    expect(v2Body.violation_count).toBe(2);
    expect(v2Body.limit).toBe(2);
    expect(v2Body.should_auto_submit).toBe(true);

    // ── What the take page does next: submit through the real path ─────
    const submitRes = await request.post(`${NEXUS}/api/tests/attempt`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
      data: { attempt_id: attemptId, action: 'submit' },
    });
    expect(submitRes.ok()).toBeTruthy();
    expect((await submitRes.json()).attempt.status).toBe('submitted');

    // A violation against an already-submitted attempt is settled, not an error.
    const v3 = await request.post(`${NEXUS}/api/tests/attempt/violation`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
      data: { attempt_id: attemptId, kind: 'tab_switch' },
    });
    expect(v3.ok()).toBeTruthy();
    expect((await v3.json()).should_auto_submit).toBe(false);
  });

  test('a violation against an unknown attempt id 404s rather than leaking anything', async ({
    request,
  }) => {
    const student = await getTestAuthToken(request, 'student');
    test.skip(!student, 'No student token available in this environment');

    const res = await request.post(`${NEXUS}/api/tests/attempt/violation`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
      data: { attempt_id: '00000000-0000-0000-0000-000000000000', kind: 'tab_switch' },
    });
    expect(res.status()).toBe(404);
  });

  test('an ordinary (non-exam) test never carries a proctoring field', async ({ request }) => {
    const student = await getTestAuthToken(request, 'student');
    test.skip(!student, 'No student token available in this environment');

    const res = await request.get(`${NEXUS}/api/question-bank/tests/library`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
    });
    test.skip(!res.ok(), 'Library not reachable for this account');
    const tests = (await res.json())?.data?.tests ?? [];
    test.skip(tests.length === 0, 'No paper available to open as a plain practice test');

    const started = await request.get(`${NEXUS}/api/tests/attempt?test_id=${tests[0].id}`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
    });
    if (!started.ok()) {
      test.skip(true, 'This paper is not directly openable without a placement in this environment');
      return;
    }
    expect((await started.json()).proctoring).toBeNull();
  });
});
