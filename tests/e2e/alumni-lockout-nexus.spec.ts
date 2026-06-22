import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Alumni lockout E2E.
 *
 * A graduated student (is_alumni=true) is fully locked out of Nexus: /api/auth/me
 * returns 403 { error: 'alumni' } and the UI shows the celebratory "you've
 * graduated" screen. A current student is unaffected.
 *
 * Prerequisites (otherwise self-skips):
 *  - Nexus dev server on :3012 and Admin dev server on :3013
 *  - The alumni migration applied (users.is_alumni column exists)
 *
 * The happy path graduates the shared e2e student then restores them. Note that
 * restore does NOT re-activate their classroom enrollment by design, so run this
 * in isolation if other nexus student specs depend on that enrollment.
 */

const NEXUS = APP_URLS.nexus;
const ADMIN = APP_URLS.admin;
const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

test.describe('Nexus — alumni lockout', () => {
  test.describe.configure({ mode: 'serial' });

  let studentToken: string;
  let studentId: string;
  let adminId: string;

  test('setup: get student and admin (teacher) ids', async ({ request }) => {
    const studentRes = await request.post(`${NEXUS}/api/auth/test-login`, {
      data: { email: 'e2etestingstudent@neramclasses.com', role: 'student' },
    });
    expect(studentRes.status()).toBe(200);
    const studentBody = await studentRes.json();
    studentToken = studentBody.testToken;
    studentId = studentBody.user?.id;

    const teacherRes = await request.post(`${NEXUS}/api/auth/test-login`, {
      data: { email: 'e2etestingteacher@neramclasses.com', role: 'teacher' },
    });
    expect(teacherRes.status()).toBe(200);
    adminId = (await teacherRes.json()).user?.id;

    expect(studentToken).toBeTruthy();
    expect(studentId).toBeTruthy();
    expect(adminId).toBeTruthy();
  });

  test('a current (non-alumni) student is allowed through /api/auth/me', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/auth/me`, { headers: authHeader(studentToken) });
    // Active students get 200; a 403 alumni here means a previous run left them graduated.
    if (res.status() === 403) {
      const body = await res.json().catch(() => ({}));
      test.skip(body.error === 'alumni', 'Test student is currently graduated; restore them first.');
    }
    expect(res.status()).toBe(200);
  });

  test('a graduated student is locked out (403 alumni) and sees the graduated screen', async ({ page, request }) => {
    // Graduate the student via the admin API. Self-skip if unavailable (admin
    // server down or migration not yet applied).
    const gradRes = await request.post(`${ADMIN}/api/crm/alumni/graduate`, {
      data: { userIds: [studentId], academicYear: '2025-26', adminId, reason: 'E2E lockout test' },
    });
    if (gradRes.status() !== 200) {
      const body = await gradRes.json().catch(() => ({}));
      test.skip(true, `Graduate API unavailable (status ${gradRes.status()}: ${body.error || 'unknown'})`);
      return;
    }

    try {
      // API: /api/auth/me now blocks the alumnus.
      const meRes = await request.get(`${NEXUS}/api/auth/me`, { headers: authHeader(studentToken) });
      expect(meRes.status()).toBe(403);
      const meBody = await meRes.json();
      expect(meBody.error).toBe('alumni');

      // UI: the central AlumniGate shows the celebratory screen.
      await page.goto(`${NEXUS}/login`, { waitUntil: 'domcontentloaded' });
      await page.evaluate((t) => localStorage.setItem('nexus_test_token', t), studentToken);
      await page.goto(`${NEXUS}/student/dashboard`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByText(/Congratulations/i)).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(/now a Neram alumnus/i)).toBeVisible();
      // No classroom content for the alumnus.
      await expect(page.getByRole('button', { name: /sign out/i }).first()).toBeVisible();
    } finally {
      // Cleanup: restore the student so reruns and other specs see them active.
      await request.post(`${ADMIN}/api/crm/alumni/restore`, {
        data: { userIds: [studentId], adminId },
      });
    }
  });

  test('mobile: graduated screen has no horizontal overflow at 375px', async ({ page, request }) => {
    const gradRes = await request.post(`${ADMIN}/api/crm/alumni/graduate`, {
      data: { userIds: [studentId], academicYear: '2025-26', adminId, reason: 'E2E mobile' },
    });
    if (gradRes.status() !== 200) {
      test.skip(true, 'Graduate API unavailable');
      return;
    }
    try {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`${NEXUS}/login`, { waitUntil: 'domcontentloaded' });
      await page.evaluate((t) => localStorage.setItem('nexus_test_token', t), studentToken);
      await page.goto(`${NEXUS}/student/dashboard`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByText(/Congratulations/i)).toBeVisible({ timeout: 15000 });
      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollW).toBeLessThanOrEqual(375 + 1);
    } finally {
      await request.post(`${ADMIN}/api/crm/alumni/restore`, {
        data: { userIds: [studentId], adminId },
      });
    }
  });
});
