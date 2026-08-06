import { test, expect, type APIRequestContext } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * The test a class sets for afterwards.
 *
 * API level, matching the other nexus specs: the tenant enforces MFA, so
 * Playwright cannot complete a real Microsoft sign-in, and the contract is what
 * this feature actually is. Auth goes through the non-production `test_` token
 * bypass in lib/ms-verify.ts.
 *
 * READ ONLY, deliberately. The nexus dev server points at STAGING (see
 * reference_env_and_credentials), so composing a paper and placing it on a real
 * class here would leave a test's worth of rows on a shared environment and hand
 * real students an assignment nobody set. Everything below either reads, or
 * exercises a refusal that returns before any write:
 *
 *   - who may reach the route at all
 *   - the shape a teacher's editor renders from
 *   - the validation that runs BEFORE the placement is touched
 *   - the two rules a student would notice if they broke: no deadline is written
 *     into available_until, and an optional paper is not chased
 *
 * Self-skips without the Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;

/**
 * Well above Playwright's 30 second default, and not optional.
 *
 * A dev server compiles each route the first time it is asked for, and this spec
 * touches five it has never seen. The first test in the file was reliably eaten
 * by that, which reads as "the feature is broken" rather than "the bundler is
 * still working". The same trap is documented for the nexus-mobile project.
 */
test.describe.configure({ timeout: 180_000 });

interface Ctx {
  token: string;
  classId: string;
  classroomId: string;
}

/**
 * Resolved once for the whole file.
 *
 * Finding a class costs a classrooms read plus a timetable read per classroom,
 * and doing that inside all nine tests was most of the wall clock.
 */
let ctxPromise: Promise<Ctx | null> | null = null;

/**
 * Any class, in any classroom.
 *
 * Two routes to one, for the same reason attendance-teams-nexus needs two: the
 * timetable route requires an active enrolment even from staff, and the E2E
 * teacher is deliberately enrolled nowhere, so the diagnostics fallback is what
 * usually finds one. A spec that silently skipped instead would be a spec that
 * can never fail.
 */
async function findAnyClass(request: APIRequestContext, token: string): Promise<Ctx | null> {
  const headers = { Authorization: `Bearer ${token}` };

  // An explicit escape hatch, because both discovery routes below can be out of
  // action for reasons that have nothing to do with this feature. On staging
  // today /api/timetable 500s: it selects an embed on nexus_class_resources, and
  // that table was never created there, so every class lookup through it fails.
  //
  //   E2E_NEXUS_CLASS_ID=<uuid> npx playwright test tests/e2e/nexus-class-test.spec.ts
  const pinned = process.env.E2E_NEXUS_CLASS_ID;
  if (pinned) {
    return { token, classId: pinned, classroomId: process.env.E2E_NEXUS_CLASSROOM_ID || '' };
  }

  const classroomsRes = await request.get(`${NEXUS}/api/classrooms`, { headers });
  if (classroomsRes.ok()) {
    const classrooms = (await classroomsRes.json())?.classrooms ?? [];
    for (const classroom of classrooms) {
      const res = await request.get(
        `${NEXUS}/api/timetable?classroom=${classroom.id}&start=2020-01-01&end=2099-12-31`,
        { headers },
      );
      if (!res.ok()) continue;
      const body = await res.json();
      const classes = body?.classes ?? body?.scheduled_classes ?? [];
      if (Array.isArray(classes) && classes.length > 0) {
        return { token, classId: classes[0].id, classroomId: classroom.id };
      }
    }
  }

  const diag = await request.get(`${NEXUS}/api/timetable/attendance-diagnostics`, { headers });
  if (diag.ok()) {
    const body = await diag.json();
    if (body?.class?.id && body?.class?.classroom_id) {
      return { token, classId: body.class.id, classroomId: body.class.classroom_id };
    }
  }

  return null;
}

function teacherCtx(request: APIRequestContext): Promise<Ctx | null> {
  if (!ctxPromise) {
    ctxPromise = (async () => {
      const auth = await getTestAuthToken(request, 'teacher');
      if (!auth) return null;
      return findAnyClass(request, auth.testToken);
    })();
  }
  return ctxPromise;
}

/**
 * Ask until the route exists.
 *
 * A Next dev server answers /_not-found for anything that arrives while it is
 * still compiling, so a cold run's first request to an endpoint 404s for reasons
 * that have nothing to do with the code.
 *
 * Retrying on the STATUS alone would be wrong here, because two of these routes
 * answer 404 legitimately ("no test is set on this class"). The difference is the
 * body: ours is JSON carrying an `error` sentence, the bundler's is an HTML page.
 * Without that distinction a spec asserting a real 404 would pass while the route
 * did not exist at all, which is the false green this repo has been bitten by.
 */
async function warm(send: () => Promise<any>): Promise<any> {
  let res = await send();
  for (let i = 0; i < 4 && res.status() === 404; i++) {
    const body = await res.json().catch(() => null);
    if (body && typeof body.error === 'string') return res;
    await new Promise((r) => setTimeout(r, 5000));
    res = await send();
  }
  return res;
}

test.describe('Nexus, the test a class sets', () => {
  test('refuses an unauthenticated caller before anything else', async ({ request }) => {
    const ctx = await teacherCtx(request);
    test.skip(!ctx, 'Nexus dev server / test-login unavailable');

    const res = await warm(() => request.get(`${NEXUS}/api/timetable/${ctx!.classId}/class-test`));
    expect([401, 403]).toContain(res.status());
  });

  test('gives a teacher everything the editor renders from, in one request', async ({ request }) => {
    const ctx = await teacherCtx(request);
    test.skip(!ctx, 'Nexus dev server / test-login unavailable');

    const res = await warm(() =>
      request.get(`${NEXUS}/api/timetable/${ctx!.classId}/class-test`, {
        headers: { Authorization: `Bearer ${ctx!.token}` },
      }),
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('class_test');
    expect(body.canEdit).toBe(true);
    // The defaults the dialog seeds itself from. A missing one silently gives
    // every class a deadline of "now", which is worse than none.
    expect(typeof body.default_passing_pct).toBe('number');
    expect(typeof body.default_due_days).toBe('number');
    expect(typeof body.max_questions).toBe('number');
    expect(Array.isArray(body.linkable)).toBe(true);
  });

  test('is settable on a class that has already run', async ({ request }) => {
    const ctx = await teacherCtx(request);
    test.skip(!ctx, 'Nexus dev server / test-login unavailable');

    // The sibling prep-test route 409s once the class has started, because there
    // is nothing left to prepare for. Setting a test from the class you have just
    // taught is the NORMAL path here, so that guard must never be copied across.
    // Proved by the shape of the refusal: a validation 400 means the request got
    // past every gate and died on its own empty body.
    const res = await warm(() =>
      request.post(`${NEXUS}/api/timetable/${ctx!.classId}/class-test`, {
        headers: { Authorization: `Bearer ${ctx!.token}`, 'Content-Type': 'application/json' },
        data: {},
      }),
    );

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toMatch(/at least one question|existing test/i);
    expect(String(body.error)).not.toMatch(/already started/i);
  });

  test('refuses a pass mark outside 1 to 100 before touching the placement', async ({ request }) => {
    const ctx = await teacherCtx(request);
    test.skip(!ctx, 'Nexus dev server / test-login unavailable');

    for (const pct of [0, 101, 'most of it']) {
      const res = await warm(() =>
        request.patch(`${NEXUS}/api/timetable/${ctx!.classId}/class-test`, {
          headers: { Authorization: `Bearer ${ctx!.token}`, 'Content-Type': 'application/json' },
          data: { passing_pct: pct },
        }),
      );
      expect(res.status(), `passing_pct ${pct} should be refused`).toBe(400);
    }
  });

  test('refuses a due date it cannot read', async ({ request }) => {
    const ctx = await teacherCtx(request);
    test.skip(!ctx, 'Nexus dev server / test-login unavailable');

    const res = await warm(() =>
      request.patch(`${NEXUS}/api/timetable/${ctx!.classId}/class-test`, {
        headers: { Authorization: `Bearer ${ctx!.token}`, 'Content-Type': 'application/json' },
        data: { due_at: 'next tuesday' },
      }),
    );
    expect(res.status()).toBe(400);
    // Said in words a teacher can act on, not as a parser error.
    expect(String((await res.json()).error)).toMatch(/could not be read/i);
  });

  test('says so plainly when there is no test to change or to chase', async ({ request }) => {
    const ctx = await teacherCtx(request);
    test.skip(!ctx, 'Nexus dev server / test-login unavailable');

    const current = await warm(() =>
      request.get(`${NEXUS}/api/timetable/${ctx!.classId}/class-test`, {
        headers: { Authorization: `Bearer ${ctx!.token}` },
      }),
    );
    const hasTest = Boolean((await current.json())?.class_test);
    test.skip(hasTest, 'This class already carries a class test, so the empty case cannot be checked');

    const patch = await warm(() =>
      request.patch(`${NEXUS}/api/timetable/${ctx!.classId}/class-test`, {
        headers: { Authorization: `Bearer ${ctx!.token}`, 'Content-Type': 'application/json' },
        data: { required: false },
      }),
    );
    expect(patch.status()).toBe(404);
    // The BODY, not just the status: /_not-found is also a 404, and asserting the
    // number alone would pass on a route that does not exist.
    expect(String((await patch.json()).error)).toMatch(/no test/i);

    // The nudge route must not fan out to a roster over a test nobody set.
    const nudge = await warm(() =>
      request.post(`${NEXUS}/api/timetable/${ctx!.classId}/class-test/nudge`, {
        headers: { Authorization: `Bearer ${ctx!.token}`, 'Content-Type': 'application/json' },
        data: {},
      }),
    );
    expect(nudge.status()).toBe(404);
    expect(String((await nudge.json()).error)).toMatch(/no test/i);
  });

  test('a student may read their own class test but never set one', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    test.skip(!auth, 'Nexus dev server / test-login unavailable');
    const ctx = await teacherCtx(request);
    test.skip(!ctx, 'No class found to test against');

    const headers = { Authorization: `Bearer ${auth!.testToken}`, 'Content-Type': 'application/json' };

    // Writing is staff work. 403 if they can see the class, 403/404 if they
    // cannot: what must never happen is a 201.
    const post = await warm(() =>
      request.post(`${NEXUS}/api/timetable/${ctx!.classId}/class-test`, {
        headers,
        data: { question_ids: ['00000000-0000-0000-0000-000000000001'] },
      }),
    );
    expect(post.status()).not.toBe(201);
    expect([403, 404]).toContain(post.status());

    const del = await warm(() =>
      request.delete(`${NEXUS}/api/timetable/${ctx!.classId}/class-test`, { headers }),
    );
    expect([403, 404]).toContain(del.status());

    const nudge = await warm(() =>
      request.post(`${NEXUS}/api/timetable/${ctx!.classId}/class-test/nudge`, {
        headers,
        data: {},
      }),
    );
    expect([403, 404]).toContain(nudge.status());
  });

  test('the student read never carries the questions or the answers', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    test.skip(!auth, 'Nexus dev server / test-login unavailable');
    const ctx = await teacherCtx(request);
    test.skip(!ctx, 'No class found to test against');

    const res = await warm(() =>
      request.get(`${NEXUS}/api/timetable/${ctx!.classId}/class-test`, {
        headers: { Authorization: `Bearer ${auth!.testToken}` },
      }),
    );
    // 403 or 404 when this student is not in that classroom, which is fine: the
    // point is that a 200 must not leak the paper.
    if (res.status() !== 200) return;

    const body = await res.json();
    expect(body.canEdit).toBe(false);
    // The picker feed and the roster are staff-only. Only the take engine hands
    // out questions, and it shuffles and grades them itself.
    expect(body.linkable).toBeUndefined();
    expect(body.roster).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('correct_answer');
  });

  test('a class test appears in the student Tests list with a soft deadline', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    test.skip(!auth, 'Nexus dev server / test-login unavailable');
    const classroomId = auth!.classrooms?.[0]?.id;
    test.skip(!classroomId, 'The test student is not enrolled in a classroom');

    const res = await warm(() =>
      request.get(`${NEXUS}/api/student/tests/overview?classroom=${classroomId}`, {
        headers: { Authorization: `Bearer ${auth!.testToken}` },
      }),
    );
    // 403 when the Question Bank is switched off for this classroom, which is the
    // case on staging. The shape below is only assertable when it is on.
    test.skip(res.status() === 403, 'The Question Bank is not open for the test student');
    expect(res.status()).toBe(200);

    const data = (await res.json())?.data;
    expect(Array.isArray(data.due)).toBe(true);

    const classTests = [...(data.all || [])].filter((t: any) => t.class_id);
    for (const t of classTests) {
      // THE rule this feature turns on. api/tests/attempt refuses a placement
      // whose available_until has passed, so a deadline written there would lock
      // a late student out of the very paper we are reminding them to finish.
      expect(t.available_until, `${t.title} must not close`).toBeNull();
      expect(t).toHaveProperty('due_at');
      expect(t).toHaveProperty('required');
      // Never 'closed'. Overdue, at worst.
      expect(t.status).not.toBe('closed');
    }
  });
});
