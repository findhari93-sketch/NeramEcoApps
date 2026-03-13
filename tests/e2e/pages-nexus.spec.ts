import { test, expect } from '@playwright/test';

test.describe('Nexus Student Pages - Smoke Tests', () => {
  test.use({ baseURL: 'http://localhost:3012' });

  const studentPages = [
    { path: '/', name: 'root page' },
    { path: '/login', name: 'login page' },
    { path: '/student/dashboard', name: 'student dashboard' },
    { path: '/student/timetable', name: 'student timetable' },
    { path: '/student/profile', name: 'student profile' },
    { path: '/student/checklist', name: 'student checklist' },
    { path: '/student/drawings', name: 'student drawings' },
    { path: '/student/resources', name: 'student resources' },
    { path: '/student/documents', name: 'student documents' },
    { path: '/student/tickets', name: 'student tickets' },
    { path: '/student/tests', name: 'student tests' },
    { path: '/student/questions', name: 'student questions' },
  ];

  for (const { path, name } of studentPages) {
    test(`${name} (${path}) should load without 500 error`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const content = await page.textContent('body');
      expect(content).not.toContain('Internal Server Error');
    });
  }
});

test.describe('Nexus Teacher Pages - Smoke Tests', () => {
  test.use({ baseURL: 'http://localhost:3012' });

  const teacherPages = [
    { path: '/teacher/dashboard', name: 'teacher dashboard' },
    { path: '/teacher/timetable', name: 'teacher timetable' },
    { path: '/teacher/students', name: 'teacher students' },
    { path: '/teacher/attendance', name: 'teacher attendance' },
    { path: '/teacher/checklist', name: 'teacher checklist' },
    { path: '/teacher/evaluate', name: 'teacher evaluate' },
    { path: '/teacher/tests', name: 'teacher tests' },
    { path: '/teacher/questions', name: 'teacher questions' },
  ];

  for (const { path, name } of teacherPages) {
    test(`${name} (${path}) should load without 500 error`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const content = await page.textContent('body');
      expect(content).not.toContain('Internal Server Error');
    });
  }
});

test.describe('Nexus Parent Pages - Smoke Tests', () => {
  test.use({ baseURL: 'http://localhost:3012' });

  const parentPages = [
    { path: '/parent/dashboard', name: 'parent dashboard' },
    { path: '/parent/tickets', name: 'parent tickets' },
    { path: '/parent/timetable', name: 'parent timetable' },
  ];

  for (const { path, name } of parentPages) {
    test(`${name} (${path}) should load without 500 error`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const content = await page.textContent('body');
      expect(content).not.toContain('Internal Server Error');
    });
  }
});

test.describe('Nexus Pages - No Fatal Errors', () => {
  test.use({ baseURL: 'http://localhost:3012' });

  const criticalPages = [
    '/teacher/dashboard',
    '/student/dashboard',
    '/parent/dashboard',
  ];

  for (const path of criticalPages) {
    test(`${path} should not have fatal page errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Allow non-critical errors but flag truly fatal ones
      for (const err of errors) {
        expect(err).not.toContain('worker');
        expect(err).not.toContain('child process');
      }
    });
  }
});
