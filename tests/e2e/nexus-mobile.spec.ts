import { test, expect } from '@playwright/test';

test.describe('Nexus Mobile - Teacher Pages', () => {
  test.use({
    baseURL: 'http://localhost:3012',
    viewport: { width: 393, height: 851 },
  });

  const teacherPages = [
    '/teacher/dashboard',
    '/teacher/students',
    '/teacher/attendance',
    '/teacher/checklist',
    '/teacher/timetable',
    '/teacher/evaluate',
  ];

  for (const path of teacherPages) {
    test(`${path} should have no horizontal scroll on mobile`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 15000 });

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      expect(hasHorizontalScroll).toBe(false);
    });
  }

  test('/teacher/dashboard should not have content wider than viewport', async ({ page }) => {
    await page.goto('/teacher/dashboard', { waitUntil: 'domcontentloaded', timeout: 15000 });

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(393 + 1); // 1px tolerance
  });
});

test.describe('Nexus Mobile - Student Pages', () => {
  test.use({
    baseURL: 'http://localhost:3012',
    viewport: { width: 375, height: 667 },
  });

  const studentPages = [
    '/student/dashboard',
    '/student/checklist',
    '/student/drawings',
    '/student/timetable',
    '/student/tests',
  ];

  for (const path of studentPages) {
    test(`${path} should have no horizontal scroll on iPhone SE`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 15000 });

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      expect(hasHorizontalScroll).toBe(false);
    });
  }
});

test.describe('Nexus Mobile - Parent Pages', () => {
  test.use({
    baseURL: 'http://localhost:3012',
    viewport: { width: 375, height: 667 },
  });

  test('/parent/dashboard should render on mobile without overflow', async ({ page }) => {
    await page.goto('/parent/dashboard', { waitUntil: 'domcontentloaded', timeout: 15000 });

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test('/parent/timetable should be readable on mobile', async ({ page }) => {
    await page.goto('/parent/timetable', { waitUntil: 'domcontentloaded', timeout: 15000 });

    const content = await page.textContent('body');
    expect(content).not.toContain('Internal Server Error');
  });
});
