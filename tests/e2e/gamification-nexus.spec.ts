import { test, expect } from '@playwright/test';
import path from 'path';

/**
 * Nexus Gamification & Leaderboard E2E Tests
 *
 * Tests all gamification API endpoints + basic UI smoke tests:
 * - Leaderboard API (weekly, monthly, alltime)
 * - Badge API (catalog, my, feed)
 * - Dashboard gamification widget
 * - Profile API (me, by studentId)
 * - Notification API (unread, mark-read)
 * - Points award API
 * - Leaderboard page UI (student + teacher)
 */

const NEXUS_TEACHER_AUTH = path.join(__dirname, '../.auth/teacher.json');

let testToken: string;
let classroomId: string;
let userId: string;

test.describe('Nexus Gamification API', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3012' });

  // ===========================================================================
  // Section 1: Auth Setup
  // ===========================================================================

  test('setup: get teacher auth token and classroom', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-gamification@neramclasses.com', role: 'teacher' },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    testToken = body.testToken;
    classroomId = body.classrooms[0]?.id;
    userId = body.user?.id;

    expect(testToken).toBeDefined();
    expect(testToken).toMatch(/^test_/);
    expect(classroomId).toBeDefined();
    expect(userId).toBeDefined();
  });

  // ===========================================================================
  // Section 2: Leaderboard API Tests
  // ===========================================================================

  test('GET /api/gamification/leaderboard without auth should return 401', async ({ request }) => {
    const res = await request.get(
      `/api/gamification/leaderboard?period=weekly&classroom_id=${classroomId}`,
      {
        headers: { Authorization: '' },
        failOnStatusCode: false,
      },
    );
    expect(res.status()).toBe(401);
  });

  test('GET /api/gamification/leaderboard with valid token should return leaderboard', async ({ request }) => {
    const res = await request.get(
      `/api/gamification/leaderboard?period=weekly&classroom_id=${classroomId}`,
      {
        headers: { Authorization: `Bearer ${testToken}` },
      },
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.entries).toBeDefined();
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.period).toBe('weekly');
  });

  test('GET /api/gamification/leaderboard monthly period works', async ({ request }) => {
    const res = await request.get(
      `/api/gamification/leaderboard?period=monthly&classroom_id=${classroomId}`,
      {
        headers: { Authorization: `Bearer ${testToken}` },
      },
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.entries).toBeDefined();
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.period).toBe('monthly');
  });

  test('GET /api/gamification/leaderboard alltime period works', async ({ request }) => {
    const res = await request.get(
      `/api/gamification/leaderboard?period=alltime&classroom_id=${classroomId}`,
      {
        headers: { Authorization: `Bearer ${testToken}` },
      },
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.entries).toBeDefined();
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.period).toBe('alltime');
  });

  test('GET /api/gamification/leaderboard requires classroom_id', async ({ request }) => {
    const res = await request.get(
      '/api/gamification/leaderboard?period=weekly',
      {
        headers: { Authorization: `Bearer ${testToken}` },
        failOnStatusCode: false,
      },
    );
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.error).toContain('classroom_id');
  });

  // ===========================================================================
  // Section 3: Badge API Tests
  // ===========================================================================

  test('GET /api/gamification/badges/catalog returns all badges', async ({ request }) => {
    const res = await request.get('/api/gamification/badges/catalog', {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.catalog).toBeDefined();
    expect(Array.isArray(body.catalog)).toBe(true);

    // Each badge in catalog should have required fields
    if (body.catalog.length > 0) {
      const badge = body.catalog[0];
      expect(badge.id).toBeDefined();
      expect(badge.display_name).toBeDefined();
      expect(badge.rarity_tier).toBeDefined();
      expect(typeof badge.earned).toBe('boolean');
    }
  });

  test('GET /api/gamification/badges/catalog grouped has 4 categories', async ({ request }) => {
    const res = await request.get('/api/gamification/badges/catalog', {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.grouped).toBeDefined();
    expect(body.grouped.attendance).toBeDefined();
    expect(Array.isArray(body.grouped.attendance)).toBe(true);
    expect(body.grouped.checklist).toBeDefined();
    expect(Array.isArray(body.grouped.checklist)).toBe(true);
    expect(body.grouped.growth).toBeDefined();
    expect(Array.isArray(body.grouped.growth)).toBe(true);
    expect(body.grouped.leaderboard).toBeDefined();
    expect(Array.isArray(body.grouped.leaderboard)).toBe(true);
  });

  test('GET /api/gamification/badges/my returns earned badges', async ({ request }) => {
    const res = await request.get('/api/gamification/badges/my', {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.earned).toBeDefined();
    expect(Array.isArray(body.earned)).toBe(true);
    expect(typeof body.totalEarned).toBe('number');
    expect(typeof body.totalAvailable).toBe('number');
    expect(body.totalEarned).toBeLessThanOrEqual(body.totalAvailable);
  });

  test('GET /api/gamification/badges/feed returns recent badges', async ({ request }) => {
    const res = await request.get(
      `/api/gamification/badges/feed?classroom_id=${classroomId}`,
      {
        headers: { Authorization: `Bearer ${testToken}` },
      },
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.feed).toBeDefined();
    expect(Array.isArray(body.feed)).toBe(true);
  });

  // ===========================================================================
  // Section 4: Dashboard API Tests
  // ===========================================================================

  test('GET /api/gamification/dashboard returns widget data', async ({ request }) => {
    const res = await request.get(
      `/api/gamification/dashboard?classroom_id=${classroomId}`,
      {
        headers: { Authorization: `Bearer ${testToken}` },
      },
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.top3).toBeDefined();
    expect(Array.isArray(body.top3)).toBe(true);
    expect(body.top3.length).toBeLessThanOrEqual(3);
    expect(body.myRank).toBeDefined();
    expect(typeof body.totalStudents).toBe('number');
    expect(body.recentBadges).toBeDefined();
    expect(body.weekLabel).toBeDefined();
  });

  test('GET /api/gamification/dashboard without classroom_id returns 400', async ({ request }) => {
    const res = await request.get('/api/gamification/dashboard', {
      headers: { Authorization: `Bearer ${testToken}` },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.error).toContain('classroom_id');
  });

  // ===========================================================================
  // Section 5: Profile API Tests
  // ===========================================================================

  test('GET /api/gamification/profile/me returns self profile', async ({ request }) => {
    const res = await request.get('/api/gamification/profile/me', {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.student_name).toBeDefined();
    expect(body.badges).toBeDefined();
    expect(Array.isArray(body.badges)).toBe(true);
    expect(typeof body.streak).toBeDefined();
    expect(typeof body.attendance_pct).toBe('number');
    expect(body.recent_activity).toBeDefined();
    expect(Array.isArray(body.recent_activity)).toBe(true);
    expect(body.attendance_heatmap).toBeDefined();
    expect(Array.isArray(body.attendance_heatmap)).toBe(true);
  });

  test('GET /api/gamification/profile/{studentId} returns profile', async ({ request }) => {
    const res = await request.get(`/api/gamification/profile/${userId}`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.student_id).toBe(userId);
    expect(body.student_name).toBeDefined();
    expect(body.badges).toBeDefined();
    expect(Array.isArray(body.badges)).toBe(true);
    expect(typeof body.streak).toBeDefined();
    expect(typeof body.attendance_pct).toBe('number');
    expect(body.recent_activity).toBeDefined();
    expect(Array.isArray(body.recent_activity)).toBe(true);
    expect(body.attendance_heatmap).toBeDefined();
    expect(Array.isArray(body.attendance_heatmap)).toBe(true);
  });

  // ===========================================================================
  // Section 6: Notification API Tests
  // ===========================================================================

  test('GET /api/gamification/notifications/unread returns array', async ({ request }) => {
    const res = await request.get('/api/gamification/notifications/unread', {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.badges).toBeDefined();
    expect(Array.isArray(body.badges)).toBe(true);
  });

  test('POST /api/gamification/notifications/mark-read requires badge_ids', async ({ request }) => {
    const res = await request.post('/api/gamification/notifications/mark-read', {
      headers: { Authorization: `Bearer ${testToken}` },
      data: {},
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.error).toContain('badge_ids');
  });

  // ===========================================================================
  // Section 7: Points Award API Tests
  // ===========================================================================

  test('POST /api/gamification/points/award without auth returns 401/403', async ({ request }) => {
    const res = await request.post('/api/gamification/points/award', {
      headers: { Authorization: '' },
      data: {
        student_id: userId,
        classroom_id: classroomId,
        points: 5,
        reason: 'E2E test - no auth',
      },
      failOnStatusCode: false,
    });
    // Should be 401 (unauthenticated) or 403 (forbidden)
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/gamification/points/award with valid data succeeds', async ({ request }) => {
    const res = await request.post('/api/gamification/points/award', {
      headers: { Authorization: `Bearer ${testToken}` },
      data: {
        student_id: userId,
        classroom_id: classroomId,
        points: 5,
        reason: 'E2E test award',
      },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.points_awarded).toBe(5);
  });

  test('POST /api/gamification/points/award rejects points > 20', async ({ request }) => {
    const res = await request.post('/api/gamification/points/award', {
      headers: { Authorization: `Bearer ${testToken}` },
      data: {
        student_id: userId,
        classroom_id: classroomId,
        points: 25,
        reason: 'E2E test - over limit',
      },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test('POST /api/gamification/points/award requires all fields', async ({ request }) => {
    const res = await request.post('/api/gamification/points/award', {
      headers: { Authorization: `Bearer ${testToken}` },
      data: {
        student_id: userId,
        classroom_id: classroomId,
        points: 5,
        // reason intentionally omitted
      },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.error).toContain('reason');
  });
});

// =============================================================================
// Section 8: Leaderboard UI Tests
// =============================================================================

test.describe('Nexus Leaderboard UI', () => {
  test.use({
    baseURL: 'http://localhost:3012',
    storageState: NEXUS_TEACHER_AUTH,
  });

  test('student leaderboard page loads', async ({ page }) => {
    await page.goto('/student/leaderboard', { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for the page to finish loading
    try {
      await page.waitForFunction(
        () => {
          const body = document.body.textContent || '';
          const isLoading = body.trim() === 'Loading...' || body.trim() === 'Authenticating...';
          return !isLoading;
        },
        { timeout: 15000 },
      );
    } catch {
      // Continue even if loading doesn't finish
    }
    await page.waitForTimeout(1000);

    // Check for period tabs (Weekly, Monthly, All-Time)
    const pageContent = await page.textContent('body');
    const hasWeekly = pageContent?.includes('Weekly') || pageContent?.includes('weekly');
    const hasMonthly = pageContent?.includes('Monthly') || pageContent?.includes('monthly');
    const hasAllTime =
      pageContent?.includes('All-Time') ||
      pageContent?.includes('All Time') ||
      pageContent?.includes('alltime');

    expect(hasWeekly || hasMonthly || hasAllTime).toBe(true);
  });

  test('teacher leaderboard page loads', async ({ page }) => {
    await page.goto('/teacher/leaderboard', { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for the page to finish loading
    try {
      await page.waitForFunction(
        () => {
          const body = document.body.textContent || '';
          const isLoading = body.trim() === 'Loading...' || body.trim() === 'Authenticating...';
          return !isLoading;
        },
        { timeout: 15000 },
      );
    } catch {
      // Continue even if loading doesn't finish
    }
    await page.waitForTimeout(1000);

    // The teacher leaderboard page should be accessible
    const url = page.url();
    expect(url).not.toContain('/login');

    const pageContent = await page.textContent('body');
    const hasLeaderboardContent =
      pageContent?.includes('Weekly') ||
      pageContent?.includes('Leaderboard') ||
      pageContent?.includes('leaderboard');
    expect(hasLeaderboardContent).toBe(true);
  });

  test('leaderboard shows in student sidebar navigation', async ({ page }) => {
    await page.goto('/student/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });

    try {
      await page.waitForFunction(
        () => {
          const body = document.body.textContent || '';
          const isLoading = body.trim() === 'Loading...' || body.trim() === 'Authenticating...';
          return !isLoading;
        },
        { timeout: 15000 },
      );
    } catch {
      // Continue
    }
    await page.waitForTimeout(1000);

    // Look for a Leaderboard navigation link
    const leaderboardLink = page.locator('a[href*="leaderboard"], [role="button"]:has-text("Leaderboard")');
    const bottomNavLink = page.locator('.MuiBottomNavigation-root a[href*="leaderboard"], .MuiBottomNavigationAction-root:has-text("Leaderboard")');

    const hasLeaderboardNav =
      (await leaderboardLink.count()) > 0 || (await bottomNavLink.count()) > 0;

    // It's acceptable if the link exists in the nav or bottom nav or drawer
    // Check page text as a fallback
    if (!hasLeaderboardNav) {
      const pageContent = await page.textContent('body');
      expect(pageContent).toContain('Leaderboard');
    }
  });

  test('leaderboard shows in teacher sidebar navigation', async ({ page }) => {
    await page.goto('/teacher/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });

    try {
      await page.waitForFunction(
        () => {
          const body = document.body.textContent || '';
          const isLoading = body.trim() === 'Loading...' || body.trim() === 'Authenticating...';
          return !isLoading;
        },
        { timeout: 15000 },
      );
    } catch {
      // Continue
    }
    await page.waitForTimeout(1000);

    // Look for a Leaderboard navigation link in PanelProvider / sidebar / bottom nav
    const leaderboardLink = page.locator('a[href*="leaderboard"], [role="button"]:has-text("Leaderboard")');
    const bottomNavLink = page.locator('.MuiBottomNavigation-root a[href*="leaderboard"], .MuiBottomNavigationAction-root:has-text("Leaderboard")');

    const hasLeaderboardNav =
      (await leaderboardLink.count()) > 0 || (await bottomNavLink.count()) > 0;

    if (!hasLeaderboardNav) {
      const pageContent = await page.textContent('body');
      expect(pageContent).toContain('Leaderboard');
    }
  });
});
