/**
 * Nexus Mobile Responsive Audit - Shared Utilities
 *
 * Reusable audit functions for checking mobile responsiveness
 * across all Nexus pages (teacher, student, parent roles).
 */

import { Page, Browser, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Auth state file paths - teacher reuses the setup project's file
export const NEXUS_TEACHER_AUTH = path.join(__dirname, '../.auth/teacher.json');
export const NEXUS_STUDENT_AUTH = path.join(__dirname, '../.auth/nexus-student.json');
export const NEXUS_PARENT_AUTH = path.join(__dirname, '../.auth/nexus-parent.json');

// Viewports to test
export const VIEWPORTS = {
  iPhoneSE: { name: 'iPhone SE', width: 375, height: 667 },
  pixel5: { name: 'Pixel 5', width: 393, height: 851 },
  tablet: { name: 'Tablet', width: 768, height: 1024 },
} as const;

// Console error patterns to ignore (known noise in dev/test)
const IGNORED_CONSOLE_PATTERNS = [
  /favicon/i,
  /ResizeObserver loop/i,
  /hydration/i,
  /NEXT_REDIRECT/i,
  /net::ERR_BLOCKED_BY_CLIENT/i,
  /MSAL/i,
  /msal/i,
  /Failed to load resource.*\/api\//i,
  /Download the React DevTools/i,
  /Warning: ReactDOM/i,
  /Warning: Each child/i,
  /Warning: validateDOMNesting/i,
  /Warning: Prop.*did not match/i,
  /ChunkLoadError/i,
  /Loading chunk/i,
  /\_next\/static/i,
  /hot-update/i,
  /webpack/i,
];

/**
 * Authenticate as a specific role on Nexus via test-login API.
 * Saves storage state to a file for reuse across tests.
 */
export async function authenticateAsRole(
  browser: Browser,
  role: 'teacher' | 'student' | 'parent',
): Promise<string> {
  const authFiles = {
    teacher: NEXUS_TEACHER_AUTH,
    student: NEXUS_STUDENT_AUTH,
    parent: NEXUS_PARENT_AUTH,
  };
  const emails = {
    teacher: 'e2e-teacher@neramclasses.com',
    student: 'e2e-student@neramclasses.com',
    parent: 'e2e-parent@neramclasses.com',
  };

  const authFile = authFiles[role];

  // Ensure the .auth directory exists
  const authDir = path.dirname(authFile);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Create context WITHOUT inheriting storageState from test.use()
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();

  try {
    const response = await page.request.post('http://localhost:3012/api/auth/test-login', {
      data: { email: emails[role], role },
    });

    if (!response.ok()) {
      throw new Error(`test-login failed for ${role}: ${response.status()}`);
    }

    const authData = await response.json();
    const { user, nexusRole, classrooms, testToken } = authData;

    // Navigate to Nexus and inject auth state
    await page.goto('http://localhost:3012/login');
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate(({ user, nexusRole, classrooms, testToken }) => {
      localStorage.setItem('nexus_test_token', testToken);
      localStorage.setItem('nexus_auth_user', JSON.stringify(user));
      localStorage.setItem('nexus_auth_role', nexusRole);
      localStorage.setItem('nexus_auth_classrooms', JSON.stringify(classrooms));
      if (classrooms.length > 0) {
        localStorage.setItem('nexus_active_classroom_id', classrooms[0].id);
      }
    }, { user, nexusRole, classrooms, testToken });

    await context.setExtraHTTPHeaders({
      'Authorization': `Bearer ${testToken}`,
    });

    await context.storageState({ path: authFile });
  } finally {
    await context.close();
  }

  return authFile;
}

// Cached auth data for injecting into pages (avoids repeated API calls)
const authDataCache: Record<string, {
  user: unknown;
  nexusRole: string;
  classrooms: Array<{ id: string }>;
  testToken: string;
}> = {};

/**
 * Inject auth state directly into a page's localStorage.
 * Calls the test-login API once and caches the result.
 * Use this for roles that don't have a setup project (student, parent).
 */
export async function injectAuthForPage(
  page: Page,
  role: 'teacher' | 'student' | 'parent',
): Promise<boolean> {
  const emails = {
    teacher: 'e2e-teacher@neramclasses.com',
    student: 'e2e-student@neramclasses.com',
    parent: 'e2e-parent@neramclasses.com',
  };

  // Fetch auth data from API (once per role, then cached)
  if (!authDataCache[role]) {
    const response = await page.request.post('http://localhost:3012/api/auth/test-login', {
      data: { email: emails[role], role },
    });

    if (!response.ok()) {
      console.error(`test-login failed for ${role}: ${response.status()}`);
      return false;
    }

    authDataCache[role] = await response.json();
  }

  const { user, nexusRole, classrooms, testToken } = authDataCache[role];

  // Navigate to login page to access localStorage domain
  await page.goto('http://localhost:3012/login', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Inject auth into localStorage
  await page.evaluate(({ user, nexusRole, classrooms, testToken }) => {
    localStorage.setItem('nexus_test_token', testToken);
    localStorage.setItem('nexus_auth_user', JSON.stringify(user));
    localStorage.setItem('nexus_auth_role', nexusRole);
    localStorage.setItem('nexus_auth_classrooms', JSON.stringify(classrooms));
    if (classrooms.length > 0) {
      localStorage.setItem('nexus_active_classroom_id', classrooms[0].id);
    }
  }, { user, nexusRole, classrooms, testToken });

  // Set auth header for API requests
  await page.context().setExtraHTTPHeaders({
    'Authorization': `Bearer ${testToken}`,
  });

  return true;
}

/**
 * Navigate to a page and wait for it to be ready.
 * Returns false if redirected to login (auth failure).
 */
export async function navigateAndWait(page: Page, pagePath: string): Promise<boolean> {
  await page.goto(pagePath, { waitUntil: 'domcontentloaded', timeout: 45000 });
  // Give MUI time to render
  await page.waitForTimeout(1500);

  const url = page.url();
  if (url.includes('/login')) {
    return false; // Auth redirect
  }
  return true;
}

/**
 * Inject auth and then navigate to a page. For roles without setup project auth files.
 */
export async function authAndNavigate(
  page: Page,
  role: 'student' | 'parent',
  pagePath: string,
): Promise<boolean> {
  const authed = await injectAuthForPage(page, role);
  if (!authed) return false;

  return navigateAndWait(page, pagePath);
}

/**
 * Check that the page has no horizontal scroll overflow.
 */
export async function checkNoHorizontalScroll(page: Page): Promise<{
  pass: boolean;
  scrollWidth: number;
  clientWidth: number;
}> {
  const result = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  return {
    pass: result.scrollWidth <= result.clientWidth,
    ...result,
  };
}

/**
 * Check touch target sizes for interactive elements.
 * Returns violations where elements are smaller than minSize.
 */
export async function checkTouchTargets(
  page: Page,
  minSize: number = 44,
): Promise<{
  total: number;
  violations: number;
  details: Array<{ tag: string; text: string; width: number; height: number }>;
}> {
  const result = await page.evaluate((minSize) => {
    const selectors = 'a, button, [role="button"], input, select, textarea, .MuiButtonBase-root, .MuiIconButton-root';
    const elements = document.querySelectorAll(selectors);
    const violations: Array<{ tag: string; text: string; width: number; height: number }> = [];
    let total = 0;

    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      // Skip invisible elements
      if (rect.width === 0 || rect.height === 0) return;
      // Skip elements off-screen
      if (rect.top > window.innerHeight * 2) return;

      total++;
      if (rect.width < minSize || rect.height < minSize) {
        violations.push({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || '').trim().substring(0, 30),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    });

    return { total, violations: violations.length, details: violations.slice(0, 15) };
  }, minSize);

  return result;
}

/**
 * Check that base font size is >= minSize (prevents iOS auto-zoom on inputs).
 */
export async function checkBaseFontSize(
  page: Page,
  minSize: number = 16,
): Promise<{
  pass: boolean;
  bodyFontSize: number;
  inputViolations: Array<{ tag: string; fontSize: number }>;
}> {
  const result = await page.evaluate((minSize) => {
    const bodyStyle = window.getComputedStyle(document.body);
    const bodyFontSize = parseFloat(bodyStyle.fontSize);

    const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select');
    const inputViolations: Array<{ tag: string; fontSize: number }> = [];

    inputs.forEach((el) => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const style = window.getComputedStyle(el);
      const fontSize = parseFloat(style.fontSize);
      if (fontSize < minSize) {
        inputViolations.push({
          tag: el.tagName.toLowerCase(),
          fontSize: Math.round(fontSize * 10) / 10,
        });
      }
    });

    return {
      pass: bodyFontSize >= minSize && inputViolations.length === 0,
      bodyFontSize: Math.round(bodyFontSize * 10) / 10,
      inputViolations: inputViolations.slice(0, 10),
    };
  }, minSize);

  return result;
}

/**
 * Check that the desktop sidebar is hidden on mobile viewports.
 */
export async function checkSidebarHidden(page: Page): Promise<boolean> {
  // The DesktopSidebar uses display: { xs: 'none', md: 'flex' }
  // Check if any nav element is visible (it shouldn't be on mobile)
  const sidebar = page.locator('nav').first();
  if (await sidebar.count() === 0) return true; // No sidebar at all

  const isVisible = await sidebar.isVisible().catch(() => false);
  return !isVisible;
}

/**
 * Check that the bottom navigation is visible on mobile.
 */
export async function checkBottomNavVisible(page: Page): Promise<boolean> {
  const bottomNav = page.locator('.MuiBottomNavigation-root');
  if (await bottomNav.count() === 0) return false;
  return await bottomNav.isVisible().catch(() => false);
}

/**
 * Collect console errors during page load, filtering known noise.
 */
export function createConsoleErrorCollector(page: Page): {
  errors: string[];
  start: () => void;
} {
  const errors: string[] = [];

  const start = () => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        const isIgnored = IGNORED_CONSOLE_PATTERNS.some((pattern) => pattern.test(text));
        if (!isIgnored) {
          errors.push(text.substring(0, 200));
        }
      }
    });
  };

  return { errors, start };
}

/**
 * Check form input heights meet minimum size for mobile usability.
 */
export async function checkFormInputHeights(
  page: Page,
  minHeight: number = 40,
): Promise<{
  total: number;
  violations: number;
  details: Array<{ tag: string; height: number }>;
}> {
  const result = await page.evaluate((minHeight) => {
    const inputs = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, select, .MuiInputBase-root',
    );
    const violations: Array<{ tag: string; height: number }> = [];
    let total = 0;

    inputs.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (rect.top > window.innerHeight * 2) return;

      total++;
      if (rect.height < minHeight) {
        violations.push({
          tag: el.tagName.toLowerCase(),
          height: Math.round(rect.height),
        });
      }
    });

    return { total, violations: violations.length, details: violations.slice(0, 10) };
  }, minHeight);

  return result;
}

/**
 * Find elements that overflow their container or the viewport.
 */
export async function checkContentOverflow(
  page: Page,
  viewportWidth: number,
): Promise<{
  pass: boolean;
  overflowingElements: number;
}> {
  const result = await page.evaluate((vpWidth) => {
    let overflowing = 0;
    const allElements = document.querySelectorAll('*');

    allElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width > vpWidth + 2) { // 2px tolerance
        overflowing++;
      }
    });

    return { pass: overflowing === 0, overflowingElements: overflowing };
  }, viewportWidth);

  return result;
}
