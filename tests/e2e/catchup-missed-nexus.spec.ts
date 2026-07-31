import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * Catching up on a class you MISSED (as opposed to one taught before you joined).
 *
 * API level rather than browser level, for the same reason as
 * catchup-journey-nexus.spec.ts: the Entra tenant forces MFA and the test
 * accounts cannot complete an interactive sign-in. The contract is what matters
 * here anyway, and it is the contract that was broken.
 *
 * The thing worth proving above all others: a student's own absence row is now
 * visible to the catch-up surfaces. It always existed in nexus_class_absences,
 * but every read keyed on journey_id, which only a late joiner ever has, so
 * seventy-seven recorded absences sat invisible to the exact screens built to
 * clear them.
 *
 * Self-skips without the Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;
const MISSING = '00000000-0000-0000-0000-000000000000';

/**
 * GET a route that may still be compiling.
 *
 * A Next dev server answers /_not-found (404) for anything that arrives while it
 * is building the route, so the FIRST request to a given endpoint in a cold run
 * can 404 for reasons that have nothing to do with the code. getTestAuthToken
 * retries its own login for exactly this reason; anything that asserts a 200 on
 * first contact needs the same treatment or it fails once per cold machine.
 *
 * A route that is genuinely missing 404s on every attempt, so this hides nothing.
 */
async function getWarm(request: any, url: string, headers: Record<string, string>) {
  let res = await request.get(url, { headers });
  for (let i = 0; i < 3 && res.status() === 404; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    res = await request.get(url, { headers });
  }
  return res;
}

test.describe('Nexus — catching up on a missed class', () => {
  test('the student catch-up payload is refused without auth', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/student/catchup-journey`);
    expect(res.status()).not.toBe(200);
    expect([400, 401, 403, 500]).toContain(res.status());
  });

  test('the payload carries a missed list and a backlog as separate things', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    const res = await getWarm(request, `${NEXUS}/api/student/catchup-journey`, {
      Authorization: `Bearer ${auth.testToken}`,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    // Both keys must exist even when empty. A screen that reads `missed` off a
    // payload that only sometimes has it is a screen that silently shows nothing.
    expect(body).toHaveProperty('missed');
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('missedTotals');
    expect(Array.isArray(body.missed)).toBe(true);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.missedTotals).toMatchObject({
      total: expect.any(Number),
      completed: expect.any(Number),
      open: expect.any(Number),
      overdue: expect.any(Number),
    });
  });

  test('a missed class is never chained, and carries a deadline', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    const res = await request.get(`${NEXUS}/api/student/catchup-journey`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    const body = await res.json();
    const missed = body.missed || [];
    if (missed.length === 0) {
      test.skip(true, 'This account has not missed a class in this environment');
      return;
    }

    for (const item of missed) {
      // Never locked behind another class. This is the whole point of the
      // unchained rule: two scattered absences have no teaching order.
      expect(item.chained).toBe(false);
      expect(item.status).not.toBe('locked');

      // Anything still owed has a real deadline drawn from the timetable.
      if (item.status !== 'done' && item.status !== 'excused' && item.status !== 'blocked') {
        expect(item.due_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(typeof item.overdue).toBe('boolean');
      }
    }
  });

  test('the pace quota counts the backlog only, never a missed class', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    const res = await request.get(`${NEXUS}/api/student/catchup-journey`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    const body = await res.json();
    if (!body.totals) {
      test.skip(true, 'No catch-up state for this account in this environment');
      return;
    }

    // A missed class arriving must never move the target a late joiner is
    // measured against. totals covers `items` and nothing else.
    expect(body.totals.total).toBeLessThanOrEqual((body.items || []).length);
  });

  test('the per-class route reports the deadline for a class you missed', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const headers = { Authorization: `Bearer ${auth.testToken}` };

    const list = await request.get(`${NEXUS}/api/student/catchup-journey`, { headers });
    const missed = (await list.json()).missed || [];
    if (missed.length === 0) {
      test.skip(true, 'This account has not missed a class in this environment');
      return;
    }

    const res = await getWarm(
      request,
      `${NEXUS}/api/timetable/${missed[0].scheduled_class_id}/catch-up`,
      headers,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body).toHaveProperty('due_on');
    expect(body).toHaveProperty('overdue');
    // A missed class always has a why to give; a late joiner never does.
    expect(body.reasonRequired).toBe(true);
  });

  test('a student cannot read the teacher overview', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.get(`${NEXUS}/api/catchup/overview`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('the teacher overview is refused without auth', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/catchup/overview`);
    expect(res.status()).not.toBe(200);
    expect([400, 401, 403, 500]).toContain(res.status());
  });

  test('the teacher overview answers with every section the screen needs', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    const res = await getWarm(request, `${NEXUS}/api/catchup/overview`, {
      Authorization: `Bearer ${auth.testToken}`,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    for (const key of [
      'students',
      'classes',
      'classStats',
      'reasons',
      'reasonTally',
      'completed',
      'noRecording',
      'pendingRecap',
      'totals',
    ]) {
      expect(body).toHaveProperty(key);
    }
    expect(body.totals).toMatchObject({
      studentsBehind: expect.any(Number),
      studentsCatchingUp: expect.any(Number),
      outstanding: expect.any(Number),
      clearedThisMonth: expect.any(Number),
      explained: expect.any(Number),
      unexplained: expect.any(Number),
    });

    // The chase list is a work queue, so the most overdue name is first.
    const overdueCounts = (body.students || []).map((s: any) => s.missedTotals.overdue);
    const sorted = [...overdueCounts].sort((a: number, b: number) => b - a);
    expect(overdueCounts).toEqual(sorted);
  });

  test('every item carries the words the student typed, not just the category', async ({
    request,
  }) => {
    // The regression this feature exists to prevent. reason_note was selected by
    // nothing, so a teacher could see that someone had "answered" and never what
    // they said. The key must be present on every item even when it is null,
    // because a screen reading an optional key shows nothing and looks fine.
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    const res = await getWarm(request, `${NEXUS}/api/catchup/overview`, {
      Authorization: `Bearer ${auth.testToken}`,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    const items = (body.students || []).flatMap((s: any) => s.items || []);
    if (items.length === 0) {
      test.skip(true, 'No outstanding catch-up items in this environment');
      return;
    }
    for (const item of items) {
      expect(item).toHaveProperty('reason_note');
      expect(item).toHaveProperty('reason_submitted_at');
      expect(item).toHaveProperty('reason_source');
      expect(item).toHaveProperty('caught_up_at');
    }
  });

  test('the reasons feed is newest first and every row has a student on it', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    const res = await getWarm(request, `${NEXUS}/api/catchup/overview`, {
      Authorization: `Bearer ${auth.testToken}`,
    });
    const body = await res.json();
    const reasons = body.reasons || [];
    if (reasons.length === 0) {
      test.skip(true, 'Nobody has explained a missed class in this environment');
      return;
    }

    for (const row of reasons) {
      expect(row.student).toBeTruthy();
      expect(row.reason_submitted_at).toBeTruthy();
    }
    const stamps = reasons.map((r: any) => r.reason_submitted_at);
    expect(stamps).toEqual([...stamps].sort().reverse());
  });

  test('finishing a catch-up no longer erases the student from the payload', async ({ request }) => {
    // The overview used to `continue` past anyone with nothing outstanding, so
    // "did they actually do it" had no answer anywhere. Completed items now
    // travel in their own list.
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    const res = await getWarm(request, `${NEXUS}/api/catchup/overview`, {
      Authorization: `Bearer ${auth.testToken}`,
    });
    const body = await res.json();
    expect(Array.isArray(body.completed)).toBe(true);
    for (const row of body.completed || []) {
      expect(row.caught_up_at).toBeTruthy();
      expect(row.student).toBeTruthy();
    }
  });

  test('each recent class reports its recap state, so one screen can act on it', async ({
    request,
  }) => {
    // This is what absorbed /teacher/class-recaps. Without recap_state the merged
    // tab would have to fetch the old candidates endpoint as well.
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    const res = await getWarm(request, `${NEXUS}/api/catchup/overview`, {
      Authorization: `Bearer ${auth.testToken}`,
    });
    const body = await res.json();
    const stats = body.classStats || [];
    if (stats.length === 0) {
      test.skip(true, 'No past classes in this environment');
      return;
    }
    for (const c of stats) {
      expect(['no_recording', 'recording_ready', 'draft', 'published']).toContain(c.recap_state);
      expect(typeof c.blocked).toBe('number');
      expect(c).toHaveProperty('recap_id');
    }
  });

  test('the per-class register carries why each absent student was away', async ({ request }) => {
    // Feeds the Attendance dialog on the timetable, which used to show a toggle
    // and a join time and nothing about the follow-up.
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    const overview = await getWarm(request, `${NEXUS}/api/catchup/overview`, {
      Authorization: `Bearer ${auth.testToken}`,
    });
    const body = await overview.json();
    const cls = (body.classStats || [])[0];
    if (!cls || !body.classroomId) {
      test.skip(true, 'No past classes in this environment');
      return;
    }

    const res = await getWarm(
      request,
      `${NEXUS}/api/timetable/attendance-report?class_id=${cls.id}&classroom_id=${body.classroomId}`,
      { Authorization: `Bearer ${auth.testToken}` },
    );
    expect(res.status()).toBe(200);
    const report = await res.json();

    expect(report.summary).toMatchObject({
      present: expect.any(Number),
      total: expect.any(Number),
      missed: expect.any(Number),
      explained: expect.any(Number),
      caughtUp: expect.any(Number),
    });
    for (const row of report.attendance || []) {
      expect(row).toHaveProperty('absence');
    }
  });

  test('a student cannot excuse their own missed class', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.post(`${NEXUS}/api/catchup/items/${MISSING}`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
      data: { action: 'excuse' },
    });
    expect(res.status()).toBe(403);
  });

  test('the overdue cron is not open to an unauthenticated caller once secured', async ({
    request,
  }) => {
    // assertCronRequest is a no-op until CRON_SECRET is set, so in a local dev
    // environment this legitimately answers 200. What must never happen is a 500.
    const res = await request.get(`${NEXUS}/api/cron/catchup-overdue`);
    expect([200, 401, 503]).toContain(res.status());
  });

  test('the recap auto-draft cron refuses to run without its secret', async ({ request }) => {
    // This one spends Gemini quota, so it is guarded with `required: true` and
    // must refuse rather than wave an unauthenticated caller through.
    const res = await request.get(`${NEXUS}/api/cron/recap-autodraft`);
    expect([401, 503]).toContain(res.status());
  });

  test('the digest cron refuses to run without its secret', async ({ request }) => {
    // It sends email to parents. An unauthenticated caller must never be able to
    // use it as a mailing gun, so unlike most nexus crons it is required: true
    // and answers 503 until CRON_SECRET is set.
    const res = await request.get(`${NEXUS}/api/cron/catchup-digest`);
    expect([401, 503]).toContain(res.status());
  });

  test('the old Class Recaps list redirects into the workspace', async ({ request }) => {
    // The URL is bookmarked and linked from older notifications, so it must move
    // rather than 404.
    const res = await request.get(`${NEXUS}/teacher/class-recaps`, { maxRedirects: 0 });
    expect([307, 308, 302]).toContain(res.status());
    expect(res.headers()['location']).toContain('/teacher/catch-up');
  });

  test('the recap editor is NOT caught by that redirect', async ({ request }) => {
    // The directory still exists for the editor, and another session is working
    // inside it. A redirect that swallowed /teacher/class-recaps/[id] would take
    // recap authoring offline.
    const res = await request.get(`${NEXUS}/teacher/class-recaps/${MISSING}`, {
      maxRedirects: 0,
    });
    expect([307, 308, 302]).not.toContain(res.status());
  });
});
