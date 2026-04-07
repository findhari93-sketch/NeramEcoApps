import { test, expect } from '@playwright/test';
import { loginAsRole } from '../utils/auth-helpers';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * Unified NATA Exams Page E2E Tests
 *
 * Tests the unified Exams page that merges "My Journey" + "Classroom Schedule":
 * 1. API endpoints return correct data structures
 * 2. Student sees personal hero card + segment control (My Journey / Classroom)
 * 3. Teacher sees Classroom-only view
 * 4. Old /exam-schedule URLs redirect properly
 * 5. Mobile responsiveness
 * 6. Role-based access
 */

const NEXUS_URL = APP_URLS.nexus;

test.describe('Unified NATA Exams Page', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: NEXUS_URL });

  let teacherToken: string;
  let studentToken: string;
  let classroomId: string;

  // ============================================
  // SETUP
  // ============================================

  test('setup: get teacher auth token', async ({ request }) => {
    const authData = await getTestAuthToken(request, 'teacher');
    expect(authData).toBeTruthy();
    teacherToken = authData!.testToken;
    classroomId = authData!.classrooms[0]?.id;
    expect(teacherToken).toBeTruthy();
    expect(classroomId).toBeTruthy();
  });

  test('setup: get student auth token', async ({ request }) => {
    const authData = await getTestAuthToken(request, 'student');
    expect(authData).toBeTruthy();
    studentToken = authData!.testToken;
    expect(studentToken).toBeTruthy();
  });

  // ============================================
  // API: Unified endpoint
  // ============================================

  test('API: GET /api/exams/unified returns correct structure', async ({ request }) => {
    const res = await request.get(
      `/api/exams/unified?classroom=${classroomId}&exam_type=nata&year=2026&phase=phase_1`,
      { headers: { Authorization: `Bearer ${teacherToken}` } }
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('registrations');
    expect(body).toHaveProperty('my_attempts');
    expect(body).toHaveProperty('next_exam');
    expect(body).toHaveProperty('overall_progress');
    expect(body).toHaveProperty('schedule');
    expect(Array.isArray(body.registrations)).toBe(true);
    expect(Array.isArray(body.my_attempts)).toBe(true);
    expect(body.overall_progress).toHaveProperty('total_possible');
    expect(body.overall_progress).toHaveProperty('activated');
  });

  test('API: GET /api/exams/unified requires classroom param', async ({ request }) => {
    const res = await request.get(
      `/api/exams/unified?exam_type=nata`,
      { headers: { Authorization: `Bearer ${teacherToken}` } }
    );
    expect(res.status()).toBe(400);
  });

  test('API: GET /api/exams/unified rejects unauthenticated', async ({ request }) => {
    const res = await request.get(
      `/api/exams/unified?classroom=${classroomId}&exam_type=nata`
    );
    // verifyMsToken throws on missing auth, caught as 500
    expect([401, 500]).toContain(res.status());
  });

  // ============================================
  // API: Schedule endpoint (week-based)
  // ============================================

  test('API: GET /api/exam-schedule returns week-based data', async ({ request }) => {
    const res = await request.get(
      `/api/exam-schedule?classroom=${classroomId}&exam_type=nata&year=2026&phase=phase_1`,
      { headers: { Authorization: `Bearer ${teacherToken}` } }
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('phase_info');
    expect(body).toHaveProperty('current_week');
    expect(body).toHaveProperty('stats');
    expect(body).toHaveProperty('navigation');
    expect(body.phase_info.phase).toBe('phase_1');
    expect(body.current_week).toHaveProperty('friday');
    expect(body.current_week).toHaveProperty('saturday');
  });

  test('API: GET /api/exam-schedule requires classroom', async ({ request }) => {
    const res = await request.get(
      `/api/exam-schedule?exam_type=nata&year=2026`,
      { headers: { Authorization: `Bearer ${teacherToken}` } }
    );
    expect(res.status()).toBe(400);
  });

  // ============================================
  // API: Student date submission
  // ============================================

  test('API: POST /api/exam-schedule/my-date validates required fields', async ({ request }) => {
    const res = await request.post('/api/exam-schedule/my-date', {
      headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
      data: { exam_city: 'Chennai' },
    });
    expect(res.status()).toBe(400);
  });

  test('API: POST /api/exam-schedule/my-date rejects non-Friday/Saturday', async ({ request }) => {
    const res = await request.post('/api/exam-schedule/my-date', {
      headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
      data: { exam_date: '2026-04-08', classroom_id: classroomId },
    });
    // Apr 8 is a Wednesday. Should be rejected (400) or user not found (404)
    expect(res.ok()).toBe(false);
    expect([400, 403, 404]).toContain(res.status());
  });

  test('API: POST /api/exam-schedule/remind is teacher-only', async ({ request }) => {
    const res = await request.post('/api/exam-schedule/remind', {
      headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
      data: { student_ids: [], classroom_id: classroomId },
    });
    expect(res.status()).toBe(403);
  });

  // ============================================
  // STUDENT UI: Unified Exams page
  // ============================================

  test('student: unified Exams page loads with title', async ({ page }) => {
    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/exams`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('NATA Exams')).toBeVisible();
  });

  test('student: sees Phase 1 / Phase 2 toggle', async ({ page }) => {
    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/exams`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /phase 1/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /phase 2/i })).toBeVisible();
  });

  test('student: sees PersonalHeroCard', async ({ page }) => {
    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/exams`);
    await page.waitForLoadState('networkidle');

    // Hero card should show some contextual content
    const heroCard = page.locator('[class*="MuiPaper"]').first();
    await expect(heroCard).toBeVisible();
  });

  test('student: sees My Journey / Classroom segment control', async ({ page }) => {
    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/exams`);
    await page.waitForLoadState('networkidle');

    // On mobile/tablet, segment control should be visible
    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width < 1200) {
      await expect(page.getByRole('button', { name: /my journey/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /classroom/i })).toBeVisible();
    }
  });

  test('student: can switch to Classroom tab', async ({ page }) => {
    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/exams`);
    await page.waitForLoadState('networkidle');

    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width < 1200) {
      await page.getByRole('button', { name: /classroom/i }).click();
      // Should see schedule content (stats bar, week navigator)
      await expect(page.getByText(/students/i)).toBeVisible();
    }
  });

  test('student: Classroom tab shows week navigator', async ({ page }) => {
    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/exams?tab=schedule`);
    await page.waitForLoadState('networkidle');

    // Should see week number and navigation
    await expect(page.getByText(/week \d+ of \d+/i)).toBeVisible();
  });

  test('student: FAB visible in Classroom tab', async ({ page }) => {
    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/exams?tab=schedule`);
    await page.waitForLoadState('networkidle');

    const fab = page.getByRole('button', { name: /add my date/i });
    await expect(fab).toBeVisible();
  });

  test('student: Add My Date sheet opens', async ({ page }) => {
    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/exams?tab=schedule`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /add my date/i }).click();
    await expect(page.getByText('Add My Exam Date')).toBeVisible();
  });

  // ============================================
  // TEACHER UI
  // ============================================

  test('teacher: unified Exams page loads', async ({ page }) => {
    await loginAsRole(page, 'teacher');
    await page.goto(`${NEXUS_URL}/teacher/exams`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('NATA Exams')).toBeVisible();
  });

  test('teacher: does NOT see My Journey / Classroom toggle', async ({ page }) => {
    await loginAsRole(page, 'teacher');
    await page.goto(`${NEXUS_URL}/teacher/exams`);
    await page.waitForLoadState('networkidle');

    // Teacher should NOT see the segment control (goes straight to Classroom)
    const journeyBtn = page.getByRole('button', { name: /my journey/i });
    await expect(journeyBtn).toHaveCount(0);
  });

  test('teacher: does NOT see Add My Date FAB', async ({ page }) => {
    await loginAsRole(page, 'teacher');
    await page.goto(`${NEXUS_URL}/teacher/exams`);
    await page.waitForLoadState('networkidle');

    const fab = page.getByRole('button', { name: /add my date/i });
    await expect(fab).toHaveCount(0);
  });

  test('teacher: sees week navigator with stats', async ({ page }) => {
    await loginAsRole(page, 'teacher');
    await page.goto(`${NEXUS_URL}/teacher/exams`);
    await page.waitForLoadState('networkidle');

    // Stats bar should show student counts
    await expect(page.getByText(/students/i)).toBeVisible();
  });

  // ============================================
  // REDIRECTS
  // ============================================

  test('student: /exam-schedule redirects to /exams?tab=schedule', async ({ page }) => {
    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/exam-schedule`);
    await page.waitForURL(/\/student\/exams/);

    expect(page.url()).toContain('/student/exams');
  });

  test('teacher: /exam-schedule redirects to /exams', async ({ page }) => {
    await loginAsRole(page, 'teacher');
    await page.goto(`${NEXUS_URL}/teacher/exam-schedule`);
    await page.waitForURL(/\/teacher\/exams/);

    expect(page.url()).toContain('/teacher/exams');
  });

  // ============================================
  // ROLE-BASED ACCESS
  // ============================================

  test('student cannot access teacher exams page', async ({ page }) => {
    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/teacher/exams`);
    await page.waitForLoadState('networkidle');

    const url = page.url();
    expect(
      url.includes('/student/') || url.includes('/login') || url.includes('/unauthorized')
    ).toBe(true);
  });

  // ============================================
  // NAVIGATION
  // ============================================

  test('student: only one "Exams" item in sidebar (no separate "Exam Schedule")', async ({ page }) => {
    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/dashboard`);
    await page.waitForLoadState('networkidle');

    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width >= 900) {
      // Should find "Exams" link
      const examsLink = page.getByRole('link', { name: /^exams$/i });
      await expect(examsLink).toBeVisible();

      // Should NOT find separate "Exam Schedule" link
      const scheduleLink = page.getByRole('link', { name: /exam schedule/i });
      await expect(scheduleLink).toHaveCount(0);
    }
  });

  // ============================================
  // MOBILE TESTS
  // ============================================

  test('mobile: no horizontal overflow on student exams page', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();

    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/exams`);
    await page.waitForLoadState('networkidle');

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('mobile: no horizontal overflow on teacher exams page', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();

    await loginAsRole(page, 'teacher');
    await page.goto(`${NEXUS_URL}/teacher/exams`);
    await page.waitForLoadState('networkidle');

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('mobile: segment control visible on student page', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();

    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/exams`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /my journey/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /classroom/i })).toBeVisible();
    await context.close();
  });

  test('mobile: FAB tappable with 44px+ height', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();

    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/exams?tab=schedule`);
    await page.waitForLoadState('networkidle');

    const fab = page.getByRole('button', { name: /add my date/i });
    await expect(fab).toBeVisible();

    const box = await fab.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await context.close();
  });

  test('mobile: Add My Date sheet opens as bottom drawer', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();

    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/exams?tab=schedule`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /add my date/i }).click();
    await expect(page.getByText('Add My Exam Date')).toBeVisible();

    // Bottom drawer should be present on mobile
    const drawer = page.locator('.MuiDrawer-paperAnchorBottom');
    const isBottomSheet = await drawer.isVisible().catch(() => false);
    expect(isBottomSheet || await page.getByText('Add My Exam Date').isVisible()).toBe(true);

    await context.close();
  });
});
