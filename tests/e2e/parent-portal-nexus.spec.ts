import { test, expect } from '@playwright/test';
import {
  APP_URLS,
  PARENT_ACCOUNT,
  STUDENT_ACCOUNT,
  injectParentAuthForPage,
  getTestAuthToken,
} from '../utils/credentials';

/**
 * Parent portal.
 *
 * Worth stating what this replaces: the previous parent spec logged in as a
 * TEACHER and only asserted 400/401/404 error paths, so it never exercised a
 * parent at all. Meanwhile loginAsRole(page, 'parent') silently signed in as
 * the student. Every parent assertion in the suite passed for the wrong reason.
 *
 * These tests go through the real credential login and the real `par_` session.
 *
 * The single most important test here is "unsynced classes are not reported as
 * absences". Attendance sync needs a delegated Microsoft token, so a class
 * nobody synced has no attendance rows and is indistinguishable from a full
 * roster absence. Getting that wrong tells every parent their child missed
 * every class.
 */

/** Provision a parent and return their real session token. */
async function provisionParent(
  request: any,
  opts: { mustChangePassword?: boolean; reset?: boolean } = {}
) {
  const res = await request.post(`${APP_URLS.nexus}/api/auth/parent/test-login`, {
    data: {
      studentEmail: STUDENT_ACCOUNT.email,
      loginId: PARENT_ACCOUNT.loginId,
      password: PARENT_ACCOUNT.password,
      mustChangePassword: opts.mustChangePassword ?? false,
      reset: opts.reset ?? true,
    },
  });
  return { ok: res.ok(), status: res.status(), body: res.ok() ? await res.json() : null };
}

test.describe('Parent portal: sign in', () => {
  test('signs in through the real form and lands on the dashboard', async ({ page, request }) => {
    const provisioned = await provisionParent(request, { mustChangePassword: false });
    test.skip(!provisioned.ok, 'Parent test-login unavailable (needs a non-production server)');

    await page.goto(`${APP_URLS.nexus}/parent/login`);
    await page.getByLabel(/login id/i).fill(PARENT_ACCOUNT.loginId);
    await page.getByLabel(/^password/i).fill(PARENT_ACCOUNT.password);
    await page.getByRole('button', { name: /^sign in$/i }).click();

    await page.waitForURL(/\/parent\/dashboard/, { timeout: 20_000 });
    // The RoleGuard regression: a parent holds no nexus_enrollments row, so
    // before the fix this rendered the student "contact admin on Teams" screen.
    await expect(page.getByText(/contact.*admin.*teams/i)).toHaveCount(0);
  });

  test('a first-time parent is forced to the password screen', async ({ page, request }) => {
    const provisioned = await provisionParent(request, { mustChangePassword: true });
    test.skip(!provisioned.ok, 'Parent test-login unavailable');

    await page.goto(`${APP_URLS.nexus}/parent/login`);
    await page.getByLabel(/login id/i).fill(PARENT_ACCOUNT.loginId);
    await page.getByLabel(/^password/i).fill(PARENT_ACCOUNT.password);
    await page.getByRole('button', { name: /^sign in$/i }).click();

    await page.waitForURL(/\/parent\/set-password/, { timeout: 20_000 });
  });

  test('the forced password change is enforced by the server, not the router', async ({ request }) => {
    const provisioned = await provisionParent(request, { mustChangePassword: true });
    test.skip(!provisioned.ok, 'Parent test-login unavailable');

    // A parent who simply navigates past the set-password page must still be
    // refused. If this only lived in the client redirect, curl would bypass it.
    const res = await request.get(`${APP_URLS.nexus}/api/parent/overview`, {
      headers: { Authorization: `Bearer ${provisioned.body.token}` },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toMatch(/set a new password/i);
  });

  test('a wrong password gives a generic error that does not confirm the account exists', async ({ request }) => {
    const provisioned = await provisionParent(request);
    test.skip(!provisioned.ok, 'Parent test-login unavailable');

    const wrongPassword = await request.post(`${APP_URLS.nexus}/api/auth/parent/login`, {
      data: { loginId: PARENT_ACCOUNT.loginId, password: 'definitely-not-it-9' },
    });
    const unknownId = await request.post(`${APP_URLS.nexus}/api/auth/parent/login`, {
      data: { loginId: 'nobody.p0000', password: 'definitely-not-it-9' },
    });

    expect(wrongPassword.status()).toBe(401);
    expect(unknownId.status()).toBe(401);
    // Identical messages, or the response becomes a login-ID oracle.
    expect((await wrongPassword.json()).error).toBe((await unknownId.json()).error);
  });

  test('locks the account after repeated failures', async ({ request }) => {
    const provisioned = await provisionParent(request);
    test.skip(!provisioned.ok, 'Parent test-login unavailable');

    let sawLockout = false;
    for (let i = 0; i < 6; i++) {
      const res = await request.post(`${APP_URLS.nexus}/api/auth/parent/login`, {
        data: { loginId: PARENT_ACCOUNT.loginId, password: `wrong-guess-${i}` },
      });
      if (res.status() === 429) {
        sawLockout = true;
        expect((await res.json()).error).toMatch(/too many/i);
        break;
      }
    }
    expect(sawLockout).toBe(true);

    // Reset so later tests are not blocked by the lockout we just triggered.
    await provisionParent(request);
  });
});

test.describe('Parent portal: data honesty', () => {
  test('never reports a percentage when nothing was measured', async ({ request }) => {
    const provisioned = await provisionParent(request);
    test.skip(!provisioned.ok, 'Parent test-login unavailable');

    const res = await request.get(`${APP_URLS.nexus}/api/parent/overview`, {
      headers: { Authorization: `Bearer ${provisioned.body.token}` },
    });
    test.skip(res.status() === 404, 'E2E student has no active classroom');
    expect(res.ok()).toBeTruthy();

    const data = await res.json();

    // THE invariant. attendanceRate is null (never 0) when no class in the
    // window has any attendance row, and the sentence says so in words.
    if (data.attendance.measuredClasses === 0) {
      expect(data.attendance.attendanceRate).toBeNull();
      expect(data.attendanceSentence).toMatch(/hasn't been recorded|No classes scheduled/i);
      expect(data.verdict.band).toBe('not_enough_data');
    } else {
      expect(typeof data.attendance.attendanceRate).toBe('number');
    }

    // An unmeasured class must never carry a derived verdict.
    for (const cls of data.recentClasses || []) {
      if (cls.measurement === 'not_measured') {
        expect(cls.attended).toBeNull();
        expect(cls.late).toBeNull();
        expect(cls.droppedMidClass).toBeNull();
        expect(cls.label).toBe('Not recorded');
      }
    }
  });

  test('the classes tab marks unrecorded classes rather than showing them as absences', async ({ request }) => {
    const provisioned = await provisionParent(request);
    test.skip(!provisioned.ok, 'Parent test-login unavailable');

    const res = await request.get(`${APP_URLS.nexus}/api/parent/timetable`, {
      headers: { Authorization: `Bearer ${provisioned.body.token}` },
    });
    test.skip(res.status() === 404, 'E2E student has no active classroom');
    expect(res.ok()).toBeTruthy();

    const data = await res.json();
    const unmeasured = (data.recent || []).filter((c: any) => c.measurement === 'not_measured');

    // Unmeasured classes are excluded from every count, so the measured total
    // plus the unmeasured total is the only thing that adds up to the whole.
    expect(data.summary.measuredClasses + data.summary.notMeasuredClasses).toBe(
      (data.recent || []).length
    );
    expect(data.summary.notMeasuredClasses).toBe(unmeasured.length);
    if (data.summary.measuredClasses === 0) {
      expect(data.summary.attendanceRate).toBeNull();
    }
  });
});

test.describe('Parent portal: authorization', () => {
  test('a parent token is refused by staff routes', async ({ request }) => {
    const provisioned = await provisionParent(request);
    test.skip(!provisioned.ok, 'Parent test-login unavailable');

    // Proves the fail-closed default in verifyMsToken: these routes were never
    // edited to know about parents, and that is exactly why they must refuse.
    for (const path of [
      '/api/students/inactivity?classroom=00000000-0000-0000-0000-000000000000',
      '/api/timetable?classroom=00000000-0000-0000-0000-000000000000&start=2026-07-01&end=2026-07-31',
      '/api/study-materials/folders',
    ]) {
      const res = await request.get(`${APP_URLS.nexus}${path}`, {
        headers: { Authorization: `Bearer ${provisioned.body.token}` },
      });
      expect(
        [401, 403].includes(res.status()),
        `${path} should refuse a parent token, got ${res.status()}`
      ).toBeTruthy();
    }
  });

  test('a parent cannot request another student', async ({ request }) => {
    const provisioned = await provisionParent(request);
    test.skip(!provisioned.ok, 'Parent test-login unavailable');

    // Proves assertParentOf. There is no RLS fallback behind this.
    const res = await request.get(
      `${APP_URLS.nexus}/api/parent/overview?student=00000000-0000-0000-0000-000000000000`,
      { headers: { Authorization: `Bearer ${provisioned.body.token}` } }
    );
    expect(res.status()).toBe(403);
  });

  test('a teacher token is refused by parent routes', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'Teacher test-login unavailable');

    const res = await request.get(`${APP_URLS.nexus}/api/parent/overview`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('revoking access takes effect on the very next request', async ({ request }) => {
    const provisioned = await provisionParent(request);
    test.skip(!provisioned.ok, 'Parent test-login unavailable');

    const staff = await getTestAuthToken(request, 'teacher');
    test.skip(!staff, 'Teacher test-login unavailable');

    const parentUserId = provisioned.body.parent.id;
    const revoke = await request.patch(`${APP_URLS.nexus}/api/parent/access/${parentUserId}`, {
      headers: { Authorization: `Bearer ${staff!.testToken}` },
      data: { action: 'revoke' },
    });
    test.skip(!revoke.ok(), 'Staff account lacks structure.enrollment.add');

    // The whole point of token_version: without it the parent would keep full
    // access until their 12-hour token happened to expire.
    const after = await request.get(`${APP_URLS.nexus}/api/parent/overview`, {
      headers: { Authorization: `Bearer ${provisioned.body.token}` },
    });
    expect([401, 403]).toContain(after.status());
  });
});

test.describe('Parent portal: mobile layout', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the dashboard fits a 375px screen with no horizontal scroll', async ({ page }) => {
    const ok = await injectParentAuthForPage(page);
    test.skip(!ok, 'Parent auth injection unavailable');

    await page.goto(`${APP_URLS.nexus}/parent/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(overflow, 'the parent dashboard must not scroll horizontally').toBe(false);
  });

  test('the login form is usable one-handed', async ({ page }) => {
    await page.goto(`${APP_URLS.nexus}/parent/login`, { waitUntil: 'domcontentloaded' });

    const button = page.getByRole('button', { name: /^sign in$/i });
    await expect(button).toBeVisible();

    const box = await button.boundingBox();
    // Material 3 minimum touch target. These are parents on mid-range phones.
    expect(box!.height).toBeGreaterThanOrEqual(44);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(overflow).toBe(false);
  });
});
