import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Admin-controlled feature flags E2E.
 *
 * Feature flags decide which Nexus menus/pages a student can reach. The menu
 * hiding and the FeatureGate page block are client-side; here we verify the
 * pieces they rely on:
 *   - the public settings read used by the admin page,
 *   - /api/auth/me returning a resolved flag map (core features always on),
 *   - the admin-only write being protected from anonymous/non-admin callers,
 *   - the admin toggle page rendering for admins and being denied to others.
 *
 * Full "toggle -> student menu updates -> direct URL blocked" is a manual/UI
 * pass (student test-mode intentionally runs all-enabled so existing student
 * specs are unaffected; real gating flows through /api/auth/me).
 *
 * Self-skips without the Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;
const KEY = 'feature_flags';

test.describe('Nexus — Feature flags', () => {
  test('settings read for feature_flags is public and well-formed', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/settings?key=${KEY}`);
    if (res.status() === 500) {
      test.skip(true, 'Nexus dev server / nexus_settings unavailable');
      return;
    }
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Either no overrides yet (null) or a JSON object of overrides.
    expect(body).toHaveProperty('value');
    if (body.value !== null) {
      expect(typeof body.value).toBe('object');
    }
  });

  test('/api/auth/me returns a resolved flag map with core features on', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const res = await request.get(`${NEXUS}/api/auth/me`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('featureFlags');
    const flags = body.featureFlags as Record<string, boolean>;

    // Core features can never be off, whatever the DB says.
    expect(flags['student.dashboard']).toBe(true);
    expect(flags['staff.admin-features']).toBe(true);
    // The map covers the whole registry, so a known toggleable id is present.
    expect(typeof flags['student.timetable']).toBe('boolean');
  });

  test('anonymous writes to settings are rejected', async ({ request }) => {
    const res = await request.patch(`${NEXUS}/api/settings`, {
      data: { key: KEY, value: { 'student.timetable': true } },
    });
    // The shared settings route throws on a missing token into its catch-all,
    // so a no-auth write surfaces as 401/403/500 — never a successful 200.
    expect(res.status()).not.toBe(200);
    expect([401, 403, 500]).toContain(res.status());
  });

  test('only admins can write feature flags', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }

    // Read current overrides so we can restore them after the test.
    const before = await request.get(`${NEXUS}/api/settings?key=${KEY}`);
    const original = before.ok() ? (await before.json()).value : null;

    const res = await request.patch(`${NEXUS}/api/settings`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
      data: { key: KEY, value: { ...(original || {}), 'student.timetable': true } },
    });

    if (auth.nexusRole === 'admin') {
      // Admin: the write succeeds and round-trips through /api/auth/me.
      expect(res.status()).toBe(200);
      const me = await request.get(`${NEXUS}/api/auth/me`, {
        headers: { Authorization: `Bearer ${auth.testToken}` },
      });
      expect((await me.json()).featureFlags['student.timetable']).toBe(true);
      // Restore the original setting so we don't leave the env dirty.
      await request.patch(`${NEXUS}/api/settings`, {
        headers: { Authorization: `Bearer ${auth.testToken}` },
        data: { key: KEY, value: original ?? {} },
      });
    } else {
      // A plain teacher is forbidden from writing feature flags.
      expect(res.status()).toBe(403);
    }
  });
});

test.describe('Nexus — Feature flags admin page (mobile)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('admin sees the toggle page; non-admins are redirected', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    if (!ok) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    const auth = await getTestAuthToken(page.request, 'teacher');

    await page.goto(`${NEXUS}/teacher/admin/features`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);

    if (auth?.nexusRole === 'admin') {
      await expect(page.getByRole('heading', { name: 'Features' })).toBeVisible();
      // At least one feature switch renders.
      await expect(page.locator('input[type="checkbox"]').first()).toBeVisible();
      await assertNoHorizontalOverflow(page);
    } else {
      // RBAC: a non-admin is bounced to the teacher dashboard by the page guard.
      await expect(page).toHaveURL(/\/teacher\/dashboard/);
    }
  });
});
