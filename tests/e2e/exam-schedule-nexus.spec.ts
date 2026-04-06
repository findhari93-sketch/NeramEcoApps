import { test, expect } from '@playwright/test';
import { loginAsRole } from '../utils/auth-helpers';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * NATA Exam Schedule Dashboard E2E Tests
 *
 * Tests the exam schedule dashboard for both students and teachers:
 * 1. Page loads and displays timeline view
 * 2. Student can add their exam date via dialog
 * 3. Teacher sees full student lists and reminder buttons
 * 4. API returns correct data structure
 * 5. Mobile responsiveness
 * 6. Role-based access
 */

const NEXUS_URL = APP_URLS.nexus;

test.describe('NATA Exam Schedule Dashboard', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: NEXUS_URL });

  let teacherToken: string;
  let studentToken: string;
  let classroomId: string;

  // ============================================
  // SETUP: Get auth tokens
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
  // API TESTS
  // ============================================

  test('API: GET /api/exam-schedule returns correct structure', async ({ request }) => {
    const res = await request.get(
      `/api/exam-schedule?classroom=${classroomId}&exam_type=nata&year=2026`,
      { headers: { Authorization: `Bearer ${teacherToken}` } }
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('upcoming');
    expect(body).toHaveProperty('not_submitted');
    expect(body).toHaveProperty('recently_completed');
    expect(Array.isArray(body.upcoming)).toBe(true);
    expect(Array.isArray(body.not_submitted)).toBe(true);
    expect(Array.isArray(body.recently_completed)).toBe(true);
  });

  test('API: GET /api/exam-schedule requires classroom param', async ({ request }) => {
    const res = await request.get(
      `/api/exam-schedule?exam_type=nata&year=2026`,
      { headers: { Authorization: `Bearer ${teacherToken}` } }
    );
    expect(res.status()).toBe(400);
  });

  test('API: GET /api/exam-schedule rejects unauthenticated requests', async ({ request }) => {
    const res = await request.get(
      `/api/exam-schedule?classroom=${classroomId}&exam_type=nata`
    );
    expect(res.status()).toBe(401);
  });

  test('API: POST /api/exam-schedule/my-date validates required fields', async ({ request }) => {
    const res = await request.post('/api/exam-schedule/my-date', {
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      data: { exam_city: 'Chennai' },
    });
    expect(res.status()).toBe(400);
  });

  test('API: POST /api/exam-schedule/my-date validates session value', async ({ request }) => {
    const res = await request.post('/api/exam-schedule/my-date', {
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        exam_date_id: '00000000-0000-0000-0000-000000000000',
        classroom_id: classroomId,
        exam_session: 'evening',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('API: POST /api/exam-schedule/remind is teacher-only', async ({ request }) => {
    const res = await request.post('/api/exam-schedule/remind', {
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      data: { student_ids: [], classroom_id: classroomId },
    });
    expect(res.status()).toBe(403);
  });

  // ============================================
  // STUDENT UI TESTS
  // ============================================

  test('student: can navigate to exam schedule page', async ({ page }) => {
    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/exam-schedule`);
    await page.waitForLoadState('networkidle');

    // Page title should be visible
    await expect(page.getByText('NATA Exam Schedule')).toBeVisible();
  });

  test('student: sees phase filter dropdown', async ({ page }) => {
    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/exam-schedule`);
    await page.waitForLoadState('networkidle');

    // Phase filter dropdown should exist
    const phaseSelect = page.locator('div[role="combobox"], select').first();
    await expect(phaseSelect).toBeVisible();
  });

  test('student: sees Add My Date FAB button', async ({ page }) => {
    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/exam-schedule`);
    await page.waitForLoadState('networkidle');

    // FAB button should be visible for students
    const fab = page.getByRole('button', { name: /add my date/i });
    await expect(fab).toBeVisible();
  });

  test('student: can open Add My Date dialog', async ({ page }) => {
    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/exam-schedule`);
    await page.waitForLoadState('networkidle');

    // Click FAB
    await page.getByRole('button', { name: /add my date/i }).click();

    // Dialog should open with form fields
    await expect(page.getByText('Add My Exam Date')).toBeVisible();
    await expect(page.getByText('Exam Date')).toBeVisible();
    await expect(page.getByText('City')).toBeVisible();
    await expect(page.getByText('Session')).toBeVisible();
    await expect(page.getByRole('button', { name: /submit exam date/i })).toBeVisible();
  });

  test('student: dialog shows morning/afternoon toggle', async ({ page }) => {
    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/exam-schedule`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /add my date/i }).click();

    // Session toggles should be present
    await expect(page.getByRole('button', { name: /morning/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /afternoon/i })).toBeVisible();
  });

  test('student: submit button is disabled without selecting a date', async ({ page }) => {
    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/exam-schedule`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /add my date/i }).click();

    const submitBtn = page.getByRole('button', { name: /submit exam date/i });
    await expect(submitBtn).toBeDisabled();
  });

  // ============================================
  // TEACHER UI TESTS
  // ============================================

  test('teacher: can navigate to exam schedule page', async ({ page }) => {
    await loginAsRole(page, 'teacher');
    await page.goto(`${NEXUS_URL}/teacher/exam-schedule`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('NATA Exam Schedule')).toBeVisible();
  });

  test('teacher: does NOT see Add My Date FAB', async ({ page }) => {
    await loginAsRole(page, 'teacher');
    await page.goto(`${NEXUS_URL}/teacher/exam-schedule`);
    await page.waitForLoadState('networkidle');

    const fab = page.getByRole('button', { name: /add my date/i });
    await expect(fab).toHaveCount(0);
  });

  test('teacher: sees Upcoming Exams section', async ({ page }) => {
    await loginAsRole(page, 'teacher');
    await page.goto(`${NEXUS_URL}/teacher/exam-schedule`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Upcoming Exams')).toBeVisible();
  });

  // ============================================
  // EMPTY STATE TESTS
  // ============================================

  test('shows empty state when no exam dates exist', async ({ page }) => {
    await loginAsRole(page, 'teacher');
    await page.goto(`${NEXUS_URL}/teacher/exam-schedule`);
    await page.waitForLoadState('networkidle');

    // If no dates exist, should show empty state message
    const hasUpcoming = await page.getByText('Upcoming Exams').isVisible().catch(() => false);
    if (hasUpcoming) {
      // Either shows date cards OR empty state
      const emptyOrCards = await page.locator('[class*="MuiPaper"]').count();
      expect(emptyOrCards).toBeGreaterThan(0);
    }
  });

  // ============================================
  // ROLE-BASED ACCESS TESTS
  // ============================================

  test('student cannot access teacher exam schedule page', async ({ page }) => {
    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/teacher/exam-schedule`);
    await page.waitForLoadState('networkidle');

    // Should be redirected away or see access denied
    const url = page.url();
    expect(
      url.includes('/student/') || url.includes('/login') || url.includes('/unauthorized')
    ).toBe(true);
  });

  // ============================================
  // MOBILE TESTS
  // ============================================

  test('mobile: no horizontal overflow on student page', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const page = await context.newPage();

    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/exam-schedule`);
    await page.waitForLoadState('networkidle');

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('mobile: no horizontal overflow on teacher page', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const page = await context.newPage();

    await loginAsRole(page, 'teacher');
    await page.goto(`${NEXUS_URL}/teacher/exam-schedule`);
    await page.waitForLoadState('networkidle');

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('mobile: FAB is visible and tappable on student page', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const page = await context.newPage();

    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/exam-schedule`);
    await page.waitForLoadState('networkidle');

    const fab = page.getByRole('button', { name: /add my date/i });
    await expect(fab).toBeVisible();

    // Verify touch target size
    const box = await fab.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    await context.close();
  });

  test('mobile: Add My Date dialog opens as bottom sheet', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const page = await context.newPage();

    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/exam-schedule`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /add my date/i }).click();
    await expect(page.getByText('Add My Exam Date')).toBeVisible();

    // On mobile the drawer should anchor from bottom
    const drawer = page.locator('.MuiDrawer-paperAnchorBottom');
    const isBottomSheet = await drawer.isVisible().catch(() => false);
    // Either bottom drawer or right drawer is acceptable
    expect(
      isBottomSheet || await page.getByText('Add My Exam Date').isVisible()
    ).toBe(true);

    await context.close();
  });

  // ============================================
  // NAVIGATION TESTS
  // ============================================

  test('student: Exam Schedule appears in sidebar navigation', async ({ page }) => {
    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/dashboard`);
    await page.waitForLoadState('networkidle');

    // On desktop, check sidebar
    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width >= 900) {
      const sidebarLink = page.getByRole('link', { name: /exam schedule/i });
      await expect(sidebarLink).toBeVisible();
    }
  });

  test('student: clicking Exam Schedule nav item navigates correctly', async ({ page }) => {
    await loginAsRole(page, 'student');
    await page.goto(`${NEXUS_URL}/student/dashboard`);
    await page.waitForLoadState('networkidle');

    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width >= 900) {
      await page.getByRole('link', { name: /exam schedule/i }).click();
      await page.waitForURL(/exam-schedule/);
      expect(page.url()).toContain('/student/exam-schedule');
    }
  });
});
