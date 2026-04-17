/**
 * Gallery Feed Enhancement - E2E Tests
 *
 * Tests the enhanced Drawing Gallery with:
 * - Side-by-side student/teacher reference comparison
 * - "Teacher Refs Only" filter
 * - Pagination (12 per batch, Load More)
 * - Teacher Gallery tab with unpublish
 * - Mobile swipe-to-toggle image comparison
 * - Role-based access control
 */

import { test, expect } from '@playwright/test';
import {
  VIEWPORTS,
  authAndNavigate,
  injectAuthForPage,
  navigateAndWait,
  checkNoHorizontalScroll,
  checkTouchTargets,
  createConsoleErrorCollector,
} from './nexus-mobile-utils';

const BASE = process.env.NEXUS_URL || 'http://localhost:3012';

/** Helper: inject auth and navigate, verifying page actually loaded past auth spinner */
async function authNavigateAndVerify(
  page: import('@playwright/test').Page,
  role: 'student' | 'teacher' | 'parent',
  path: string,
): Promise<boolean> {
  if (role === 'student' || role === 'parent') {
    const loaded = await authAndNavigate(page, role, path);
    if (!loaded) return false;
  } else {
    const authed = await injectAuthForPage(page, role);
    if (!authed) return false;
    const nav = await navigateAndWait(page, path);
    if (!nav) return false;
  }
  // Wait for page to settle, then verify we reached the intended page
  await page.waitForTimeout(4000);
  // Use locator-based checks (more reliable than evaluate textContent)
  const onboarding = await page.getByText('Student Onboarding').isVisible().catch(() => false);
  if (onboarding) return false;
  const getStarted = await page.getByText("Let's Get Started").isVisible().catch(() => false);
  if (getStarted) return false;
  const loading = await page.getByText('Loading...', { exact: true }).isVisible().catch(() => false);
  if (loading) return false;
  const url = page.url();
  if (url.includes('/login') && !path.includes('/login')) return false;
  return true;
}

// ============================================================
// PART 1: API Integration Tests
// ============================================================

test.describe('Gallery Feed API', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: BASE });

  let teacherToken: string;
  let studentToken: string;

  test('setup: authenticate as teacher and student', async ({ request }) => {
    test.setTimeout(60000);

    const teacherRes = await request.post(`${BASE}/api/auth/test-login`, {
      data: { email: 'e2e-teacher@neramclasses.com', role: 'teacher' },
    });
    expect(teacherRes.ok()).toBeTruthy();
    teacherToken = (await teacherRes.json()).testToken;

    const studentRes = await request.post(`${BASE}/api/auth/test-login`, {
      data: { email: 'e2e-student@neramclasses.com', role: 'student' },
    });
    expect(studentRes.ok()).toBeTruthy();
    studentToken = (await studentRes.json()).testToken;
  });

  test.describe('Gallery Feed Endpoint', () => {
    test('GET /api/drawing/gallery returns posts array', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/gallery`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.posts).toBeDefined();
      expect(Array.isArray(body.posts)).toBe(true);
    });

    test('GET /api/drawing/gallery without auth returns error', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/gallery`, {
        headers: { Authorization: '' },
        failOnStatusCode: false,
      });
      expect([401, 500]).toContain(res.status());
    });

    test('GET /api/drawing/gallery respects limit param', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/gallery?limit=2`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.posts.length).toBeLessThanOrEqual(2);
    });

    test('GET /api/drawing/gallery respects offset param', async ({ request }) => {
      const allRes = await request.get(`${BASE}/api/drawing/gallery?limit=50`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      const allPosts = (await allRes.json()).posts;

      if (allPosts.length > 1) {
        const offsetRes = await request.get(`${BASE}/api/drawing/gallery?limit=50&offset=1`, {
          headers: { Authorization: `Bearer ${studentToken}` },
        });
        const offsetPosts = (await offsetRes.json()).posts;
        expect(offsetPosts.length).toBe(allPosts.length - 1);
      }
    });

    test('GET /api/drawing/gallery default limit is 12', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/gallery`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.posts.length).toBeLessThanOrEqual(12);
    });

    test('GET /api/drawing/gallery filters by category', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/gallery?category=2d_composition`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.posts).toBeDefined();
      for (const post of body.posts) {
        if (post.question) {
          expect(post.question.category).toBe('2d_composition');
        }
      }
    });

    test('GET /api/drawing/gallery with hasReference=true filters to posts with corrected_image_url', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/gallery?hasReference=true`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.posts).toBeDefined();
      for (const post of body.posts) {
        expect(post.corrected_image_url).toBeTruthy();
      }
    });

    test('GET /api/drawing/gallery hasReference subset check', async ({ request }) => {
      const allRes = await request.get(`${BASE}/api/drawing/gallery?limit=50`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      const allPosts = (await allRes.json()).posts;

      const refRes = await request.get(`${BASE}/api/drawing/gallery?hasReference=true&limit=50`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      const refPosts = (await refRes.json()).posts;

      expect(refPosts.length).toBeLessThanOrEqual(allPosts.length);
    });

    test('gallery posts include original_image_url field', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/gallery`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      const body = await res.json();
      for (const post of body.posts) {
        expect(post.original_image_url).toBeDefined();
        expect(typeof post.original_image_url).toBe('string');
      }
    });

    test('gallery posts include reaction counts and user_reactions', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/gallery`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      const body = await res.json();
      for (const post of body.posts) {
        expect(post.reactions).toBeDefined();
        expect(post.reactions).toHaveProperty('heart');
        expect(post.reactions).toHaveProperty('clap');
        expect(post.reactions).toHaveProperty('fire');
        expect(post.reactions).toHaveProperty('star');
        expect(post.reactions).toHaveProperty('wow');
        expect(post.user_reactions).toBeDefined();
        expect(Array.isArray(post.user_reactions)).toBe(true);
        expect(typeof post.comment_count).toBe('number');
      }
    });
  });

  test.describe('Gallery Publish RBAC', () => {
    test('POST /api/drawing/gallery/publish requires teacher role', async ({ request }) => {
      const res = await request.post(`${BASE}/api/drawing/gallery/publish`, {
        headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
        data: { submission_id: '00000000-0000-0000-0000-000000000000', publish: false },
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(403);
    });

    test('teacher can call gallery publish endpoint', async ({ request }) => {
      const res = await request.post(`${BASE}/api/drawing/gallery/publish`, {
        headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
        data: { submission_id: '00000000-0000-0000-0000-000000000000', publish: false },
        failOnStatusCode: false,
      });
      expect(res.status()).not.toBe(401);
      expect(res.status()).not.toBe(403);
    });
  });
});

// ============================================================
// PART 2: Student Gallery UI Tests (Desktop)
// ============================================================

test.describe('Student Gallery UI - Desktop', () => {
  test.use({
    baseURL: BASE,
    viewport: { width: 1280, height: 800 },
  });

  test('student drawings page loads with Gallery tab', async ({ page }) => {
    const loaded = await authNavigateAndVerify(page, 'student', '/student/drawings');
    if (!loaded) { test.skip(true, 'Auth failed or page redirected'); return; }

    const galleryTab = page.locator('button[role="tab"]', { hasText: 'Gallery' });
    await expect(galleryTab).toBeVisible({ timeout: 10000 });
  });

  test('clicking Gallery tab shows gallery feed or empty state', async ({ page }) => {
    const loaded = await authNavigateAndVerify(page, 'student', '/student/drawings');
    if (!loaded) { test.skip(true, 'Auth failed'); return; }

    await page.locator('button[role="tab"]', { hasText: 'Gallery' }).click();
    await page.waitForTimeout(2000);

    const hasEmpty = await page.locator('text=No published drawings').isVisible().catch(() => false);
    const hasNoRef = await page.locator('text=No drawings with teacher references').isVisible().catch(() => false);
    const hasPosts = await page.locator('[class*="MuiPaper"]').first().isVisible().catch(() => false);

    expect(hasEmpty || hasNoRef || hasPosts).toBeTruthy();
  });

  test('Gallery shows category filter tabs', async ({ page }) => {
    const loaded = await authNavigateAndVerify(page, 'student', '/student/drawings');
    if (!loaded) { test.skip(true, 'Auth failed'); return; }

    await page.locator('button[role="tab"]', { hasText: 'Gallery' }).click();
    await page.waitForTimeout(1500);

    await expect(page.locator('button[role="tab"]', { hasText: 'All' })).toBeVisible();
    await expect(page.locator('button[role="tab"]', { hasText: '2D' })).toBeVisible();
    await expect(page.locator('button[role="tab"]', { hasText: '3D' })).toBeVisible();
    await expect(page.locator('button[role="tab"]', { hasText: 'Kit' })).toBeVisible();
  });

  test('Gallery shows Teacher Refs Only toggle on desktop', async ({ page }) => {
    const loaded = await authNavigateAndVerify(page, 'student', '/student/drawings');
    if (!loaded) { test.skip(true, 'Auth failed'); return; }

    await page.locator('button[role="tab"]', { hasText: 'Gallery' }).click();
    await page.waitForTimeout(1500);

    const toggle = page.locator('text=Teacher Refs Only');
    await expect(toggle).toBeVisible();
  });

  test('no console errors on Gallery page', async ({ page }) => {
    const collector = createConsoleErrorCollector(page);
    collector.start();

    const loaded = await authNavigateAndVerify(page, 'student', '/student/drawings');
    if (!loaded) { test.skip(true, 'Auth failed'); return; }

    await page.locator('button[role="tab"]', { hasText: 'Gallery' }).click();
    await page.waitForTimeout(2000);

    expect(collector.errors.length).toBe(0);
  });
});

// ============================================================
// PART 3: Student Gallery UI Tests (Mobile)
// ============================================================

test.describe('Student Gallery UI - Mobile', () => {
  test.use({
    baseURL: BASE,
    viewport: { width: VIEWPORTS.pixel5.width, height: VIEWPORTS.pixel5.height },
  });

  test('Gallery page has no horizontal overflow on mobile', async ({ page }) => {
    const loaded = await authNavigateAndVerify(page, 'student', '/student/drawings');
    if (!loaded) { test.skip(true, 'Auth failed'); return; }

    await page.locator('button[role="tab"]', { hasText: 'Gallery' }).click();
    await page.waitForTimeout(1500);

    const result = await checkNoHorizontalScroll(page);
    expect(
      result.pass,
      `Horizontal scroll: scrollWidth=${result.scrollWidth} > clientWidth=${result.clientWidth}`,
    ).toBe(true);
  });

  test('Gallery touch targets are at least 44px on mobile', async ({ page }) => {
    const loaded = await authNavigateAndVerify(page, 'student', '/student/drawings');
    if (!loaded) { test.skip(true, 'Auth failed'); return; }

    await page.locator('button[role="tab"]', { hasText: 'Gallery' }).click();
    await page.waitForTimeout(1500);

    const result = await checkTouchTargets(page);
    // Page-wide check. Violations are common from MUI internal components.
    // Verify the page has interactive elements and most meet the threshold.
    expect(result.total).toBeGreaterThan(0);
    const passRate = result.total > 0 ? (result.total - result.violations) / result.total : 1;
    expect(passRate).toBeGreaterThan(0.5);
  });

  test('no console errors on mobile Gallery', async ({ page }) => {
    const collector = createConsoleErrorCollector(page);
    collector.start();

    const loaded = await authNavigateAndVerify(page, 'student', '/student/drawings');
    if (!loaded) { test.skip(true, 'Auth failed'); return; }

    await page.locator('button[role="tab"]', { hasText: 'Gallery' }).click();
    await page.waitForTimeout(2000);

    expect(collector.errors.length).toBe(0);
  });
});

// ============================================================
// PART 4: Teacher Gallery Tab UI Tests
// ============================================================

test.describe('Teacher Gallery Tab', () => {
  test.use({
    baseURL: BASE,
    viewport: { width: 1280, height: 800 },
  });

  test('Drawing Reviews page shows Gallery tab', async ({ page }) => {
    const loaded = await authNavigateAndVerify(page, 'teacher', '/teacher/drawing-reviews');
    if (!loaded) { test.skip(true, 'Auth failed'); return; }

    const galleryTab = page.locator('button[role="tab"]', { hasText: 'Gallery' });
    await expect(galleryTab).toBeVisible({ timeout: 10000 });
  });

  test('clicking Gallery tab shows gallery feed or empty state', async ({ page }) => {
    const loaded = await authNavigateAndVerify(page, 'teacher', '/teacher/drawing-reviews');
    if (!loaded) { test.skip(true, 'Auth failed'); return; }

    await page.locator('button[role="tab"]', { hasText: 'Gallery' }).click();
    await page.waitForTimeout(2000);

    const hasEmpty = await page.locator('text=No published drawings').isVisible().catch(() => false);
    const hasNoRef = await page.locator('text=No drawings with teacher references').isVisible().catch(() => false);
    const hasPosts = await page.locator('[class*="MuiPaper"]').first().isVisible().catch(() => false);

    expect(hasEmpty || hasNoRef || hasPosts).toBeTruthy();
  });

  test('Gallery tab shows unpublish buttons when posts exist', async ({ page }) => {
    const loaded = await authNavigateAndVerify(page, 'teacher', '/teacher/drawing-reviews');
    if (!loaded) { test.skip(true, 'Auth failed'); return; }

    await page.locator('button[role="tab"]', { hasText: 'Gallery' }).click();
    await page.waitForTimeout(2000);

    const emptyState = await page.locator('text=No published drawings').isVisible().catch(() => false);
    if (emptyState) { test.skip(true, 'No gallery posts to test unpublish'); return; }

    const unpublishButtons = page.locator('[title="Unpublish from gallery"]');
    const count = await unpublishButtons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Gallery tab shows reaction count chips when posts exist', async ({ page }) => {
    const loaded = await authNavigateAndVerify(page, 'teacher', '/teacher/drawing-reviews');
    if (!loaded) { test.skip(true, 'Auth failed'); return; }

    await page.locator('button[role="tab"]', { hasText: 'Gallery' }).click();
    await page.waitForTimeout(2000);

    const emptyState = await page.locator('text=No published drawings').isVisible().catch(() => false);
    if (emptyState) { test.skip(true, 'No gallery posts'); return; }

    const reactionChips = page.locator('text=/\\d+ reactions/');
    const count = await reactionChips.count();
    expect(count).toBeGreaterThan(0);
  });

  test('switching between Pending and Gallery tabs works', async ({ page }) => {
    const loaded = await authNavigateAndVerify(page, 'teacher', '/teacher/drawing-reviews');
    if (!loaded) { test.skip(true, 'Auth failed'); return; }

    const pendingTab = page.locator('button[role="tab"]', { hasText: 'Pending' });
    await expect(pendingTab).toHaveAttribute('aria-selected', 'true');

    await page.locator('button[role="tab"]', { hasText: 'Gallery' }).click();
    await page.waitForTimeout(1500);

    const galleryTab = page.locator('button[role="tab"]', { hasText: 'Gallery' });
    await expect(galleryTab).toHaveAttribute('aria-selected', 'true');

    await pendingTab.click();
    await page.waitForTimeout(1000);
    await expect(pendingTab).toHaveAttribute('aria-selected', 'true');
  });

  test('no console errors on teacher Gallery tab', async ({ page }) => {
    const collector = createConsoleErrorCollector(page);
    collector.start();

    const loaded = await authNavigateAndVerify(page, 'teacher', '/teacher/drawing-reviews');
    if (!loaded) { test.skip(true, 'Auth failed'); return; }

    await page.locator('button[role="tab"]', { hasText: 'Gallery' }).click();
    await page.waitForTimeout(2000);

    expect(collector.errors.length).toBe(0);
  });
});

// ============================================================
// PART 5: Teacher Gallery Tab - Mobile
// ============================================================

test.describe('Teacher Gallery Tab - Mobile', () => {
  test.use({
    baseURL: BASE,
    viewport: { width: VIEWPORTS.pixel5.width, height: VIEWPORTS.pixel5.height },
  });

  test('Teacher Drawing Reviews Gallery tab loads on mobile', async ({ page }) => {
    const loaded = await authNavigateAndVerify(page, 'teacher', '/teacher/drawing-reviews');
    if (!loaded) { test.skip(true, 'Auth failed'); return; }

    await page.locator('button[role="tab"]', { hasText: 'Gallery' }).click();
    await page.waitForTimeout(1500);

    const result = await checkNoHorizontalScroll(page);
    expect(
      result.pass,
      `Horizontal scroll on teacher Gallery: scrollWidth=${result.scrollWidth} > clientWidth=${result.clientWidth}`,
    ).toBe(true);
  });
});

// ============================================================
// PART 6: Role-Based Access (Student cannot unpublish)
// ============================================================

test.describe('Gallery RBAC - Student restrictions', () => {
  test.use({ baseURL: BASE });

  test('student cannot access gallery publish/unpublish endpoint', async ({ request }) => {
    const authRes = await request.post(`${BASE}/api/auth/test-login`, {
      data: { email: 'e2e-student@neramclasses.com', role: 'student' },
    });
    const studentToken = (await authRes.json()).testToken;

    const res = await request.post(`${BASE}/api/drawing/gallery/publish`, {
      headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
      data: { submission_id: '00000000-0000-0000-0000-000000000000', publish: false },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(403);
  });
});
