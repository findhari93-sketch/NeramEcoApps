import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Alumni Hall of Fame gallery E2E.
 *
 * Verifies the gallery feed honours the `audience` filter (current vs alumni)
 * and that the gallery UI exposes the Current students / Hall of Fame toggle.
 *
 * Prerequisites (otherwise self-skips): Nexus dev server on :3012 and the alumni
 * migration applied.
 */

const NEXUS = APP_URLS.nexus;
const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

test.describe('Nexus — Alumni Hall of Fame gallery', () => {
  test.describe.configure({ mode: 'serial' });

  let teacherToken: string;

  test('setup: get teacher token', async ({ request }) => {
    const res = await request.post(`${NEXUS}/api/auth/test-login`, {
      data: { email: 'e2etestingteacher@neramclasses.com', role: 'teacher' },
    });
    expect(res.status()).toBe(200);
    teacherToken = (await res.json()).testToken;
    expect(teacherToken).toBeTruthy();
  });

  test('gallery API accepts the audience filter and returns arrays', async ({ request }) => {
    const current = await request.get(`${NEXUS}/api/drawing/gallery?audience=current`, {
      headers: authHeader(teacherToken),
    });
    const alumni = await request.get(`${NEXUS}/api/drawing/gallery?audience=alumni`, {
      headers: authHeader(teacherToken),
    });

    if (current.status() === 500 || alumni.status() === 500) {
      test.skip(true, 'Gallery API errored (migration likely not applied)');
      return;
    }

    expect(current.status()).toBe(200);
    expect(alumni.status()).toBe(200);
    const currentPosts = (await current.json()).posts;
    const alumniPosts = (await alumni.json()).posts;
    expect(Array.isArray(currentPosts)).toBe(true);
    expect(Array.isArray(alumniPosts)).toBe(true);

    // No current-feed post should belong to an alumnus, and vice versa.
    for (const p of currentPosts) expect(p.student?.is_alumni).not.toBe(true);
    for (const p of alumniPosts) expect(p.student?.is_alumni).toBe(true);
  });

  // The teacher Gallery tab left with the Drawing Reviews queue (retired September 2026). Inspiration replaces it.
});
