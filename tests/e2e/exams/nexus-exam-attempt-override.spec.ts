import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../../utils/credentials';

/**
 * A teacher's one-click "+1 attempt" from the invigilation roster, once a
 * student has used up gating.attempt_limit on a scheduled/practice test.
 *
 * Exhausts a real 1-attempt practice test, confirms the second attempt is
 * genuinely refused, grants the override, then confirms it genuinely opens
 * the door -- not just that the grant endpoint returns 200.
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

test.describe('Exam attempt override', () => {
  let examId: string | null = null;
  let teacherToken: string | null = null;

  test.afterAll(async ({ request }) => {
    if (!examId || !teacherToken) return;
    await request
      .delete(`${NEXUS}/api/exams/${examId}`, { headers: { Authorization: `Bearer ${teacherToken}` } })
      .catch(() => null);
  });

  test('a teacher grant lets a student who exhausted their one attempt sit it again', async ({
    request,
  }) => {
    // Real network, ~8 sequential calls including two live exam-schedule POSTs
    // that each take 10-16s in this environment (Teams announce + student
    // notify fan-out) -- comfortably past the 30s default.
    test.setTimeout(90_000);
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Nexus dev server / test-login unavailable');
    teacherToken = teacher!.testToken;

    const classroomId = student!.classrooms?.[0]?.id;
    const studentId = student!.user?.id;
    test.skip(!classroomId || !studentId, 'Test student account has no classroom enrolment');

    const paper = await firstTest(request, teacher!.testToken);
    test.skip(!paper, 'No paper available in the library to schedule');

    const scheduled = await request.post(`${NEXUS}/api/exams`, {
      headers: { Authorization: `Bearer ${teacher!.testToken}` },
      data: {
        classroom_ids: [classroomId],
        test_id: paper!.id,
        title: 'E2E attempt-override practice test',
        opens_at: new Date(Date.now() - 60_000).toISOString(),
        closes_at: new Date(Date.now() + 3600_000).toISOString(),
        mode: 'practice',
        attempt_limit: 1,
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

    const openUrl = `${NEXUS}/api/tests/attempt?test_id=${paper!.id}&placement_id=${placementId}`;

    // ── Use the one allowed attempt ─────────────────────────────────────
    const first = await request.get(openUrl, { headers: { Authorization: `Bearer ${student!.testToken}` } });
    expect(first.ok()).toBeTruthy();
    const attemptId = (await first.json()).attempt.id;

    const submitted = await request.post(`${NEXUS}/api/tests/attempt`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
      data: { attempt_id: attemptId, action: 'submit' },
    });
    expect(submitted.ok()).toBeTruthy();

    // ── Confirmed exhausted: a second sitting is genuinely refused ──────
    const blocked = await request.get(openUrl, { headers: { Authorization: `Bearer ${student!.testToken}` } });
    expect(blocked.status()).toBe(403);
    expect((await blocked.json()).code).toBe('ATTEMPT_LIMIT_REACHED');

    // ── Roster shows exhausted before the grant ──────────────────────────
    const rosterBefore = await request.get(`${NEXUS}/api/exams/${examId}/roster`, {
      headers: { Authorization: `Bearer ${teacher!.testToken}` },
    });
    if (rosterBefore.ok()) {
      const row = (await rosterBefore.json()).data.rows.find((r: any) => r.student_id === studentId);
      if (row) {
        expect(row.attempts_allowed).toBe(1);
        expect(row.exhausted).toBe(true);
      }
    }

    // ── The teacher's one-click grant ───────────────────────────────────
    const granted = await request.post(`${NEXUS}/api/exams/${examId}/attempt-override`, {
      headers: { Authorization: `Bearer ${teacher!.testToken}` },
      data: { student_id: studentId },
    });
    expect(granted.status()).toBe(201);
    expect((await granted.json()).data.override.extra_attempts).toBe(1);

    // ── The door genuinely reopens, not just the grant call succeeding ──
    const second = await request.get(openUrl, { headers: { Authorization: `Bearer ${student!.testToken}` } });
    expect(second.ok()).toBeTruthy();
    expect((await second.json()).attempt.attempt_number).toBe(2);

    const rosterAfter = await request.get(`${NEXUS}/api/exams/${examId}/roster`, {
      headers: { Authorization: `Bearer ${teacher!.testToken}` },
    });
    if (rosterAfter.ok()) {
      const row = (await rosterAfter.json()).data.rows.find((r: any) => r.student_id === studentId);
      if (row) expect(row.attempts_allowed).toBe(2);
    }
  });

  test('unauthorized: a student cannot grant themselves another attempt', async ({ request }) => {
    const student = await getTestAuthToken(request, 'student');
    test.skip(!student, 'No student token available in this environment');
    test.skip(!examId, 'No exam scheduled to target');

    const res = await request.post(`${NEXUS}/api/exams/${examId}/attempt-override`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
      data: { student_id: student!.user?.id },
    });
    expect([401, 403]).toContain(res.status());
  });
});
