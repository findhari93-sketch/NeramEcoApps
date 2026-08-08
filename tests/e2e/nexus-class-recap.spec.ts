import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * Class Recap (gated recorded-class catch-up) API contracts.
 *
 * These assert the auth + validation surface, which is independent of seeded
 * recordings. The full watch-and-pass flow (video gating + checkpoint quiz)
 * needs a published recap backed by a real SharePoint recording + transcript,
 * so it is covered by the manual verification steps in the plan. Tests that hit
 * the DB tolerate a 500 when the migration has not been applied yet (skip).
 */
const NEXUS = APP_URLS.nexus;

test.describe('Class Recap API', () => {
  // The student collection route GET /api/student/class-recaps is gone. It
  // backed the Study Zone list, which was a second door to the same recordings
  // that never started the catch-up clock. The classes a student may rewatch
  // now ride along on /api/student/catchup-journey, asserted below.
  test('recap creation rejects unauthenticated requests', async ({ request }) => {
    const res = await request.post(`${NEXUS}/api/class-recaps`, {
      data: { scheduled_class_id: '00000000-0000-0000-0000-000000000000' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('the catch-up payload carries the rewatchable list', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    test.skip(!auth, 'Student test login unavailable');
    const res = await request.get(`${NEXUS}/api/student/catchup-journey`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
    });
    test.skip(res.status() === 500, 'class-recap migration not applied yet');
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Always an array, including for a student with no classroom and one with no
    // backlog at all. Both of those used to take different early returns, and
    // the no-classroom one shipped without `missed`, which crashed the page.
    expect(Array.isArray(body.rewatchable)).toBe(true);
    expect(Array.isArray(body.missed)).toBe(true);
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('a class the student still owes never appears in the rewatchable list', async ({
    request,
  }) => {
    const auth = await getTestAuthToken(request, 'student');
    test.skip(!auth, 'Student test login unavailable');
    const res = await request.get(`${NEXUS}/api/student/catchup-journey`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
    });
    test.skip(res.status() !== 200, 'catch-up payload unavailable');
    const body = await res.json();
    const owed = new Set<string>(
      [...(body.missed || []), ...(body.items || [])]
        .filter((i: any) => i.status !== 'done' && i.status !== 'excused')
        .map((i: any) => i.scheduled_class_id),
    );
    // The whole point of building both lists in one request: a class belongs to
    // exactly one tab, so it can never be both homework and optional revision.
    const overlap = (body.rewatchable || []).filter((r: any) => owed.has(r.class_id));
    expect(overlap).toEqual([]);
  });

  test('candidates requires a classroomId', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'Teacher test login unavailable');
    const res = await request.get(`${NEXUS}/api/class-recaps/candidates`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
    });
    expect(res.status()).toBe(400);
  });

  test('recap creation requires a scheduled_class_id', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'Teacher test login unavailable');
    const res = await request.post(`${NEXUS}/api/class-recaps`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('manual recap creation requires title, classroom_id and recording_url', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'Teacher test login unavailable');
    // A partial manual body (recording_url only) is rejected with 400.
    const res = await request.post(`${NEXUS}/api/class-recaps`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
      data: { recording_url: 'https://teams.microsoft.com/l/meetingrecap?x=1' },
    });
    expect(res.status()).toBe(400);
  });
});
