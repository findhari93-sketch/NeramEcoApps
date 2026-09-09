import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * Catch-up journey E2E (API level).
 *
 * API level rather than browser level because the Entra tenant now forces MFA
 * and the test accounts cannot complete an interactive sign-in (see the MFA
 * enforcement notes). The contract is what matters here anyway: the rules that
 * must hold even when a client sends whatever it likes.
 *
 * The one thing worth proving above all others: the per-class catch-up route no
 * longer answers a late joiner with "you are not marked absent for this class".
 * That refusal is what made the whole journey unreachable for exactly the
 * student it was built for.
 *
 * Self-skips without the Nexus dev server on :3012 or before the migration.
 */

const NEXUS = APP_URLS.nexus;
const MISSING = '00000000-0000-0000-0000-000000000000';

test.describe('Nexus — Catch-up journey', () => {
  test('per-class catch-up requires auth', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/timetable/${MISSING}/catch-up`);
    expect(res.status()).not.toBe(200);
    expect([400, 401, 403, 500]).toContain(res.status());
  });

  test('an unknown class is refused rather than crashing', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.get(`${NEXUS}/api/timetable/${MISSING}/catch-up`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    expect(res.status()).not.toBe(200);
    expect([403, 404]).toContain(res.status());
  });

  test('a real past class answers with a checklist, never the old absence 404', async ({
    request,
  }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const headers = { Authorization: `Bearer ${auth.testToken}` };

    // Find a class this student can actually see. my-schedule is the one payload
    // that already carries the week's classes for the caller.
    const sched = await request.get(`${NEXUS}/api/timetable/my-schedule`, { headers });
    if (sched.status() !== 200) {
      test.skip(true, 'Timetable unavailable for this account in this environment');
      return;
    }
    const classes = (await sched.json()).classes || [];
    if (classes.length === 0) {
      test.skip(true, 'No classes seeded for this student');
      return;
    }

    const res = await request.get(`${NEXUS}/api/timetable/${classes[0].id}/catch-up`, { headers });
    if (res.status() === 500) {
      test.skip(true, 'Catch-up journey migration not applied in this environment');
      return;
    }

    // 403 means not enrolled in that classroom, which is a legitimate answer.
    // 404 with the old "not marked absent" message is the regression this guards.
    if (res.status() === 404) {
      const body = await res.json();
      expect(String(body.error || '')).not.toContain('not marked absent');
      return;
    }

    expect(res.status()).toBe(200);
    const body = await res.json();
    // The shape both the old absence loop and the new journey rely on.
    expect(body).toHaveProperty('steps');
    expect(body.steps).toHaveProperty('watched');
    expect(body.steps).toHaveProperty('workDone');
    expect(body.steps).toHaveProperty('testPassed');
    expect(body).toHaveProperty('reasonRequired');
    expect(Array.isArray(body.assignments)).toBe(true);
  });

  test('a student cannot declare they watched a class that has a guided recap', async ({
    request,
  }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const headers = {
      Authorization: `Bearer ${auth.testToken}`,
      'Content-Type': 'application/json',
    };

    const sched = await request.get(`${NEXUS}/api/timetable/my-schedule`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    if (sched.status() !== 200) {
      test.skip(true, 'Timetable unavailable for this account in this environment');
      return;
    }
    const classes = (await sched.json()).classes || [];
    if (classes.length === 0) {
      test.skip(true, 'No classes seeded for this student');
      return;
    }

    const detail = await request.get(`${NEXUS}/api/timetable/${classes[0].id}/catch-up`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    if (detail.status() !== 200) {
      test.skip(true, 'No catch-up item for this student and class');
      return;
    }
    const body = await detail.json();
    if (!body.recap) {
      test.skip(true, 'Class has no published recap, so self-declaration is the correct path');
      return;
    }

    const res = await request.post(`${NEXUS}/api/timetable/${classes[0].id}/catch-up`, {
      headers,
      data: { action: 'mark_watched' },
    });
    expect(res.status()).toBe(400);
    expect(String((await res.json()).error)).toContain('guided recap');
  });

  test('the class test refuses to hand out questions while locked', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const headers = { Authorization: `Bearer ${auth.testToken}` };

    const sched = await request.get(`${NEXUS}/api/timetable/my-schedule`, { headers });
    if (sched.status() !== 200) {
      test.skip(true, 'Timetable unavailable for this account in this environment');
      return;
    }
    const classes = (await sched.json()).classes || [];
    if (classes.length === 0) {
      test.skip(true, 'No classes seeded for this student');
      return;
    }

    const res = await request.get(`${NEXUS}/api/student/catchup-journey/${classes[0].id}/test`, { headers });
    // 404 = no backlog item or no test built yet, both legitimate.
    // 403 TEST_LOCKED = the gate doing its job. A 200 without an unlock is the bug.
    expect([403, 404]).toContain(res.status());
    if (res.status() === 403) {
      expect((await res.json()).error).toBe('TEST_LOCKED');
    }
  });

  test('a locked test cannot be submitted even with answers in hand', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const sched = await request.get(`${NEXUS}/api/timetable/my-schedule`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    if (sched.status() !== 200) {
      test.skip(true, 'Timetable unavailable for this account in this environment');
      return;
    }
    const classes = (await sched.json()).classes || [];
    if (classes.length === 0) {
      test.skip(true, 'No classes seeded for this student');
      return;
    }

    // This is the important one. A client that cached the paper from an earlier
    // attempt must still be refused at submit time, not only at fetch time.
    const res = await request.post(`${NEXUS}/api/student/catchup-journey/${classes[0].id}/test`, {
      headers: {
        Authorization: `Bearer ${auth.testToken}`,
        'Content-Type': 'application/json',
      },
      data: { answers: { 'made-up-question-id': 'a' } },
    });
    expect(res.status()).not.toBe(200);
    expect([403, 404]).toContain(res.status());
  });

  /**
   * NXS-0141. A student sat the class test, scored 66.67% against an 85% bar and
   * failed. The fail nulled test_unlocked_at, and a read-time self-heal put it
   * straight back twenty six seconds later, because "checkpoints complete and
   * nothing unlocked or passed" is exactly what a fail leaves behind. He came
   * back to a screen identical to the one before he sat it and reported the
   * class as completed but still showing incomplete.
   *
   * Two contracts came out of that and both are asserted here: the response has
   * to carry what the student actually did, and reading the state must never
   * change it.
   */
  test('the checklist reports the attempts, not just a pass or fail flag', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const headers = { Authorization: `Bearer ${auth.testToken}` };

    const sched = await request.get(`${NEXUS}/api/timetable/my-schedule`, { headers });
    if (sched.status() !== 200) {
      test.skip(true, 'Timetable unavailable for this account in this environment');
      return;
    }
    const classes = (await sched.json()).classes || [];
    if (classes.length === 0) {
      test.skip(true, 'No classes seeded for this student');
      return;
    }

    const res = await request.get(`${NEXUS}/api/timetable/${classes[0].id}/catch-up`, { headers });
    if (res.status() !== 200) {
      test.skip(true, 'No catch-up item for this class');
      return;
    }
    const body = await res.json();
    if (!body.test) {
      test.skip(true, 'No class test built for this class');
      return;
    }

    // The fields that let the screen say "you scored 67% on 23 Aug" instead of
    // rendering the same untouched button it showed before the attempt.
    expect(body.test).toHaveProperty('attempts');
    expect(body.test).toHaveProperty('last_score_pct');
    expect(body.test).toHaveProperty('last_attempt_at');
    expect(typeof body.test.attempts).toBe('number');

    // An unsat paper reports zero rather than null, so the screen never has to
    // guess whether "no score" means "never tried" or "we lost it".
    if (!body.test.passed && body.test.attempts === 0) {
      expect(body.test.last_score_pct).toBeNull();
    }
  });

  test('reading the catch-up state twice does not change it', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const headers = { Authorization: `Bearer ${auth.testToken}` };

    const sched = await request.get(`${NEXUS}/api/timetable/my-schedule`, { headers });
    if (sched.status() !== 200) {
      test.skip(true, 'Timetable unavailable for this account in this environment');
      return;
    }
    const classes = (await sched.json()).classes || [];
    if (classes.length === 0) {
      test.skip(true, 'No classes seeded for this student');
      return;
    }

    const url = `${NEXUS}/api/timetable/${classes[0].id}/catch-up`;
    const first = await request.get(url, { headers });
    if (first.status() !== 200) {
      test.skip(true, 'No catch-up item for this class');
      return;
    }
    const second = await request.get(url, { headers });
    expect(second.status()).toBe(200);

    const a = await first.json();
    const b = await second.json();

    // The whole bug was a GET with a side effect. These four are what the
    // self-heal used to move between one read and the next.
    expect(b.test?.unlocked ?? null).toEqual(a.test?.unlocked ?? null);
    expect(b.test?.passed ?? null).toEqual(a.test?.passed ?? null);
    expect(b.canComplete).toBe(a.canComplete);
    expect(b.blockedReason).toBe(a.blockedReason);
  });

  test('the final check is a short paper, and says so before it is opened', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const headers = { Authorization: `Bearer ${auth.testToken}` };

    const sched = await request.get(`${NEXUS}/api/timetable/my-schedule`, { headers });
    if (sched.status() !== 200) {
      test.skip(true, 'Timetable unavailable for this account in this environment');
      return;
    }
    const classes = (await sched.json()).classes || [];
    if (classes.length === 0) {
      test.skip(true, 'No classes seeded for this student');
      return;
    }

    const res = await request.get(`${NEXUS}/api/timetable/${classes[0].id}/catch-up`, { headers });
    if (res.status() !== 200) {
      test.skip(true, 'No catch-up item for this class');
      return;
    }
    const body = await res.json();
    if (!body.test || body.test.source === 'class_test' || body.test.question_count == null) {
      test.skip(true, 'No auto-generated final check on this class');
      return;
    }

    // 15 is FINAL_CHECK_QUESTIONS. Production shipped papers of 105 questions
    // needing 90 right, built by taking the union of every checkpoint's bank
    // with no ceiling anywhere.
    expect(body.test.question_count).toBeGreaterThan(0);
    expect(body.test.question_count).toBeLessThanOrEqual(15);
    expect(body.test.must_get_right).toBe(
      Math.ceil((body.test.passing_pct / 100) * body.test.question_count),
    );
  });

  test('GET and POST agree about whether the paper is open', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const headers = { Authorization: `Bearer ${auth.testToken}` };

    const sched = await request.get(`${NEXUS}/api/timetable/my-schedule`, { headers });
    if (sched.status() !== 200) {
      test.skip(true, 'Timetable unavailable for this account in this environment');
      return;
    }
    const classes = (await sched.json()).classes || [];
    if (classes.length === 0) {
      test.skip(true, 'No classes seeded for this student');
      return;
    }

    const url = `${NEXUS}/api/student/catchup-journey/${classes[0].id}/test`;
    const get = await request.get(url, { headers });
    const post = await request.post(url, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { answers: {} },
    });

    // These used to disagree: GET handed a passed student the paper and POST
    // then refused to grade it, so the only way to discover that was to answer
    // everything first. Both verbs now ask the same question of the same data.
    const getLocked = get.status() === 403;
    const postLocked = post.status() === 403;
    if (get.status() === 404 || post.status() === 404) {
      test.skip(true, 'No backlog item or no test built for this class');
      return;
    }
    expect(postLocked).toBe(getLocked);
  });

  test('the student backlog endpoint is auth-gated and never 500s when empty', async ({
    request,
  }) => {
    const anon = await request.get(`${NEXUS}/api/student/catchup-journey`);
    expect(anon.status()).not.toBe(200);

    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.get(`${NEXUS}/api/student/catchup-journey`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    if (res.status() === 500) {
      test.skip(true, 'Catch-up journey migration not applied in this environment');
      return;
    }
    expect(res.status()).toBe(200);
    const body = await res.json();
    // A student with no backlog gets an empty list, never an error.
    expect(Array.isArray(body.items)).toBe(true);
    expect(Array.isArray(body.excluded)).toBe(true);
  });

  test('the staff overview and item actions are closed to students', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const headers = {
      Authorization: `Bearer ${auth.testToken}`,
      'Content-Type': 'application/json',
    };

    const overview = await request.get(`${NEXUS}/api/catchup/overview`, { headers });
    expect(overview.status()).toBe(403);

    const excuse = await request.post(`${NEXUS}/api/catchup/items/${MISSING}`, {
      headers,
      data: { action: 'excuse' },
    });
    expect(excuse.status()).toBe(403);

    const nudge = await request.post(`${NEXUS}/api/catchup/nudge`, {
      headers,
      data: { studentIds: [MISSING] },
    });
    expect(nudge.status()).toBe(403);
  });

  test('a teacher can read the overview', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / teacher test-login unavailable');
      return;
    }
    const res = await request.get(`${NEXUS}/api/catchup/overview`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    if (res.status() === 500) {
      test.skip(true, 'Catch-up journey migration not applied in this environment');
      return;
    }
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.students)).toBe(true);
    expect(Array.isArray(body.classes)).toBe(true);
    expect(Array.isArray(body.noRecording)).toBe(true);
  });

  test('the pacing cron refuses an unauthenticated call', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/cron/catchup-pace`, {
      headers: { Authorization: 'Bearer definitely-not-the-cron-secret' },
    });
    // 401 when CRON_SECRET is configured. Where it is not, assertCronRequest is
    // a deliberate no-op, so a 200 is the documented behaviour rather than a hole.
    expect([200, 401]).toContain(res.status());
  });

  test('the class-test builder is staff only', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.post(`${NEXUS}/api/class-recaps/${MISSING}/class-test`, {
      headers: {
        Authorization: `Bearer ${auth.testToken}`,
        'Content-Type': 'application/json',
      },
      data: {},
    });
    expect(res.status()).not.toBe(200);
    expect([401, 403]).toContain(res.status());
  });

  test('rearm refuses a class the student has not rewatched', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.post(`${NEXUS}/api/student/catchup-journey/${MISSING}/rearm`, {
      headers: {
        Authorization: `Bearer ${auth.testToken}`,
        'Content-Type': 'application/json',
      },
      data: {},
    });
    expect(res.status()).not.toBe(200);
    expect([400, 404]).toContain(res.status());
  });

  test('mark_caught_up is refused while anything is outstanding', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const headers = {
      Authorization: `Bearer ${auth.testToken}`,
      'Content-Type': 'application/json',
    };

    const sched = await request.get(`${NEXUS}/api/timetable/my-schedule`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    if (sched.status() !== 200) {
      test.skip(true, 'Timetable unavailable for this account in this environment');
      return;
    }
    const classes = (await sched.json()).classes || [];
    if (classes.length === 0) {
      test.skip(true, 'No classes seeded for this student');
      return;
    }

    const detail = await request.get(`${NEXUS}/api/timetable/${classes[0].id}/catch-up`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    if (detail.status() !== 200) {
      test.skip(true, 'No catch-up item for this student and class');
      return;
    }
    const { steps } = await detail.json();
    if (steps.watched && steps.workDone && steps.testPassed) {
      test.skip(true, 'Already fully caught up, nothing to refuse');
      return;
    }

    const res = await request.post(`${NEXUS}/api/timetable/${classes[0].id}/catch-up`, {
      headers,
      data: { action: 'mark_caught_up' },
    });
    // The server, not a disabled button, is what enforces this.
    expect(res.status()).toBe(400);
  });
});
