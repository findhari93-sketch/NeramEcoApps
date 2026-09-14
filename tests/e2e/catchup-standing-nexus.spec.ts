import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * Standing: who owes nothing, and who is ignoring us.
 *
 * API level rather than browser level, for the same reason as
 * catchup-missed-nexus.spec.ts: the Entra tenant forces MFA and the test
 * accounts cannot complete an interactive sign-in.
 *
 * The contract worth pinning here is the one that was broken by construction.
 * /api/catchup/overview used to drop any student whose open count and blocked
 * count were both zero, before the payload was built, so the only group worth
 * congratulating was the only group the screen deleted. Two things follow from
 * fixing that, and both are asserted below: the finished students are present
 * and carry `bucket: 'all_clear'`, and the three counters that used to get their
 * exclusion for free still exclude them, so the sub-line a teacher reads
 * ("across 27 students") did not silently change meaning.
 *
 * Self-skips without the Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;

async function getWarm(request: any, url: string, headers: Record<string, string>) {
  let res = await request.get(url, { headers });
  for (let i = 0; i < 3 && res.status() === 404; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    res = await request.get(url, { headers });
  }
  return res;
}

test.describe('Nexus — catch-up standing', () => {
  test('the overview is refused without auth', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/catchup/overview`);
    expect(res.status()).not.toBe(200);
    expect([400, 401, 403, 500]).toContain(res.status());
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
    expect([401, 403]).toContain(res.status());
  });

  test('every student carries a bucket and a standing block', async ({ request }) => {
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

    expect(Array.isArray(body.students)).toBe(true);
    for (const s of body.students) {
      expect(typeof s.bucket).toBe('string');
      // Added after this endpoint was already cached in the wild, so a row
      // without one is exactly the crash payload.ts exists to prevent.
      expect(s.standing, `standing missing for ${s.student?.name}`).toBeTruthy();
      expect(typeof s.standing.ownOpen).toBe('number');
      expect(typeof s.standing.lateJoinerOpen).toBe('number');
      expect(typeof s.standing.unresponsive).toBe('boolean');
    }
  });

  test('the tally counts all_clear and the headline counters exclude it', async ({ request }) => {
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

    expect(body.totals.byBucket).toHaveProperty('all_clear');

    const clear = body.students.filter((s: any) => s.bucket === 'all_clear');
    expect(body.totals.byBucket.all_clear).toBe(clear.length);

    // The regression this feature is most likely to cause: these three used to
    // exclude finished students for free, because they were never in the array.
    expect(body.totals.studentsCatchingUp).toBe(body.students.length - clear.length);
    expect(body.totals.studentsBehind).toBeLessThanOrEqual(body.totals.studentsCatchingUp);
  });

  test('a student who is all clear owes nothing and is never marked unresponsive', async ({
    request,
  }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    const res = await getWarm(request, `${NEXUS}/api/catchup/overview`, {
      Authorization: `Bearer ${auth.testToken}`,
    });
    const body = await res.json();

    for (const s of body.students.filter((x: any) => x.bucket === 'all_clear')) {
      expect(s.openCount).toBe(0);
      expect(s.blockedOnUs).toBe(0);
      expect(s.standing.ownOpen).toBe(0);
      expect(s.standing.lateJoinerOpen).toBe(0);
      // Somebody who has finished cannot be ignoring us, whatever went before.
      expect(s.standing.unresponsive).toBe(false);
    }
  });

  test('all_clear sorts last, so the work stays at the top of the queue', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    const res = await getWarm(request, `${NEXUS}/api/catchup/overview`, {
      Authorization: `Bearer ${auth.testToken}`,
    });
    const body = await res.json();
    const buckets = body.students.map((s: any) => s.bucket);
    const firstClear = buckets.indexOf('all_clear');
    if (firstClear === -1) {
      test.skip(true, 'No fully caught-up student in this classroom to order against');
      return;
    }
    // BUCKET_ORDER.indexOf returns -1 for all_clear, which without an explicit
    // rank would float every finished student to the top of a chase queue.
    expect(buckets.slice(firstClear).every((b: string) => b === 'all_clear')).toBe(true);
  });

  test('the celebration post refuses an unauthenticated caller', async ({ request }) => {
    const res = await request.post(`${NEXUS}/api/catchup/celebrate`, {
      data: { classroomId: '00000000-0000-0000-0000-000000000000', postToTeams: 'channel' },
    });
    expect(res.status()).not.toBe(200);
    expect([400, 401, 403, 500]).toContain(res.status());
  });

  test('a student cannot post a celebration', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.post(`${NEXUS}/api/catchup/celebrate`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
      data: { classroomId: '00000000-0000-0000-0000-000000000000', postToTeams: 'channel' },
    });
    expect([401, 403]).toContain(res.status());
  });

  // ── Who has already been congratulated ────────────────────────────────────
  // The post used to remember nothing, so the same students were named again
  // and again. Marking records a congratulation without posting; it goes
  // through the same auth and the same "clear right now" rule as the post.

  test('marking and unmarking refuse an unauthenticated caller', async ({ request }) => {
    for (const mode of ['mark', 'unmark']) {
      const res = await request.post(`${NEXUS}/api/catchup/celebrate`, {
        data: {
          classroomId: '00000000-0000-0000-0000-000000000000',
          mode,
          studentIds: [],
          celebrationIds: ['00000000-0000-0000-0000-000000000000'],
        },
      });
      expect(res.status(), `${mode} without auth`).not.toBe(200);
    }
  });

  test('a student cannot mark or unmark a congratulation', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    for (const mode of ['mark', 'unmark']) {
      const res = await request.post(`${NEXUS}/api/catchup/celebrate`, {
        headers: { Authorization: `Bearer ${auth.testToken}` },
        data: {
          classroomId: '00000000-0000-0000-0000-000000000000',
          mode,
          celebrationIds: ['00000000-0000-0000-0000-000000000000'],
        },
      });
      expect([401, 403], `${mode} as a student`).toContain(res.status());
    }
  });

  test('an unknown mode and an empty undo are rejected, not guessed at', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const headers = { Authorization: `Bearer ${auth.testToken}` };
    const bad = await request.post(`${NEXUS}/api/catchup/celebrate`, {
      headers,
      data: { classroomId: '00000000-0000-0000-0000-000000000000', mode: 'broadcast' },
    });
    expect(bad.status()).toBe(400);

    const empty = await request.post(`${NEXUS}/api/catchup/celebrate`, {
      headers,
      data: { classroomId: '00000000-0000-0000-0000-000000000000', mode: 'unmark', celebrationIds: [] },
    });
    expect(empty.status()).toBe(400);
  });

  test('every all-clear student says whether they were congratulated', async ({ request }) => {
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

    // A failed read must be said out loud, never passed off as "nobody".
    expect(typeof body.celebrationsUnavailable).toBe('boolean');
    if (body.celebrationsUnavailable) return;

    for (const s of body.students.filter((x: any) => x.bucket === 'all_clear')) {
      expect(s).toHaveProperty('celebration');
      if (s.celebration) {
        expect(['congratulated', 'cleared_again']).toContain(s.celebration.state);
        expect(['teams', 'marked']).toContain(s.celebration.source);
        expect(s.celebration.count).toBeGreaterThanOrEqual(1);
      }
    }
  });

  test('marking moves a student to congratulated, and Undo moves them back', async ({
    request,
  }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const headers = { Authorization: `Bearer ${auth.testToken}` };
    const read = async () =>
      (await getWarm(request, `${NEXUS}/api/catchup/overview`, headers)).json();

    const before = await read();
    if (before.celebrationsUnavailable) {
      test.skip(true, 'nexus_catchup_celebrations is not migrated in this environment');
      return;
    }
    const target = before.students.find((s: any) => s.bucket === 'all_clear' && !s.celebration);
    if (!target) {
      test.skip(true, 'No all-clear student without a congratulation to mark');
      return;
    }

    const mark = await request.post(`${NEXUS}/api/catchup/celebrate`, {
      headers,
      data: { classroomId: before.classroomId, mode: 'mark', studentIds: [target.student.id] },
    });
    expect(mark.status()).toBe(200);
    const marked = await mark.json();
    expect(marked.celebrationIds).toHaveLength(1);

    try {
      const after = await read();
      const row = after.students.find((s: any) => s.student.id === target.student.id);
      expect(row?.celebration?.state).toBe('congratulated');
      expect(row?.celebration?.source).toBe('marked');
    } finally {
      // Always undone: the student is real and the next teacher to open the tab
      // must not find them silently marked by a test.
      const undo = await request.post(`${NEXUS}/api/catchup/celebrate`, {
        headers,
        data: { classroomId: before.classroomId, mode: 'unmark', celebrationIds: marked.celebrationIds },
      });
      expect(undo.status()).toBe(200);
      expect((await undo.json()).removed).toBe(1);
    }

    const restored = await read();
    const back = restored.students.find((s: any) => s.student.id === target.student.id);
    expect(back?.celebration ?? null).toBeNull();
  });

  test('the wall is refused without auth', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/catchup/wall?classroomId=abc`);
    expect(res.status()).not.toBe(200);
  });

  test('a student cannot read the wall of a classroom they are not in', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    // A real UUID that no test student is enrolled in.
    const res = await request.get(
      `${NEXUS}/api/catchup/wall?classroomId=00000000-0000-0000-0000-000000000000`,
      { headers: { Authorization: `Bearer ${auth.testToken}` } },
    );
    // 403 when the feature is on, an empty list when it is switched off. Either
    // way, no names for a classroom they do not belong to.
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.allClear).toEqual([]);
    } else {
      expect([401, 403]).toContain(res.status());
    }
  });

  test('the wall carries names and faces and nothing else', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    const overview = await getWarm(request, `${NEXUS}/api/catchup/overview`, {
      Authorization: `Bearer ${auth.testToken}`,
    });
    const classroomId = (await overview.json()).classroomId;
    if (!classroomId) {
      test.skip(true, 'No classroom to read a wall for');
      return;
    }

    const res = await getWarm(request, `${NEXUS}/api/catchup/wall?classroomId=${classroomId}`, {
      Authorization: `Bearer ${auth.testToken}`,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.allClear)).toBe(true);

    for (const p of body.allClear) {
      // The loader returns a whole standing block with counts and nudge history.
      // None of it may reach a student's browser.
      expect(Object.keys(p).sort()).toEqual(['avatar_url', 'id', 'name']);
    }
  });
});
