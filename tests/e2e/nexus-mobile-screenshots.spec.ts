/**
 * Nexus Mobile Screenshots - Visual Audit
 *
 * Captures full-page screenshots of all Nexus pages at Pixel 5 viewport
 * for all three roles. No assertions — purely for visual review.
 *
 * Screenshots saved to: test-results/screenshots/nexus-mobile/
 *
 * Run: pnpm test:e2e --project=nexus-mobile tests/e2e/nexus-mobile-screenshots.spec.ts
 */

import { test } from '@playwright/test';
import {
  NEXUS_TEACHER_AUTH,
  VIEWPORTS,
  navigateAndWait,
  authAndNavigate,
} from './nexus-mobile-utils';
import path from 'path';

const SCREENSHOT_DIR = path.join(__dirname, '../../test-results/screenshots/nexus-mobile');

const TEACHER_PAGES = [
  '/teacher/dashboard',
  '/teacher/students',
  '/teacher/attendance',
  '/teacher/timetable',
  '/teacher/evaluate',
  '/teacher/tests',
  '/teacher/questions',
  '/teacher/modules',
  '/teacher/foundation',
  '/teacher/foundation/manage',
  '/teacher/issues',
  '/teacher/checklists',
  '/teacher/classrooms',
  '/teacher/question-bank',
  '/teacher/question-bank/new',
  '/teacher/question-bank/questions',
  '/teacher/question-bank/papers',
  '/teacher/question-bank/bulk-upload',
  '/teacher/admin/users',
  '/teacher/admin/settings',
  '/teacher/guide',
  '/teacher/management-guide',
];

const STUDENT_PAGES = [
  '/student/dashboard',
  '/student/timetable',
  '/student/checklist',
  '/student/drawings',
  '/student/tests',
  '/student/questions',
  '/student/modules',
  '/student/foundation',
  '/student/resources',
  '/student/documents',
  '/student/issues',
  '/student/tickets',
  '/student/question-bank',
  '/student/question-bank/questions',
  '/student/profile',
  '/student/guide',
];

const PARENT_PAGES = [
  '/parent/dashboard',
  '/parent/timetable',
  '/parent/tickets',
  '/parent/foundation',
];

// =============================================================================
// Teacher Screenshots (uses existing teacher auth from setup project)
// =============================================================================

test.describe('Screenshots - Teacher (Pixel 5)', () => {
  test.slow();

  test.use({
    baseURL: 'http://localhost:3012',
    storageState: NEXUS_TEACHER_AUTH,
    viewport: { width: VIEWPORTS.pixel5.width, height: VIEWPORTS.pixel5.height },
  });

  for (const pagePath of TEACHER_PAGES) {
    const screenshotName = pagePath.replace(/\//g, '-').replace(/^-/, '');

    test(`screenshot: ${pagePath}`, async ({ page }) => {
      const loaded = await navigateAndWait(page, pagePath);
      if (!loaded) {
        test.skip(true, 'Page redirected to login');
        return;
      }

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${screenshotName}.png`),
        fullPage: true,
      });
    });
  }
});

// =============================================================================
// Student Screenshots (inline auth injection)
// =============================================================================

test.describe('Screenshots - Student (Pixel 5)', () => {
  test.slow();

  test.use({
    baseURL: 'http://localhost:3012',
    viewport: { width: VIEWPORTS.pixel5.width, height: VIEWPORTS.pixel5.height },
  });

  for (const pagePath of STUDENT_PAGES) {
    const screenshotName = pagePath.replace(/\//g, '-').replace(/^-/, '');

    test(`screenshot: ${pagePath}`, async ({ page }) => {
      const loaded = await authAndNavigate(page, 'student', pagePath);
      if (!loaded) {
        test.skip(true, 'Auth failed or page redirected to login');
        return;
      }

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${screenshotName}.png`),
        fullPage: true,
      });
    });
  }
});

// =============================================================================
// Parent Screenshots (inline auth injection)
// =============================================================================

test.describe('Screenshots - Parent (Pixel 5)', () => {
  test.slow();

  test.use({
    baseURL: 'http://localhost:3012',
    viewport: { width: VIEWPORTS.pixel5.width, height: VIEWPORTS.pixel5.height },
  });

  for (const pagePath of PARENT_PAGES) {
    const screenshotName = pagePath.replace(/\//g, '-').replace(/^-/, '');

    test(`screenshot: ${pagePath}`, async ({ page }) => {
      const loaded = await authAndNavigate(page, 'parent', pagePath);
      if (!loaded) {
        test.skip(true, 'Auth failed or page redirected to login');
        return;
      }

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${screenshotName}.png`),
        fullPage: true,
      });
    });
  }
});
