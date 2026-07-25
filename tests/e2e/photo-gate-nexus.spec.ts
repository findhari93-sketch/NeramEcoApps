import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Mandatory profile-photo gate E2E.
 *
 * A student with no approved photo cannot open Nexus: /api/auth/me returns 200
 * with photoGate.required, and the UI shows the full-screen PhotoRequiredGate
 * instead of any route. The load-bearing assertion is that a PENDING photo does
 * NOT block, so nobody is locked out waiting for a teacher to wake up.
 *
 * Prerequisites (otherwise self-skips):
 *  - Nexus dev server on :3012
 *  - The photo-approval migration applied (users.photo_status exists)
 *  - The e2e teacher account has user_type 'admin' (needed to flip the flag)
 *
 * Tokens are minted through /api/auth/test-login rather than an interactive
 * sign-in because the tenant enforces MFA on the e2e accounts, which no
 * headless browser can satisfy.
 *
 * Everything is restored in afterAll unconditionally: the student goes back to
 * approved and the feature flag goes back off, so a failure mid-run cannot
 * leave the shared account locked out.
 */

const NEXUS = APP_URLS.nexus;
const FLAG = 'student.photo-gate';
const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

test.describe('Nexus, mandatory profile photo gate', () => {
  test.describe.configure({ mode: 'serial' });

  let studentToken: string;
  let studentId: string;
  let teacherToken: string;
  let ready = false;

  /** Flip the gate flag, preserving every other override. */
  async function setGate(request: any, enabled: boolean): Promise<boolean> {
    const current = await request.get(`${NEXUS}/api/settings?key=feature_flags`);
    const existing = current.ok() ? (await current.json())?.value || {} : {};
    const res = await request.patch(`${NEXUS}/api/settings`, {
      headers: { ...authHeader(teacherToken), 'Content-Type': 'application/json' },
      data: { key: 'feature_flags', value: { ...existing, [FLAG]: enabled } },
    });
    return res.ok();
  }

  /** Move the student to a photo status through the review API. */
  async function setStatus(
    request: any,
    decision: 'approved' | 'rejected' | 'pending',
    reason?: string,
  ): Promise<boolean> {
    const res = await request.post(`${NEXUS}/api/photo-review`, {
      headers: { ...authHeader(teacherToken), 'Content-Type': 'application/json' },
      data: { decisions: [{ studentId, decision, reason }] },
    });
    return res.ok();
  }

  test.beforeAll(async ({ request }) => {
    const studentRes = await request.post(`${NEXUS}/api/auth/test-login`, {
      data: { email: 'e2etestingstudent@neramclasses.com', role: 'student' },
    });
    const teacherRes = await request.post(`${NEXUS}/api/auth/test-login`, {
      data: { email: 'e2etestingteacher@neramclasses.com', role: 'teacher' },
    });
    if (!studentRes.ok() || !teacherRes.ok()) return;

    const studentBody = await studentRes.json();
    studentToken = studentBody.testToken;
    studentId = studentBody.user?.id;
    teacherToken = (await teacherRes.json()).testToken;
    ready = !!(studentToken && studentId && teacherToken);
  });

  test.afterAll(async ({ request }) => {
    if (!ready) return;
    // Unconditional restore. A half-finished run must never leave the shared
    // e2e student blocked or the gate armed for everyone else.
    await setStatus(request, 'approved').catch(() => undefined);
    await setGate(request, false).catch(() => undefined);
  });

  test('setup: the migration and the settings API are available', async ({ request }) => {
    test.skip(!ready, 'Nexus test-login unavailable');

    const me = await request.get(`${NEXUS}/api/auth/me`, { headers: authHeader(studentToken) });
    expect(me.status()).toBe(200);
    const body = await me.json();
    test.skip(!body.photoGate, 'photoGate missing from /api/auth/me: migration not applied');

    const flipped = await setGate(request, false);
    test.skip(!flipped, 'The e2e teacher account cannot write settings (needs user_type admin)');
  });

  test('with the flag off, no student is ever blocked', async ({ request }) => {
    test.skip(!ready);
    await setStatus(request, 'rejected', 'E2E: deliberately rejected');
    await setGate(request, false);

    const me = await request.get(`${NEXUS}/api/auth/me`, { headers: authHeader(studentToken) });
    expect(me.status()).toBe(200);
    expect((await me.json()).photoGate.required).toBe(false);
  });

  test('with the flag on, a rejected photo blocks and carries the reason', async ({ request }) => {
    test.skip(!ready);
    await setStatus(request, 'rejected', 'E2E: face is not clearly visible');
    await setGate(request, true);

    const me = await request.get(`${NEXUS}/api/auth/me`, { headers: authHeader(studentToken) });
    // Still a 200, not a 403: this is a valid enrolled user with one unmet
    // obligation, and the blocker needs a live auth context to upload.
    expect(me.status()).toBe(200);
    const body = await me.json();
    expect(body.photoGate.required).toBe(true);
    expect(body.photoGate.status).toBe('rejected');
    expect(body.photoGate.reason).toContain('face is not clearly visible');
  });

  test('a PENDING photo does NOT block, even with the flag on', async ({ request }) => {
    test.skip(!ready);
    // The load-bearing rule: a student who uploaded at 11pm must not sit locked
    // out until a teacher wakes up.
    await setStatus(request, 'pending');
    await setGate(request, true);

    const me = await request.get(`${NEXUS}/api/auth/me`, { headers: authHeader(studentToken) });
    expect(me.status()).toBe(200);
    const body = await me.json();
    expect(body.photoGate.status).toBe('pending');
    expect(body.photoGate.required).toBe(false);
  });

  test('a teacher approving lifts the block', async ({ request }) => {
    test.skip(!ready);
    await setStatus(request, 'rejected', 'E2E: about to be approved');
    await setGate(request, true);
    let me = await request.get(`${NEXUS}/api/auth/me`, { headers: authHeader(studentToken) });
    expect((await me.json()).photoGate.required).toBe(true);

    expect(await setStatus(request, 'approved')).toBe(true);

    me = await request.get(`${NEXUS}/api/auth/me`, { headers: authHeader(studentToken) });
    const body = await me.json();
    expect(body.photoGate.status).toBe('approved');
    expect(body.photoGate.required).toBe(false);
  });

  test('a teacher is never blocked, whatever their photo status', async ({ request }) => {
    test.skip(!ready);
    await setGate(request, true);
    const me = await request.get(`${NEXUS}/api/auth/me`, { headers: authHeader(teacherToken) });
    expect(me.status()).toBe(200);
    expect((await me.json()).photoGate.required).toBe(false);
  });

  test('mobile: the blocker replaces the dashboard at 375px, with reachable buttons', async ({
    page,
    request,
  }) => {
    test.skip(!ready);
    await setStatus(request, 'rejected', 'E2E: photo is too dark or blurry');
    await setGate(request, true);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${NEXUS}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('nexus_test_token', t), studentToken);
    await page.goto(`${NEXUS}/student/dashboard`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/Your photo needs a change/i)).toBeVisible({ timeout: 15000 });
    // The teacher's reason is what the student is meant to act on.
    await expect(page.getByText(/too dark or blurry/i)).toBeVisible();

    const upload = page.getByRole('button', { name: /add a new photo/i });
    await expect(upload).toBeVisible();
    const signOut = page.getByRole('button', { name: /sign out/i }).last();
    await expect(signOut).toBeVisible();

    // Touch targets stay reachable at 375px.
    for (const target of [upload, signOut]) {
      const box = await target.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    // No horizontal scroll.
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(376);

    // No em dashes in any user-visible text (project content rule).
    const text = await page.evaluate(() => document.body.innerText);
    expect(text).not.toMatch(/—|&mdash;/);
  });
});
