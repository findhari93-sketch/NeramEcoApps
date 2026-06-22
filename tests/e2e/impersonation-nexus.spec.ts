import { test, expect } from '@playwright/test';

/**
 * "View as Student" (impersonation) E2E tests.
 *
 * Verifies the mint endpoint's authorization (the security-critical part) and,
 * when the environment supports it, the full UI flow: a teacher/admin enters
 * student view, sees the persistent banner, and exits back to their own view.
 *
 * Prerequisites for the happy-path UI test (otherwise it self-skips):
 *  - Nexus dev server running (pnpm dev:nexus) on :3012
 *  - IMPERSONATION_JWT_SECRET set in the server env
 *  - The test student has a linked Microsoft account (ms_oid) and shares a
 *    classroom with the test teacher (or the teacher account is an admin)
 *
 * Auth guard tests below are deterministic and do not need the secret.
 */

const BASE_URL = 'http://localhost:3012';
const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

test.describe('Nexus — View as Student (impersonation)', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: BASE_URL });

  let teacherToken: string;
  let studentToken: string;
  let studentId: string;

  test('setup: get teacher and student test tokens', async ({ request }) => {
    const teacherRes = await request.post('/api/auth/test-login', {
      data: { email: 'e2etestingteacher@neramclasses.com', role: 'teacher' },
    });
    expect(teacherRes.status()).toBe(200);
    teacherToken = (await teacherRes.json()).testToken;

    const studentRes = await request.post('/api/auth/test-login', {
      data: { email: 'e2etestingstudent@neramclasses.com', role: 'student' },
    });
    expect(studentRes.status()).toBe(200);
    const studentBody = await studentRes.json();
    studentToken = studentBody.testToken;
    studentId = studentBody.user?.id;

    expect(teacherToken).toBeTruthy();
    expect(studentToken).toBeTruthy();
    expect(studentId).toBeTruthy();
  });

  // ── Authorization guards (deterministic) ──

  test('rejects impersonation with no auth', async ({ request }) => {
    const res = await request.post('/api/auth/impersonate', {
      data: { studentId: studentId || 'x' },
    });
    expect(res.status()).toBe(401);
  });

  test('rejects impersonation without a studentId', async ({ request }) => {
    const res = await request.post('/api/auth/impersonate', {
      headers: authHeader(teacherToken),
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('rejects a student trying to impersonate (not teacher/admin)', async ({ request }) => {
    const res = await request.post('/api/auth/impersonate', {
      headers: authHeader(studentToken),
      data: { studentId },
    });
    expect(res.status()).toBe(403);
  });

  // ── Candidates picker endpoint ──

  test('candidates endpoint rejects unauthenticated requests', async ({ request }) => {
    const res = await request.get('/api/auth/impersonate/candidates');
    expect(res.status()).toBe(401);
  });

  test('candidates endpoint rejects a student', async ({ request }) => {
    const res = await request.get('/api/auth/impersonate/candidates', {
      headers: authHeader(studentToken),
    });
    expect(res.status()).toBe(403);
  });

  test('candidates endpoint returns impersonatable students (all with ms_oid)', async ({ request }) => {
    const res = await request.get('/api/auth/impersonate/candidates', {
      headers: authHeader(teacherToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.students)).toBe(true);
    // Every returned student must have a linked Microsoft account, otherwise the
    // mint endpoint would reject them with 409.
    for (const s of body.students) {
      expect(s.ms_oid).toBeTruthy();
      expect(s.id).toBeTruthy();
    }
  });

  // ── Happy path: full UI flow (guarded) ──

  test('teacher enters student view, sees banner, and exits', async ({ page, request }) => {
    // Probe eligibility first via the API so we can skip cleanly when the env
    // isn't set up for impersonation (missing secret, no ms_oid, no shared class).
    const mintRes = await request.post('/api/auth/impersonate', {
      headers: authHeader(teacherToken),
      data: { studentId, reason: 'E2E test' },
    });

    if (mintRes.status() !== 200) {
      const body = await mintRes.json().catch(() => ({}));
      test.skip(
        true,
        `Impersonation not available in this environment (status ${mintRes.status()}: ${body.error || 'unknown'})`
      );
      return;
    }

    const mint = await mintRes.json();
    expect(mint.token).toMatch(/^imp_/);
    expect(mint.student?.id).toBe(studentId);

    // Seed teacher test-mode auth, then inject the impersonation session and
    // load the student dashboard — the app should "become" the student.
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(
      ({ teacherToken, mint }) => {
        localStorage.setItem('nexus_test_token', teacherToken);
        sessionStorage.setItem(
          'nexus_impersonation',
          JSON.stringify({
            token: mint.token,
            expiresAt: mint.expiresAt,
            impersonatorName: mint.impersonatorName,
            student: mint.student,
          })
        );
      },
      { teacherToken, mint }
    );

    await page.goto(`${BASE_URL}/student/dashboard`, { waitUntil: 'domcontentloaded' });

    // The persistent banner must be visible with the student's name.
    const banner = page.getByRole('status', { name: /viewing the app as/i });
    await expect(banner).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(new RegExp(`Viewing as ${mint.student.name}`, 'i'))).toBeVisible();

    // Regression guard (round 3): entering student view must land on the real
    // student dashboard, not the bare /student route which has no page and 404s.
    expect(page.url()).toContain('/student/dashboard');
    await expect(page.getByText(/this page could not be found/i)).toHaveCount(0);

    // The banner must span the full width at the very top — not be pushed right
    // or hidden behind the fixed sidebar (the bug this round fixed).
    const bannerBox = await banner.boundingBox();
    const viewport = page.viewportSize();
    expect(bannerBox).not.toBeNull();
    expect(bannerBox!.x).toBeLessThanOrEqual(1);
    if (viewport) {
      expect(bannerBox!.width).toBeGreaterThanOrEqual(viewport.width - 1);
    }

    // Exit returns to the teacher view.
    await page.getByRole('button', { name: /exit student view/i }).click();
    await expect(page).toHaveURL(/\/teacher/, { timeout: 15000 });
  });

  // ── Mobile: banner doesn't overflow ──

  test('mobile: banner Exit button is reachable at 375px', async ({ page, request }) => {
    const mintRes = await request.post('/api/auth/impersonate', {
      headers: authHeader(teacherToken),
      data: { studentId, reason: 'E2E mobile test' },
    });
    if (mintRes.status() !== 200) {
      test.skip(true, 'Impersonation not available in this environment');
      return;
    }
    const mint = await mintRes.json();

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(
      ({ teacherToken, mint }) => {
        localStorage.setItem('nexus_test_token', teacherToken);
        sessionStorage.setItem(
          'nexus_impersonation',
          JSON.stringify({
            token: mint.token,
            expiresAt: mint.expiresAt,
            impersonatorName: mint.impersonatorName,
            student: mint.student,
          })
        );
      },
      { teacherToken, mint }
    );
    await page.goto(`${BASE_URL}/student/dashboard`, { waitUntil: 'domcontentloaded' });

    const exitBtn = page.getByRole('button', { name: /exit student view/i });
    await expect(exitBtn).toBeVisible({ timeout: 15000 });
    const box = await exitBtn.boundingBox();
    expect(box).not.toBeNull();
    // Within the 375px viewport and a reasonable tap height.
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    expect(box!.height).toBeGreaterThanOrEqual(36);
  });
});
