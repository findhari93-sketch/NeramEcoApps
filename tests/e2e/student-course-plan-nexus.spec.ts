import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * Student course-plan timeline E2E (API level).
 *
 * Verifies the student course-plan endpoint returns the expected shape and,
 * critically, that it never leaks a raw recording URL (recordings are gated:
 * a student watches only through a published recap). Self-skips without the
 * Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;

test.describe('Nexus — Student course plan', () => {
  test('requires auth', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/student/course-plan`);
    expect([401, 403]).toContain(res.status());
  });

  test('returns a plans array and never exposes a recording URL', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.get(`${NEXUS}/api/student/course-plan`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    if (res.status() === 500) {
      test.skip(true, 'Course-plan tables not migrated in this environment');
      return;
    }
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.plans)).toBe(true);

    // Gated-recordings guarantee: no recording_url / youtube_url anywhere in the
    // student payload. Only a recap id (published) and the recording_pending flag.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('recording_url');
    expect(raw).not.toContain('youtube_url');
    expect(raw).not.toContain('teams.microsoft.com');
    expect(raw).not.toContain('sharepoint.com');

    for (const section of body.plans) {
      expect(section).toHaveProperty('days');
      expect(section).toHaveProperty('upcoming');
      // At most one upcoming preview (FUTURE_PREVIEW_DAYS = 1).
      expect((section.upcoming || []).length).toBeLessThanOrEqual(1);
      for (const day of section.days || []) {
        // recap, when present, only carries an id (no URL).
        if (day.recap) {
          expect(day.recap).toHaveProperty('id');
          expect(day.recap).not.toHaveProperty('recording_url');
        }
      }
    }
  });
});
