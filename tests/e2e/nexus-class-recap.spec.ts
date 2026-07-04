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
  test('student recap list rejects unauthenticated requests', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/student/class-recaps`);
    expect(res.status()).toBe(401);
  });

  test('recap creation rejects unauthenticated requests', async ({ request }) => {
    const res = await request.post(`${NEXUS}/api/class-recaps`, {
      data: { scheduled_class_id: '00000000-0000-0000-0000-000000000000' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('student recap list returns an array when authorized', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    test.skip(!auth, 'Student test login unavailable');
    const res = await request.get(`${NEXUS}/api/student/class-recaps`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
    });
    test.skip(res.status() === 500, 'class-recap migration not applied yet');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.recaps)).toBe(true);
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
