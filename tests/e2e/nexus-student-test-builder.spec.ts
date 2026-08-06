import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * NXS-0114: a student could not build a practice test at all.
 *
 * Every request /student/tests/new made came back 400 "classroom_id is
 * required", so the question list, the topic filter and the folder picker were
 * all empty and a developer message was shown to a student.
 *
 * Three independent causes, and this spec pins all three:
 *
 *   1. the page asked for `classroom=` while the API read `classroom_id`
 *   2. GET /api/question-bank/tags passed a hardcoded null classroom
 *   3. GET /api/test-folders did the same
 *
 * API level rather than browser level, matching the other nexus specs: the
 * Entra tenant forces MFA, so the test accounts cannot complete an interactive
 * sign-in, and the contract is what actually broke.
 *
 * WHAT IS ASSERTED UNCONDITIONALLY, and why it is split this way.
 *
 * The regression is the SHAPE of the refusal, not the 200. Whether the test
 * student's classroom has the Question Bank switched on is an environment fact
 * this suite does not control: staging currently has no rows in
 * nexus_qb_classroom_links at all, while production has it active. So every
 * test below asserts "never the classroom_id message" for real, on every run,
 * and only asserts a 200 body when the bank is actually open, skipping with a
 * stated reason otherwise. A spec that skipped wholesale would be a spec that
 * can never fail, which this repo has been bitten by before.
 *
 * Self-skips without the Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;

/** The sentence a student must never be shown. */
const DEV_MESSAGE = 'classroom_id is required';

/**
 * GET a route that may still be compiling. A Next dev server answers
 * /_not-found (404) for anything arriving mid-build, so a cold run's first
 * request to an endpoint can 404 for reasons unrelated to the code.
 */
async function getWarm(request: any, url: string, headers: Record<string, string>) {
  let res = await request.get(url, { headers });
  for (let i = 0; i < 3 && res.status() === 404; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    res = await request.get(url, { headers });
  }
  return res;
}

async function auth(request: any, role: 'student' | 'teacher' = 'student') {
  const token = await getTestAuthToken(request, role);
  if (!token) return null;
  return { headers: { Authorization: `Bearer ${token.testToken}` }, login: token };
}

/**
 * The refusal a student may legitimately see: their classroom has the bank
 * switched off. Anything mentioning a query parameter is the bug.
 */
async function assertRefusalIsReadable(res: any) {
  const body = await res.json().catch(() => ({}));
  const error = String(body?.error ?? '');
  expect(error, `route answered ${res.status()} with a developer message`).not.toContain(DEV_MESSAGE);
  return { status: res.status(), error, body };
}

test.describe('Nexus — the student practice-test builder', () => {
  test('the tag registry never answers a student with a parameter name', async ({ request }) => {
    const a = await auth(request);
    if (!a) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    const res = await getWarm(request, `${NEXUS}/api/question-bank/tags`, a.headers);
    const { status, body } = await assertRefusalIsReadable(res);

    if (status === 403) {
      test.info().annotations.push({
        type: 'note',
        description: 'Question Bank is switched off for the test student, so only the refusal shape was checked',
      });
      return;
    }
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("a student's own folder tree never answers with a parameter name", async ({ request }) => {
    const a = await auth(request);
    if (!a) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    const res = await getWarm(request, `${NEXUS}/api/test-folders`, a.headers);
    const { status, body } = await assertRefusalIsReadable(res);

    if (status === 403) return;
    expect(status).toBe(200);
    expect(body.data).toHaveProperty('tree');
  });

  test('the tag registry and the folder tree agree with each other', async ({ request }) => {
    const a = await auth(request);
    if (!a) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    // Both are non-classroom-scoped resources behind the same rule, so they must
    // answer the same student identically. They did not: one 400d on a missing
    // classroom while the page had no classroom to give.
    const tags = await getWarm(request, `${NEXUS}/api/question-bank/tags`, a.headers);
    const folders = await getWarm(request, `${NEXUS}/api/test-folders`, a.headers);

    await assertRefusalIsReadable(tags);
    await assertRefusalIsReadable(folders);
    expect(tags.status()).toBe(folders.status());
  });

  test('the question list accepts both classroom and classroom_id', async ({ request }) => {
    const a = await auth(request);
    if (!a) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const classroomId = a.login.classrooms?.[0]?.id;
    if (!classroomId) {
      test.skip(true, 'The test student is not enrolled in a classroom');
      return;
    }

    const base = `${NEXUS}/api/question-bank/questions?page=1&page_size=5`;

    // The long name, which the route always read.
    const long = await getWarm(request, `${base}&classroom_id=${classroomId}`, a.headers);
    await assertRefusalIsReadable(long);

    // The short one, which the builder sent and the route ignored. Kept working
    // so an old bookmarked URL does not break.
    const short = await getWarm(request, `${base}&classroom=${classroomId}`, a.headers);
    await assertRefusalIsReadable(short);

    // Whatever the environment decides, the two spellings must decide alike.
    // That equivalence is the actual fix and it holds at 200 and at 403.
    expect(short.status()).toBe(long.status());
    if (long.status() === 200) {
      const body = await long.json();
      expect(body.data).toHaveProperty('questions');
    }
  });

  test('a request naming no classroom at all is still a 400 on the scoped route', async ({ request }) => {
    const a = await auth(request);
    if (!a) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    // This route genuinely is classroom scoped, so 400 here is correct and must
    // survive. The fix was to stop the NON-scoped routes sharing its fate, not
    // to remove the check.
    const res = await getWarm(request, `${NEXUS}/api/question-bank/questions?page=1&page_size=5`, a.headers);
    expect([400, 403]).toContain(res.status());
  });

  /**
   * The 200 path, proved without depending on whether the bank happens to be
   * switched on for the test student.
   *
   * Staff short-circuit the enrolment check inside the verifier, so a teacher
   * token exercises the same handlers all the way through to a real body. That
   * is what makes the student tests above meaningful: they show the refusal is
   * the right refusal, and these show the route underneath genuinely works
   * without a classroom being named.
   */
  test('the same routes serve real data when the caller is allowed through', async ({ request }) => {
    const a = await auth(request, 'teacher');
    if (!a) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    const tags = await getWarm(request, `${NEXUS}/api/question-bank/tags`, a.headers);
    expect(tags.status()).toBe(200);
    expect(Array.isArray((await tags.json()).data)).toBe(true);

    const folders = await getWarm(request, `${NEXUS}/api/test-folders`, a.headers);
    expect(folders.status()).toBe(200);
    expect((await folders.json()).data).toHaveProperty('tree');

    const library = await getWarm(request, `${NEXUS}/api/question-bank/tests/library`, a.headers);
    expect(library.status()).toBe(200);
  });

  test('the builder refuses a paper larger than the ceiling it advertises', async ({ request }) => {
    const a = await auth(request);
    if (!a) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const classroomId = a.login.classrooms?.[0]?.id;
    if (!classroomId) {
      test.skip(true, 'The test student is not enrolled in a classroom');
      return;
    }

    // 51 ids that need not exist: the size check runs before composition. A
    // student ended up sitting a 544-question "practice" paper because only the
    // browser held this line.
    const tooMany = Array.from(
      { length: 51 },
      (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    );

    const res = await request.post(`${NEXUS}/api/question-bank/custom-tests`, {
      headers: { ...a.headers, 'Content-Type': 'application/json' },
      data: {
        title: 'Oversized paper',
        question_ids: tooMany,
        timer_type: 'none',
        classroom_id: classroomId,
      },
    });

    // 403 when the bank is switched off for this classroom; the size refusal
    // otherwise. What must never happen is a 201.
    expect(res.status()).not.toBe(201);
    if (res.status() === 400) {
      const body = await res.json();
      expect(String(body.error)).toContain('tops out at 50');
    }
  });
});
