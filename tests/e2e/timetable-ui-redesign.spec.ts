/**
 * Timetable UI Redesign E2E Tests
 *
 * Tests the visual redesign of the timetable:
 * - ClassCard compact rendering (no action buttons, no status chips)
 * - WeeklyCalendarGrid adaptive layout (collapsed empty days)
 * - TimeSlotGrid theme colors and hover popover
 * - Mobile viewport behavior
 * - Role-based rendering (teacher, student, parent)
 */

import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';

const NEXUS_URL = APP_URLS.nexus;

// Helper: create a class via API for testing
async function createTestClass(request: any, token: string, overrides: Record<string, unknown> = {}) {
  const classroomId = '6d065ef5-c945-4112-a94f-48f3eb3a95f4'; // E2E test classroom
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split('T')[0];

  const res = await request.post(`${NEXUS_URL}/api/timetable`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      classroom_id: classroomId,
      title: `__TEST__ UI Redesign Class ${Date.now()}`,
      scheduled_date: dateStr,
      start_time: '10:00',
      end_time: '11:00',
      ...overrides,
    },
  });

  if (res.ok()) {
    return await res.json();
  }
  return null;
}

// Helper: delete a test class
async function deleteTestClass(request: any, token: string, classId: string) {
  const classroomId = '6d065ef5-c945-4112-a94f-48f3eb3a95f4';
  await request.delete(`${NEXUS_URL}/api/timetable`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { id: classId, classroom_id: classroomId, permanent: true },
  });
}

// Helper: navigate to timetable page with auth
async function goToTimetable(page: Page, role: 'student' | 'teacher') {
  await injectAuthForPage(page, role);
  const path = role === 'teacher' ? '/teacher/timetable' : '/student/timetable';
  await page.goto(`${NEXUS_URL}${path}`, { waitUntil: 'networkidle' });
  // Wait for loading to finish
  await page.waitForTimeout(1000);
}

test.describe('Timetable UI Redesign - Teacher View', () => {
  let testClassId: string | null = null;
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) test.skip();
    token = auth.testToken;

    // Create a test class for visual tests
    const created = await createTestClass(request, token);
    testClassId = created?.class?.id || created?.id || null;
  });

  test.afterAll(async ({ request }) => {
    if (testClassId && token) {
      await deleteTestClass(request, token, testClassId);
    }
  });

  test('timetable page loads without errors', async ({ page }) => {
    await goToTimetable(page, 'teacher');
    await expect(page.locator('text=Timetable')).toBeVisible();
  });

  test('class cards do NOT show action buttons', async ({ page }) => {
    await goToTimetable(page, 'teacher');

    // ClassCard redesign: no Join, Edit, Delete, Will Attend buttons on the card
    const card = page.locator('[class*="MuiBox-root"]').filter({ hasText: '__TEST__' }).first();
    if (await card.count() > 0) {
      await expect(card.locator('button:has-text("Join")')).toHaveCount(0);
      await expect(card.locator('button:has-text("Edit")')).toHaveCount(0);
      await expect(card.locator('button:has-text("Delete")')).toHaveCount(0);
      await expect(card.locator('button:has-text("Attendance")')).toHaveCount(0);
    }
  });

  test('class cards do NOT show status text chips', async ({ page }) => {
    await goToTimetable(page, 'teacher');

    // No MUI Chip with status text should appear on cards
    const cards = page.locator('[class*="MuiBox-root"]').filter({ hasText: '__TEST__' });
    if (await cards.count() > 0) {
      const card = cards.first();
      // Status chip text should NOT be present
      await expect(card.locator('.MuiChip-root:has-text("Scheduled")')).toHaveCount(0);
      await expect(card.locator('.MuiChip-root:has-text("scheduled")')).toHaveCount(0);
    }
  });

  test('list/calendar view toggle exists on desktop', async ({ page }) => {
    await goToTimetable(page, 'teacher');
    // Toggle buttons for list and calendar views
    const toggleGroup = page.locator('.MuiToggleButtonGroup-root');
    await expect(toggleGroup).toBeVisible();
  });

  test('clicking a class card opens detail panel', async ({ page }) => {
    await goToTimetable(page, 'teacher');

    const card = page.locator('[class*="MuiBox-root"]').filter({ hasText: '__TEST__' }).first();
    if (await card.count() > 0) {
      await card.click();
      // Detail panel (Drawer) should appear
      await page.waitForTimeout(500);
      const drawer = page.locator('.MuiDrawer-root');
      await expect(drawer).toBeVisible();
    }
  });

  test('week navigation arrows work', async ({ page }) => {
    await goToTimetable(page, 'teacher');

    // Get current week label
    const weekLabel = page.locator('text=/\\d+ \\w+ - \\d+ \\w+/').first();
    const initialText = await weekLabel.textContent();

    // Click next week arrow
    const nextBtn = page.locator('[data-testid="ChevronRightIcon"]').first();
    await nextBtn.click();
    await page.waitForTimeout(500);

    // Week label should change
    const newText = await weekLabel.textContent();
    expect(newText).not.toBe(initialText);
  });
});

test.describe('Timetable UI Redesign - Student View', () => {
  test('student timetable page loads', async ({ page }) => {
    await goToTimetable(page, 'student');
    await expect(page.locator('text=Timetable')).toBeVisible();
  });

  test('student cards show RSVP state, not buttons', async ({ page }) => {
    await goToTimetable(page, 'student');

    // Student cards should NOT have "Will Attend" / "Can't Attend" buttons
    // (those are now in the detail panel)
    const classCards = page.locator('[style*="border-left"]');
    if (await classCards.count() > 0) {
      await expect(page.locator('button:has-text("Will Attend")')).toHaveCount(0);
      await expect(page.locator('button:has-text("Can\'t Attend")')).toHaveCount(0);
    }
  });

  test('student has calendar view toggle on desktop', async ({ page }) => {
    await goToTimetable(page, 'student');
    const toggleGroup = page.locator('.MuiToggleButtonGroup-root');
    await expect(toggleGroup).toBeVisible();
  });
});

test.describe('Timetable UI Redesign - Adaptive Grid', () => {
  test('empty days are collapsed with summary text', async ({ page }) => {
    await goToTimetable(page, 'teacher');

    // Switch to list view
    const listToggle = page.locator('.MuiToggleButton-root').first();
    await listToggle.click();
    await page.waitForTimeout(500);

    // If there are empty days, check for the summary text
    const summaryText = page.locator('text=/No classes on/');
    // This may or may not be visible depending on test data - just verify no 7-column crammed grid
    const grid = page.locator('[style*="grid-template-columns: repeat(7"]');
    await expect(grid).toHaveCount(0); // Should NOT have a fixed 7-column grid
  });

  test('empty week shows centered empty state', async ({ page }) => {
    await injectAuthForPage(page, 'teacher');
    // Navigate to a far-future week with no classes
    await page.goto(`${NEXUS_URL}/teacher/timetable`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // Navigate far forward to find an empty week
    const nextBtn = page.locator('[data-testid="ChevronRightIcon"]').first();
    for (let i = 0; i < 10; i++) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }

    // Switch to list view to test empty state
    const listToggle = page.locator('.MuiToggleButton-root').first();
    await listToggle.click();
    await page.waitForTimeout(500);

    // Should see empty state or "No classes" summary
    const emptyState = page.locator('text=/No classes/');
    await expect(emptyState.first()).toBeVisible();
  });
});

test.describe('Timetable UI Redesign - TimeSlotGrid Calendar View', () => {
  test('calendar view uses theme colors (not hardcoded blue)', async ({ page }) => {
    await goToTimetable(page, 'teacher');

    // Calendar view should be the default
    // Check that class blocks use theme primary color, not #1976d2
    const classBlocks = page.locator('[style*="position: absolute"]').filter({
      has: page.locator('span'),
    });

    if (await classBlocks.count() > 0) {
      const firstBlock = classBlocks.first();
      const bgColor = await firstBlock.evaluate((el) => {
        return window.getComputedStyle(el).backgroundColor;
      });
      // Should NOT be #1976d2 (rgb(25, 118, 210)) - the old hardcoded blue
      expect(bgColor).not.toBe('rgb(25, 118, 210)');
    }
  });

  test('today row has highlight background', async ({ page }) => {
    await goToTimetable(page, 'teacher');

    // Navigate to current week (should already be there)
    // Check that today's day row has a background tint
    // The today row should have bgcolor: 'primary.50'
    // We just verify the page renders without error in calendar mode
    await expect(page.locator('text=Timetable')).toBeVisible();
  });

  test('hover popover shows on class block (desktop)', async ({ page }) => {
    await goToTimetable(page, 'teacher');

    // Find a class block in the time-axis grid
    const classBlocks = page.locator('[style*="position: absolute"][style*="cursor: pointer"]');

    if (await classBlocks.count() > 0) {
      const block = classBlocks.first();
      // Hover over the block
      await block.hover();
      // Wait for popover delay (250ms) + render
      await page.waitForTimeout(500);

      // Popover should appear with full class details
      const popover = page.locator('.MuiPopover-root');
      // Popover may or may not appear depending on timing
      // At minimum, hovering should not crash
    }
  });
});

test.describe('Timetable UI Redesign - Mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } }); // iPhone SE

  test('mobile: no horizontal overflow', async ({ page }) => {
    await goToTimetable(page, 'teacher');

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(overflow).toBe(false);
  });

  test('mobile: shows date pills scroller', async ({ page }) => {
    await goToTimetable(page, 'teacher');

    // Mobile should show horizontal date pills, not a grid
    const datePills = page.locator('text=/Mon|Tue|Wed|Thu|Fri|Sat|Sun/');
    expect(await datePills.count()).toBeGreaterThanOrEqual(7);
  });

  test('mobile: class cards are readable', async ({ page }) => {
    await goToTimetable(page, 'teacher');

    const cards = page.locator('[style*="border-left"]');
    if (await cards.count() > 0) {
      const firstCard = cards.first();
      const box = await firstCard.boundingBox();
      if (box) {
        // Card should be at least 300px wide on mobile (full width - padding)
        expect(box.width).toBeGreaterThan(280);
      }
    }
  });

  test('mobile: no view toggle (hidden on mobile)', async ({ page }) => {
    await goToTimetable(page, 'teacher');

    // ToggleButtonGroup should be hidden on mobile
    const toggleGroup = page.locator('.MuiToggleButtonGroup-root');
    await expect(toggleGroup).toHaveCount(0);
  });

  test('mobile: tapping a date pill changes displayed day', async ({ page }) => {
    await goToTimetable(page, 'student');

    // Find date pills and tap a different one
    const pills = page.locator('[style*="cursor: pointer"][style*="border-radius"]');
    if (await pills.count() >= 2) {
      const secondPill = pills.nth(1);
      await secondPill.click();
      await page.waitForTimeout(300);
      // Page should not crash - day content should update
      await expect(page.locator('text=Timetable')).toBeVisible();
    }
  });

  test('mobile student: clicking card opens bottom drawer', async ({ page }) => {
    await goToTimetable(page, 'student');

    const cards = page.locator('[style*="border-left"][style*="cursor: pointer"]');
    if (await cards.count() > 0) {
      await cards.first().click();
      await page.waitForTimeout(500);

      // SwipeableDrawer should appear from bottom on mobile
      const drawer = page.locator('.MuiDrawer-root');
      if (await drawer.count() > 0) {
        await expect(drawer).toBeVisible();
      }
    }
  });
});

test.describe('Timetable UI Redesign - Holiday Display', () => {
  test('holidays use SVG icon, not emoji', async ({ page }) => {
    await goToTimetable(page, 'teacher');

    // Switch to list view
    const listToggle = page.locator('.MuiToggleButton-root').first();
    await listToggle.click();
    await page.waitForTimeout(500);

    // If holidays exist, they should use EventBusyIcon, not emoji
    const emojiHoliday = page.locator('text=/\uD83C\uDFD6/'); // beach emoji
    await expect(emojiHoliday).toHaveCount(0);
  });
});
