import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * The YouTube backup, at API level.
 *
 * API level rather than browser level for the reason prework-nexus.spec records:
 * the Entra tenant forces MFA and the test accounts cannot complete an
 * interactive sign-in.
 *
 * NOTHING HERE MAY EVER UPLOAD A VIDEO. One real upload costs 1600 of a 10,000
 * unit daily quota, so a test suite that uploaded on every run would exhaust a
 * day of production capacity in six runs. Everything below either refuses to run
 * or uses dry_run, which is also the operator's "what would go up tonight" tool.
 *
 * What these cover that the unit tests cannot: the candidate query and the
 * anti-join run against a REAL database, and the refusals hold against whatever
 * a client actually sends rather than against a mock.
 *
 * Self-skips without the Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;
const MISSING = '00000000-0000-0000-0000-000000000000';

async function nexusUp(request: any): Promise<boolean> {
  try {
    const res = await request.get(`${NEXUS}/api/health`, { timeout: 5000 });
    return res.status() < 500;
  } catch {
    return false;
  }
}

test.describe('Nexus, YouTube backup', () => {
  test('the cron refuses to run without CRON_SECRET, rather than waving the call through', async ({ request }) => {
    test.skip(!(await nexusUp(request)), 'Nexus dev server not running');

    const res = await request.get(`${NEXUS}/api/cron/youtube-backup`);

    // 503 (not configured) or 401 (configured, no bearer). A 200 would mean an
    // open endpoint that spends 1600 quota units per press.
    expect([401, 503]).toContain(res.status());
    expect(res.status()).not.toBe(200);
  });

  test('a wrong bearer is rejected', async ({ request }) => {
    test.skip(!(await nexusUp(request)), 'Nexus dev server not running');

    const res = await request.get(`${NEXUS}/api/cron/youtube-backup`, {
      headers: { Authorization: 'Bearer definitely-not-the-secret' },
    });
    expect([401, 503]).toContain(res.status());
  });

  test('dry run reports a plan and starts nothing', async ({ request }) => {
    test.skip(!(await nexusUp(request)), 'Nexus dev server not running');
    const secret = process.env.CRON_SECRET;
    test.skip(!secret, 'CRON_SECRET not set in this environment');

    const res = await request.get(`${NEXUS}/api/cron/youtube-backup?dry_run=1`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    // The flag defaults OFF, so an untouched environment reports skipped. Either
    // shape is correct; what must never appear is a started upload.
    if (body.skipped) {
      expect(body.skipped).toContain('disabled');
      return;
    }
    expect(body.started).toBe(0);
    expect(typeof body.candidates).toBe('number');
  });

  test('the status route never returns a token field', async ({ request }) => {
    test.skip(!(await nexusUp(request)), 'Nexus dev server not running');

    const token = await getTestAuthToken(request, 'teacher').catch(() => null);
    test.skip(!token, 'no teacher test token available');

    const res = await request.get(`${NEXUS}/api/admin/youtube-oauth/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // 403 is fine: a teacher without system.settings should be refused.
    if (res.status() === 403) return;

    const raw = await res.text();
    expect(raw).not.toContain('refresh_token');
    expect(raw).not.toContain('access_token"');
    expect(raw).not.toContain('client_secret');
  });

  test('the OAuth start route is not open to the world', async ({ request }) => {
    test.skip(!(await nexusUp(request)), 'Nexus dev server not running');

    const res = await request.get(`${NEXUS}/api/admin/youtube-oauth/start`, {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    // Anonymous must never get the 302 to Google.
    expect([401, 403]).toContain(res.status());
  });

  test('disconnect rejects an anonymous caller', async ({ request }) => {
    test.skip(!(await nexusUp(request)), 'Nexus dev server not running');

    const res = await request.post(`${NEXUS}/api/admin/youtube-oauth/disconnect`, {
      failOnStatusCode: false,
    });
    expect([401, 403]).toContain(res.status());
  });

  /**
   * The regression guard that matters most in this feature.
   *
   * GET /api/settings has no authentication at all and returns any key's value,
   * which is precisely why the refresh token lives in its own table. If someone
   * later "simplifies" this by moving the credential into nexus_settings, this
   * test is what catches it before the token is public.
   */
  test('no YouTube credential is reachable through the unauthenticated settings reader', async ({ request }) => {
    test.skip(!(await nexusUp(request)), 'Nexus dev server not running');

    for (const key of ['youtube_credentials', 'youtube_oauth', 'youtube_refresh_token']) {
      const res = await request.get(`${NEXUS}/api/settings?key=${key}`);
      if (!res.ok()) continue;
      const body = await res.json();
      expect(body.value ?? null).toBeNull();
    }
  });

  test('the probe route needs the same auth as the sweep', async ({ request }) => {
    test.skip(!(await nexusUp(request)), 'Nexus dev server not running');

    const res = await request.get(`${NEXUS}/api/cron/youtube-backup?probe=${MISSING}`);
    expect([401, 503]).toContain(res.status());
  });
});
