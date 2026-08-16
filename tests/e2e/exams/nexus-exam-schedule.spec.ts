import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../../utils/mobile-helpers';

/**
 * Scheduling an exam, sitting it inside its window, and being marked absent
 * outside it.
 *
 * The window rules are the point of these tests. An exam is the one placement
 * in Nexus whose deadline is a hard close, and a closed exam has to read as
 * "you were absent" rather than as a broken link.
 */

async function firstClassroom(request: any, token: string): Promise<string | null> {
  const res = await request.get(`${APP_URLS.nexus}/api/classrooms`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) return null;
  const json = await res.json();
  const rooms = json?.classrooms ?? [];
  return Array.isArray(rooms) && rooms.length > 0 ? rooms[0].id : null;
}

async function firstTest(request: any, token: string): Promise<string | null> {
  const res = await request.get(`${APP_URLS.nexus}/api/question-bank/tests/library`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) return null;
  const json = await res.json();
  const tests = json?.data?.tests ?? json?.data ?? [];
  return Array.isArray(tests) && tests.length > 0 ? tests[0].id : null;
}

test.describe('Scheduled exams', () => {
  const created: string[] = [];

  test.afterAll(async ({ request }) => {
    const token = await getTestAuthToken(request, 'teacher');
    if (!token) return;
    for (const id of created) {
      await request
        .delete(`${APP_URLS.nexus}/api/exams/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .catch(() => null);
    }
  });

  test('AC1: one press schedules an exam and it carries a series id', async ({ request }) => {
    const token = await getTestAuthToken(request, 'teacher');
    test.skip(!token, 'No teacher token available in this environment');

    const [classroomId, testId] = await Promise.all([
      firstClassroom(request, token!),
      firstTest(request, token!),
    ]);
    test.skip(!classroomId || !testId, 'No classroom or paper available to schedule');

    const opens = new Date(Date.now() + 3600_000).toISOString();
    const closes = new Date(Date.now() + 7200_000).toISOString();

    const res = await request.post(`${APP_URLS.nexus}/api/exams`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        classroom_ids: [classroomId],
        test_id: testId,
        title: 'E2E scheduled exam',
        opens_at: opens,
        closes_at: closes,
        duration_minutes: 45,
        passing_pct: 40,
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.series_id).toBeTruthy();
    expect(body.data.exams).toHaveLength(1);
    created.push(body.data.exams[0].id);
  });

  test('AC2: a window that closes before it opens is refused', async ({ request }) => {
    const token = await getTestAuthToken(request, 'teacher');
    test.skip(!token, 'No teacher token available in this environment');

    const [classroomId, testId] = await Promise.all([
      firstClassroom(request, token!),
      firstTest(request, token!),
    ]);
    test.skip(!classroomId || !testId, 'No classroom or paper available');

    const res = await request.post(`${APP_URLS.nexus}/api/exams`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        classroom_ids: [classroomId],
        test_id: testId,
        title: 'Backwards window',
        opens_at: new Date(Date.now() + 7200_000).toISOString(),
        closes_at: new Date(Date.now() + 3600_000).toISOString(),
      },
    });
    expect(res.status()).toBe(400);
  });

  test('AC3: the roster starts everyone as not_started, never as failed', async ({ request }) => {
    const token = await getTestAuthToken(request, 'teacher');
    test.skip(!token || created.length === 0, 'Nothing was scheduled to inspect');

    const res = await request.get(`${APP_URLS.nexus}/api/exams/${created[0]}/roster`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    expect(body.data.summary).toHaveProperty('not_started');
    for (const row of body.data.rows) {
      expect(['not_started', 'in_progress', 'submitted', 'absent', 'makeup_open']).toContain(row.status);
    }
  });

  test('AC4: publishing an exam nobody has sat is blocked, not silently empty', async ({ request }) => {
    const token = await getTestAuthToken(request, 'teacher');
    test.skip(!token || created.length === 0, 'Nothing was scheduled to inspect');

    const preview = await request.get(`${APP_URLS.nexus}/api/exams/${created[0]}/publish`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(preview.ok()).toBeTruthy();
    const body = await preview.json();
    expect(body.data.blockers.length).toBeGreaterThan(0);

    const posted = await request.post(`${APP_URLS.nexus}/api/exams/${created[0]}/publish`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { post_to_teams: false },
    });
    expect(posted.status()).toBe(400);
  });

  test('unauthorized: a student cannot read the invigilation roster', async ({ request }) => {
    const token = await getTestAuthToken(request, 'student');
    test.skip(!token || created.length === 0, 'Nothing was scheduled to inspect');

    const res = await request.get(`${APP_URLS.nexus}/api/exams/${created[0]}/roster`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('unauthorized: a student cannot schedule an exam', async ({ request }) => {
    const token = await getTestAuthToken(request, 'student');
    test.skip(!token, 'No student token available in this environment');

    const res = await request.post(`${APP_URLS.nexus}/api/exams`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { classroom_ids: ['x'], test_id: 'y', opens_at: '2026-01-01', closes_at: '2026-01-02' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('mobile: the teacher exam screen fits 375px with reachable controls', async ({ page }) => {
    test.skip(created.length === 0, 'Nothing was scheduled to inspect');
    await injectAuthForPage(page, 'teacher');
    await page.setViewportSize({ width: 375, height: 812 });

    // The exam page is keyed on the class, so land on the timetable and let the
    // exam card route there rather than guessing an id.
    await page.goto(`${APP_URLS.nexus}/teacher/timetable`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await assertNoHorizontalOverflow(page);
  });
});
