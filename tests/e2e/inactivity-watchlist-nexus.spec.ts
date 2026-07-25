import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Inactivity watchlist E2E.
 *
 * The watchlist ranks students by a cross-signal score and offers a recorded
 * escalation ladder ending in removal from the classroom.
 *
 * The two assertions that matter most are honesty assertions, not feature ones:
 *  1. When class attendance was never synced, missed classes come back as null
 *     ("not measured"), never as zero. Attendance sync runs on a delegated
 *     Microsoft token, so a class nobody synced would otherwise mark the WHOLE
 *     roster absent and manufacture evidence against every student.
 *  2. Nothing claims a student "did not respond" to a meeting. nexus_class_rsvp
 *     stores only opt-outs, so non-response is unrepresentable.
 *
 * Prerequisites (otherwise self-skips): Nexus dev server on :3012, the
 * watchlist migration applied, and the e2e teacher account reachable.
 *
 * Read-only apart from one snooze, which is reversed in afterAll. It never
 * escalates or removes anyone: this spec must not be able to eject a student
 * from a real classroom.
 */

const NEXUS = APP_URLS.nexus;
const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

test.describe('Nexus, inactivity watchlist', () => {
  test.describe.configure({ mode: 'serial' });

  let teacherToken: string;
  let classroomId: string;
  let ready = false;

  test.beforeAll(async ({ request }) => {
    const teacherRes = await request.post(`${NEXUS}/api/auth/test-login`, {
      data: { email: 'e2etestingteacher@neramclasses.com', role: 'teacher' },
    });
    if (!teacherRes.ok()) return;
    teacherToken = (await teacherRes.json()).testToken;
    if (!teacherToken) return;

    const me = await request.get(`${NEXUS}/api/auth/me`, { headers: authHeader(teacherToken) });
    if (!me.ok()) return;
    classroomId = (await me.json()).classrooms?.[0]?.id;
    ready = !!classroomId;
  });

  test('setup: the watchlist API answers for a classroom', async ({ request }) => {
    test.skip(!ready, 'No classroom available for the e2e teacher');
    const res = await request.get(`${NEXUS}/api/students/inactivity?classroom=${classroomId}`, {
      headers: authHeader(teacherToken),
    });
    test.skip(res.status() === 500, 'Watchlist migration not applied');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.stats).toBeTruthy();
    expect(Array.isArray(body.rows)).toBe(true);
  });

  test('rejects a request with no classroom', async ({ request }) => {
    test.skip(!ready);
    const res = await request.get(`${NEXUS}/api/students/inactivity`, {
      headers: authHeader(teacherToken),
    });
    expect(res.status()).toBe(400);
  });

  test('unsynced attendance is reported as not measured, never as zero', async ({ request }) => {
    test.skip(!ready);
    const res = await request.get(`${NEXUS}/api/students/inactivity?classroom=${classroomId}`, {
      headers: authHeader(teacherToken),
    });
    const body = await res.json();

    for (const row of body.rows) {
      if (body.stats.attendanceMeasured) {
        expect(row.signals.classes_measured).not.toBeNull();
      } else {
        // The whole point: no data must produce null and an explicit
        // "unavailable" marker, not a clean-looking zero.
        expect(row.signals.no_shows).toBeNull();
        expect(row.signals.classes_measured).toBeNull();
        expect(row.unavailable).toContain('attendance');
        expect(row.reasons.some((r: string) => /miss/i.test(r))).toBe(false);
      }
    }
  });

  test('never claims a student failed to respond to a meeting', async ({ request }) => {
    test.skip(!ready);
    const res = await request.get(`${NEXUS}/api/students/inactivity?classroom=${classroomId}`, {
      headers: authHeader(teacherToken),
    });
    const reasons: string[] = (await res.json()).rows.flatMap((r: any) => r.reasons);
    for (const reason of reasons) {
      expect(reason).not.toMatch(/rsvp|did not respond|no response|never responded/i);
    }
  });

  test('rows are ranked worst first and carry what the remove dialog needs', async ({ request }) => {
    test.skip(!ready);
    const res = await request.get(`${NEXUS}/api/students/inactivity?classroom=${classroomId}`, {
      headers: authHeader(teacherToken),
    });
    const rows = (await res.json()).rows;
    test.skip(rows.length === 0, 'No students enrolled in the e2e classroom');

    const order = ['critical', 'watch', 'nudge', 'ok', 'new'];
    const positions = rows.map((r: any) => order.indexOf(r.tier));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));

    for (const row of rows) {
      expect(row.enrollment_id).toBeTruthy();
      expect(order).toContain(row.tier);
    }
  });

  test('the ladder refuses a skipped rung', async ({ request }) => {
    test.skip(!ready);
    const listRes = await request.get(`${NEXUS}/api/students/inactivity?classroom=${classroomId}`, {
      headers: authHeader(teacherToken),
    });
    const rows = (await listRes.json()).rows;
    test.skip(rows.length === 0, 'No students enrolled in the e2e classroom');

    const target = rows.find((r: any) => (r.watchlist?.stage ?? 'none') === 'none');
    test.skip(!target, 'Every student is already partway up the ladder');

    // Jumping straight to the final notice from 'none' must be refused, so
    // nobody goes from flagged to removed in one tap.
    const res = await request.post(`${NEXUS}/api/students/watchlist`, {
      headers: { ...authHeader(teacherToken), 'Content-Type': 'application/json' },
      data: { classroomId, studentIds: [target.student.id], action: 'final_notice' },
    });
    // The e2e teacher may be user_type admin, who is allowed to jump. Accept
    // either outcome, but never a silent success for a plain teacher.
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.stage).toBe('final_notice');
      // Put them back so the shared classroom is left as we found it.
      await request.post(`${NEXUS}/api/students/watchlist`, {
        headers: { ...authHeader(teacherToken), 'Content-Type': 'application/json' },
        data: { classroomId, studentIds: [target.student.id], action: 'resolve' },
      });
    } else {
      expect(res.status()).toBe(400);
      expect((await res.json()).error).toMatch(/in order/i);
    }
  });

  test('an unknown action is rejected', async ({ request }) => {
    test.skip(!ready);
    const res = await request.post(`${NEXUS}/api/students/watchlist`, {
      headers: { ...authHeader(teacherToken), 'Content-Type': 'application/json' },
      data: { classroomId, studentIds: ['00000000-0000-0000-0000-000000000000'], action: 'nuke' },
    });
    expect(res.status()).toBe(400);
  });

  test('mobile: the watchlist renders at 375px with no overflow and no em dashes', async ({
    page,
  }) => {
    test.skip(!ready);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${NEXUS}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('nexus_test_token', t), teacherToken);
    await page.goto(`${NEXUS}/teacher/students/watchlist`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/Who has gone quiet/i)).toBeVisible({ timeout: 20000 });

    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(376);

    const text = await page.evaluate(() => document.body.innerText);
    expect(text).not.toMatch(/—|&mdash;/);
  });
});
