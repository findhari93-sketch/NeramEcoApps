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
