import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../../utils/credentials';

/**
 * Scheduling a PRACTICE test rather than a ranked exam: a shuffled subset, a
 * chosen attempt limit, and no rank/leaderboard machinery.
 *
 * mode/proctoring_enabled/violation_limit are additive to the existing exam
 * engine (see 20260901090100_nexus_scheduled_test_practice_proctoring.sql),
 * so this suite only pins the NEW behavior; nexus-exam-schedule.spec.ts next
 * door already covers the unchanged ranked-exam path.
 */

async function firstClassroom(request: any, token: string): Promise<string | null> {
  const res = await request.get(`${APP_URLS.nexus}/api/classrooms`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) return null;
  const json = await res.json();
  const rooms = json?.classrooms ?? json?.data?.classrooms ?? json?.data ?? [];
  return Array.isArray(rooms) && rooms.length > 0 ? rooms[0].id : null;
}

async function firstTest(request: any, token: string): Promise<{ id: string; questionCount: number } | null> {
  const res = await request.get(`${APP_URLS.nexus}/api/question-bank/tests/library`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) return null;
  const json = await res.json();
  const tests = json?.data?.tests ?? json?.data ?? [];
  // Newest-first, so tests[0] on a shared staging library is as likely to be an
  // empty draft shell left over from another suite's run as a real paper.
  const withQuestions = Array.isArray(tests) ? tests.find((t: any) => (t.question_count || 0) > 0) : null;
  return withQuestions ? { id: withQuestions.id, questionCount: withQuestions.question_count || 0 } : null;
}

test.describe('Scheduled tests: practice mode', () => {
  const created: string[] = [];

  test.afterAll(async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) return;
    for (const id of created) {
      await request
        .delete(`${APP_URLS.nexus}/api/exams/${id}`, {
          headers: { Authorization: `Bearer ${auth.testToken}` },
        })
        .catch(() => null);
    }
  });

  test('a practice test stores mode, attempt_limit and violation_limit, and skips results-publish state', async ({
    request,
  }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'No teacher token available in this environment');

    const [classroomId, paper] = await Promise.all([
      firstClassroom(request, auth!.testToken),
      firstTest(request, auth!.testToken),
    ]);
    test.skip(!classroomId || !paper, 'No classroom or paper available to schedule');

    const opens = new Date(Date.now() + 3600_000).toISOString();
    const closes = new Date(Date.now() + 7200_000).toISOString();

    const res = await request.post(`${APP_URLS.nexus}/api/exams`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
      data: {
        classroom_ids: [classroomId],
        test_id: paper!.id,
        title: 'E2E practice test',
        opens_at: opens,
        closes_at: closes,
        duration_minutes: 45,
        mode: 'practice',
        attempt_limit: 3,
        proctoring_enabled: true,
        violation_limit: 2,
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    const examId = body.data.exams[0].id;
    created.push(examId);

    const fetched = await request.get(`${APP_URLS.nexus}/api/exams/${examId}`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
    });
    expect(fetched.ok()).toBeTruthy();
    const examBody = await fetched.json();

    expect(examBody.data.exam.mode).toBe('practice');
    expect(examBody.data.exam.proctoring_enabled).toBe(true);
    expect(examBody.data.exam.violation_limit).toBe(2);
    // The historical default results_state, untouched: practice mode simply
    // never drives it away from 'unpublished' -- there is no rank to publish.
    expect(examBody.data.exam.results_state).toBe('unpublished');
    expect(examBody.data.placement.gating.attempt_limit).toBe(3);
  });

  test('a ranked exam (the default, no mode sent) still stores the historical 1-attempt gating', async ({
    request,
  }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'No teacher token available in this environment');

    const [classroomId, paper] = await Promise.all([
      firstClassroom(request, auth!.testToken),
      firstTest(request, auth!.testToken),
    ]);
    test.skip(!classroomId || !paper, 'No classroom or paper available to schedule');

    const opens = new Date(Date.now() + 3600_000).toISOString();
    const closes = new Date(Date.now() + 7200_000).toISOString();

    const res = await request.post(`${APP_URLS.nexus}/api/exams`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
      data: {
        classroom_ids: [classroomId],
        test_id: paper!.id,
        title: 'E2E ranked exam (unchanged default)',
        opens_at: opens,
        closes_at: closes,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    const examId = body.data.exams[0].id;
    created.push(examId);

    const fetched = await request.get(`${APP_URLS.nexus}/api/exams/${examId}`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
    });
    const examBody = await fetched.json();
    expect(examBody.data.exam.mode).toBe('ranked');
    expect(examBody.data.exam.proctoring_enabled).toBe(false);
    expect(examBody.data.placement.gating.attempt_limit).toBe(1);
  });

  test('unauthorized: a student cannot schedule a practice test either', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    test.skip(!auth, 'No student token available in this environment');

    const res = await request.post(`${APP_URLS.nexus}/api/exams`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
      data: {
        classroom_ids: ['x'],
        test_id: 'y',
        opens_at: '2026-01-01T00:00:00.000Z',
        closes_at: '2026-01-02T00:00:00.000Z',
        mode: 'practice',
      },
    });
    expect([401, 403]).toContain(res.status());
  });
});
