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

/** The diagnosis states, in the order the overview sorts and the tiles read. */
const DIAGNOSES = [
  'stuck',
  'stopped',
  'not_started',
  'over_time',
  'work_left',
  'on_track',
  'waiting_on_us',
  'all_clear',
];

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

/**
 * A month on the teacher's calendar that has taught classes, walking back from
 * this month. The E2E classroom on staging has a handful, months apart, so a
 * single "this month" read would skip for no reason.
 */
async function findPastClasses(request: any, auth: { testToken: string; classrooms: any[] }) {
  const classroomId = auth.classrooms?.[0]?.id;
  if (!classroomId) return null;
  const headers = { Authorization: `Bearer ${auth.testToken}` };
  const now = new Date();
  for (let back = 0; back < 6; back++) {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
    const ymd = (d: Date) => d.toISOString().slice(0, 10);
    const res = await getWarm(
      request,
      `${NEXUS}/api/catchup/calendar?classroomId=${classroomId}&from=${ymd(first)}&to=${ymd(last)}`,
      headers,
    );
    expect(res.status(), 'calendar read').toBe(200);
    const body = await res.json();
    const past = (body.classes || []).filter((c: any) => c.health !== 'upcoming');
    if (past.length > 0) return { classroomId, body: { ...body, classes: past } };
  }
  return null;
}

test.describe('Nexus: catching up on a missed class', () => {
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

    for (const key of ['classroomId', 'students', 'classes', 'reasonTally', 'noRecording', 'pendingRecap', 'totals']) {
      expect(body).toHaveProperty(key);
    }
    // Retired with the four-tab page (2026-10): the Classes list moved to
    // /api/catchup/calendar, the Reasons and Recently finished feeds into the
    // student sheet. Shipping them again would pay for work nothing reads.
    for (const gone of ['classStats', 'reasons', 'completed']) {
      expect(body, `${gone} should have left the overview`).not.toHaveProperty(gone);
    }
    expect(body.totals).toMatchObject({
      studentsBehind: expect.any(Number),
      studentsCatchingUp: expect.any(Number),
      outstanding: expect.any(Number),
      clearedThisMonth: expect.any(Number),
      explained: expect.any(Number),
      unexplained: expect.any(Number),
    });
    expect(Object.keys(body.totals.byDiagnosis).sort()).toEqual([...DIAGNOSES].sort());

    // The list is a work queue ordered by diagnosis: whoever most needs a
    // person (Stuck) first, all clear last.
    const ranks = (body.students || []).map((s: any) => DIAGNOSES.indexOf(s.diagnosis?.state));
    expect(ranks.every((r: number) => r >= 0), 'every student carries a known diagnosis').toBe(true);
    expect(ranks).toEqual([...ranks].sort((x: number, y: number) => x - y));
  });

  test('totals.byDiagnosis is a tally of the rows, so a card and its list agree', async ({ request }) => {
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
    for (const d of DIAGNOSES) {
      const rows = body.students.filter((s: any) => s.diagnosis.state === d).length;
      expect(body.totals.byDiagnosis[d], `the ${d} card`).toBe(rows);
    }
    for (const s of body.students) {
      expect(typeof s.diagnosis.sentence).toBe('string');
      expect(s.diagnosis.sentence.length).toBeGreaterThan(0);
    }
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
    test.skip(items.length === 0, 'No catch-up items in this environment (the E2E classroom has no absences)');
    for (const item of items) {
      expect(item).toHaveProperty('reason_note');
      expect(item).toHaveProperty('reason_submitted_at');
      expect(item).toHaveProperty('reason_source');
      expect(item).toHaveProperty('caught_up_at');
      // The resolved reason (RSVP, away window or afterwards) and the progress
      // line are what the student sheet reads.
      expect(item).toHaveProperty('reason');
      expect(typeof item.progress).toBe('string');
    }
  });

  test('a resolved reason says what, and where the student said it', async ({ request }) => {
    // Replaces the Reasons feed. The sheet shows "Unwell · Told us before class";
    // both halves come from here, so both must be present on every reason.
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
    const reasons = (body.students || [])
      .flatMap((s: any) => s.items || [])
      .map((i: any) => i.reason)
      .filter(Boolean);
    test.skip(reasons.length === 0, 'Nobody has explained a missed class in this environment');
    for (const r of reasons) {
      expect(['unwell', 'family', 'clash', 'other']).toContain(r.code);
      expect(['before_class', 'away', 'after_class', 'parent', 'teacher']).toContain(r.source);
      expect(r.said).toMatch(/^(Told us before class|Told us afterwards|Away|Parent told us|Noted by a teacher)/);
    }
  });

  // ── The calendar (replaces the Classes and recaps list) ──────────────────

  test('the calendar is refused without auth', async ({ request }) => {
    const res = await request.get(
      `${NEXUS}/api/catchup/calendar?classroomId=${MISSING}&from=2026-09-01&to=2026-09-30`,
    );
    expect(res.status()).not.toBe(200);
    expect([400, 401, 403, 500]).toContain(res.status());
  });

  test('a student cannot read the calendar', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await getWarm(
      request,
      `${NEXUS}/api/catchup/calendar?classroomId=${MISSING}&from=2026-09-01&to=2026-09-30`,
      { Authorization: `Bearer ${auth.testToken}` },
    );
    expect(res.status()).toBe(403);
  });

  test('the calendar refuses a missing range, a backwards one and one over 45 days', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const headers = { Authorization: `Bearer ${auth.testToken}` };
    const missing = await getWarm(request, `${NEXUS}/api/catchup/calendar?classroomId=${MISSING}`, headers);
    expect(missing.status()).toBe(400);
    const backwards = await request.get(
      `${NEXUS}/api/catchup/calendar?classroomId=${MISSING}&from=2026-09-30&to=2026-09-01`,
      { headers },
    );
    expect(backwards.status()).toBe(400);
    const tooLong = await request.get(
      `${NEXUS}/api/catchup/calendar?classroomId=${MISSING}&from=2026-07-01&to=2026-09-30`,
      { headers },
    );
    expect(tooLong.status()).toBe(400);
    // A month grid (up to 42 days) is within the cap.
    const grid = await request.get(
      `${NEXUS}/api/catchup/calendar?classroomId=${MISSING}&from=2026-08-31&to=2026-10-11`,
      { headers },
    );
    expect(grid.status()).toBe(200);
    expect((await grid.json()).classes).toEqual([]);
  });

  test('each class on the calendar reports its recap state and health', async ({ request }) => {
    // This is what absorbed /teacher/class-recaps: without recap_state the
    // calendar would have to fetch the old candidates endpoint as well.
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const found = await findPastClasses(request, auth);
    test.skip(!found, 'No taught classes in the last six months in this environment');
    const { body } = found!;
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const c of body.classes) {
      expect(['no_recording', 'recording_ready', 'draft', 'published']).toContain(c.recap_state);
      expect(['upcoming', 'not_taught', 'recap_missing', 'catching_up', 'all_caught_up']).toContain(c.health);
      for (const k of ['present', 'missed', 'late_joiners', 'caughtUp', 'outstanding', 'blocked']) {
        expect(typeof c[k], k).toBe('number');
      }
      expect(c).toHaveProperty('recap_id');
      // Nobody is blocked on a recap that is already published.
      if (c.recap_state === 'published') expect(c.blocked).toBe(0);
      expect(c.blocked).toBeLessThanOrEqual(c.outstanding);
    }
  });

  test('the per-class register carries why each absent student was away', async ({ request }) => {
    // Feeds the attendance drawer the calendar opens, which used to show a
    // toggle and a join time and nothing about the follow-up.
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const found = await findPastClasses(request, auth);
    test.skip(!found, 'No taught classes in the last six months in this environment');
    const { classroomId, body } = found!;
    const cls = body.classes[0];

    const res = await getWarm(
      request,
      `${NEXUS}/api/timetable/attendance-report?class_id=${cls.id}&classroom_id=${classroomId}`,
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
