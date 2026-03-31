# IMPLEMENT-TESTING-INFRA.md
# Run this file with Claude Code: `claude "Read IMPLEMENT-TESTING-INFRA.md and execute all instructions"`

---

## Context

This file contains instructions to set up enterprise-grade testing infrastructure for the Neram Ecosystem monorepo. The project already has `CLAUDE.md`, `package.json`, and `.env` files. DO NOT replace or overwrite them — only merge/append new content.

The Neram Ecosystem has 4 apps:
- **neramclasses.com** — Next.js marketing site on Vercel
- **app.neramclasses.com** — Next.js PWA (tools), Supabase, Google/Phone OTP auth
- **nexus.neramclasses.com** — React PWA (classroom), Fluent UI v9, Supabase, Microsoft Entra ID auth
- **admin.neramclasses.com** — React (admin panel), Supabase, Microsoft Entra ID auth

Critical facts:
- 95% mobile users → primary test viewport is 375×812
- 4 user roles: Admin → Teacher → Student → Parent (read-only)
- Microsoft 365 Education backbone (Teams, OneDrive, OneNote)
- Supabase backend for all data
- Monorepo using Turborepo on Vercel

---

## Step 1: Install Testing Dependencies

Run this in the monorepo root. Do NOT modify existing dependencies — only add new ones.

```bash
npm install -D @playwright/test vitest @vitest/ui msw axe-playwright
npx playwright install --with-deps chromium
```

If the monorepo uses workspaces and each app has its own `package.json`, install in the root for shared tooling.

---

## Step 2: Create Folder Structure

Create these folders and files. Do NOT delete or move any existing files.

```
tests/
├── e2e/
│   ├── attendance/          (empty — tests go here per feature)
│   ├── question-bank/       (empty)
│   ├── auth/                (empty)
│   └── tools/               (empty)
├── fixtures/                (empty — test data JSON goes here)
└── utils/
    ├── credentials.ts
    ├── auth-helpers.ts
    ├── mobile-helpers.ts
    └── test-data-factory.ts
```

---

## Step 3: Create `tests/utils/credentials.ts`

```typescript
/**
 * Test credentials for all 4 roles across the Neram ecosystem.
 * Real values come from environment variables (GitHub Secrets in CI).
 * NEVER hardcode real passwords here.
 */

export const TEST_USERS = {
  admin: {
    email: process.env.TEST_ADMIN_EMAIL || 'test-admin@neramclasses.com',
    password: process.env.TEST_ADMIN_PASSWORD || '',
    role: 'admin' as const,
    displayName: 'Test Admin',
  },
  teacher: {
    email: process.env.TEST_TEACHER_EMAIL || 'test-teacher@neramclasses.com',
    password: process.env.TEST_TEACHER_PASSWORD || '',
    role: 'teacher' as const,
    displayName: 'Test Teacher',
  },
  student: {
    email: process.env.TEST_STUDENT_EMAIL || 'test-student@neramclasses.com',
    password: process.env.TEST_STUDENT_PASSWORD || '',
    role: 'student' as const,
    displayName: 'Test Student',
  },
  parent: {
    email: process.env.TEST_PARENT_EMAIL || 'test-parent@neramclasses.com',
    password: process.env.TEST_PARENT_PASSWORD || '',
    role: 'parent' as const,
    displayName: 'Test Parent',
  },
} as const;

export type TestRole = keyof typeof TEST_USERS;
```

---

## Step 4: Create `tests/utils/auth-helpers.ts`

```typescript
import { Page } from '@playwright/test';
import { TEST_USERS, TestRole } from './credentials';

/**
 * Login via Microsoft Entra ID (for Nexus and Admin apps).
 * Saves auth state to avoid re-login on every test.
 */
export async function loginAsRole(
  page: Page,
  role: TestRole,
  options: { fresh?: boolean } = {}
): Promise<void> {
  const user = TEST_USERS[role];
  const authStatePath = `tests/.auth/${role}.json`;

  if (!options.fresh) {
    try {
      await page.goto('/');
      const isLoggedIn = await page.locator('[data-testid="user-avatar"]')
        .isVisible({ timeout: 3000 })
        .catch(() => false);
      if (isLoggedIn) return;
    } catch {
      // No saved state, proceed with full login
    }
  }

  await page.goto('/login');
  await page.getByRole('button', { name: /sign in with microsoft/i }).click();

  // Entra ID login page
  await page.waitForURL(/login\.microsoftonline\.com/);
  await page.getByPlaceholder(/email/i).fill(user.email);
  await page.getByRole('button', { name: /next/i }).click();
  await page.getByPlaceholder(/password/i).fill(user.password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // "Stay signed in?" prompt
  const staySignedIn = page.getByRole('button', { name: /yes/i });
  if (await staySignedIn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await staySignedIn.click();
  }

  // Wait for redirect back to app
  await page.waitForURL(/nexus\.neramclasses\.com|admin\.neramclasses\.com|localhost/);
  await page.context().storageState({ path: authStatePath });
}

/**
 * Login via Phone OTP (for Tools App / Parent flow).
 */
export async function loginWithPhoneOTP(
  page: Page,
  phoneNumber: string,
): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder(/phone/i).fill(phoneNumber);
  await page.getByRole('button', { name: /send otp/i }).click();

  const testOTP = process.env.TEST_FIXED_OTP || '123456';
  await page.getByPlaceholder(/enter otp/i).fill(testOTP);
  await page.getByRole('button', { name: /verify/i }).click();
  await page.waitForURL(/app\.neramclasses\.com|localhost/);
}

/**
 * Login via Google Sign-In (for Tools App).
 */
export async function loginWithGoogle(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: /sign in with google/i }).click();

  await page.waitForURL(/accounts\.google\.com/);
  await page.getByPlaceholder(/email/i).fill(process.env.TEST_GOOGLE_EMAIL || '');
  await page.getByRole('button', { name: /next/i }).click();
  await page.getByPlaceholder(/password/i).fill(process.env.TEST_GOOGLE_PASSWORD || '');
  await page.getByRole('button', { name: /next/i }).click();
  await page.waitForURL(/app\.neramclasses\.com|localhost/);
}

/**
 * Assert that a role CANNOT access a given route.
 * Use this to verify role-based access control.
 */
export async function assertAccessDenied(
  page: Page,
  role: TestRole,
  route: string,
): Promise<void> {
  await loginAsRole(page, role);
  await page.goto(route);

  const currentURL = page.url();
  const pageContent = await page.textContent('body');
  const isDenied =
    currentURL.includes('/unauthorized') ||
    currentURL.includes('/login') ||
    pageContent?.includes('Access Denied') ||
    pageContent?.includes('403') ||
    pageContent?.includes('not authorized');

  if (!isDenied) {
    throw new Error(
      `RBAC FAILURE: Role "${role}" accessed ${route} — should be denied. URL: ${currentURL}`
    );
  }
}
```

---

## Step 5: Create `tests/utils/mobile-helpers.ts`

```typescript
import { Page, expect } from '@playwright/test';

/**
 * Verify no horizontal overflow on mobile.
 * Catches the #1 bug Claude introduces — desktop-only layouts.
 */
export async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  expect(overflow, 'Page has horizontal overflow on mobile').toBe(false);
}

/**
 * Verify touch targets are at least 44×44px (WCAG 2.5.5).
 * Students on small Android phones need tappable buttons.
 */
export async function assertTouchTargetSize(
  page: Page,
  selector: string,
  minSize: number = 44,
): Promise<void> {
  const elements = await page.locator(selector).all();
  for (const element of elements) {
    const box = await element.boundingBox();
    if (box) {
      expect(box.width, `Touch target too narrow: ${await element.textContent()}`).toBeGreaterThanOrEqual(minSize);
      expect(box.height, `Touch target too short: ${await element.textContent()}`).toBeGreaterThanOrEqual(minSize);
    }
  }
}

/** Simulate offline mode for PWA testing. */
export async function goOffline(page: Page): Promise<void> {
  await page.context().setOffline(true);
}

/** Restore network. */
export async function goOnline(page: Page): Promise<void> {
  await page.context().setOffline(false);
}

/**
 * Simulate slow 3G (common for students in rural Tamil Nadu, UAE, Saudi).
 * 500 Kbps down, 400ms latency.
 */
export async function simulateSlow3G(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (500 * 1024) / 8,
    uploadThroughput: (500 * 1024) / 8,
    latency: 400,
  });
}

/** Wait for PWA service worker to activate. */
export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      return reg.active?.state === 'activated';
    }
    return false;
  });
}

/**
 * Run axe accessibility check on current page.
 * Catches missing labels, low contrast, etc.
 */
export async function checkAccessibility(page: Page): Promise<void> {
  const { injectAxe, checkA11y } = await import('axe-playwright');
  await injectAxe(page);
  await checkA11y(page, undefined, {
    detailedReport: true,
    detailedReportOptions: { html: true },
  });
}
```

---

## Step 6: Create `tests/utils/test-data-factory.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.TEST_SUPABASE_URL!,
  process.env.TEST_SUPABASE_SERVICE_KEY!,
);

/**
 * Seed a test classroom with N students.
 * All test data uses identifiable prefixes for easy cleanup.
 */
export async function seedClassroom(options: {
  name?: string;
  studentCount?: number;
  classroom_type?: 'NATA' | 'JEE' | 'Revit';
} = {}) {
  const {
    name = `__TEST__Classroom_${Date.now()}`,
    studentCount = 5,
    classroom_type = 'NATA',
  } = options;

  const { data: classroom } = await supabase
    .from('classrooms')
    .insert({ name, type: classroom_type })
    .select()
    .single();

  const students = Array.from({ length: studentCount }, (_, i) => ({
    name: `__TEST__Student ${i + 1}`,
    email: `__test__student${i + 1}_${Date.now()}@test.neramclasses.com`,
    classroom_id: classroom!.id,
    enrolled_at: new Date(Date.now() - (studentCount - i) * 86400000).toISOString(),
  }));

  const { data: createdStudents } = await supabase
    .from('students')
    .insert(students)
    .select();

  return { classroom: classroom!, students: createdStudents! };
}

/**
 * Seed JEE question bank data for testing.
 */
export async function seedQuestionBank(options: {
  year?: number;
  questionCount?: number;
  withVideoUrls?: boolean;
} = {}) {
  const { year = 2024, questionCount = 10, withVideoUrls = true } = options;

  const questions = Array.from({ length: questionCount }, (_, i) => ({
    year,
    question_number: i + 1,
    section: i < 5 ? 'Mathematics' : 'Aptitude',
    text_en: `__TEST__Question ${i + 1} English`,
    text_hi: `__TEST__Question ${i + 1} Hindi`,
    marks: i < 5 ? 4 : 2,
    negative_marks: i < 5 ? -1 : -0.5,
    correct_option: ['A', 'B', 'C', 'D'][i % 4],
    solution_video_url: withVideoUrls ? `https://youtube.com/watch?v=__test__${year}q${i + 1}` : null,
  }));

  const { data } = await supabase.from('questions').insert(questions).select();
  return data!;
}

/**
 * Seed TNEA rank/cutoff test data for Tools App.
 */
export async function seedTNEAData(options: {
  year?: number;
  collegeCount?: number;
} = {}) {
  const { year = 2025, collegeCount = 10 } = options;

  const colleges = Array.from({ length: collegeCount }, (_, i) => ({
    name: `__TEST__College ${i + 1}`,
    code: `__TC${String(i + 1).padStart(3, '0')}`,
    year,
    cutoff_oc: 180 - i * 5,
    cutoff_bc: 170 - i * 5,
    cutoff_sc: 150 - i * 5,
    branch: 'B.Arch',
    coa_approved: i % 3 !== 0,
  }));

  const { data } = await supabase.from('tnea_cutoffs').insert(colleges).select();
  return data!;
}

/**
 * Clean up ALL test data. Run after every test suite.
 * Uses __TEST__ prefix to identify test records.
 */
export async function cleanupTestData(): Promise<void> {
  const tables = [
    { name: 'attendance', column: 'student_id', pattern: '__test__%' },
    { name: 'students', column: 'name', pattern: '__TEST__%' },
    { name: 'classrooms', column: 'name', pattern: '__TEST__%' },
    { name: 'questions', column: 'text_en', pattern: '__TEST__%' },
    { name: 'tnea_cutoffs', column: 'name', pattern: '__TEST__%' },
  ];

  for (const table of tables) {
    await supabase.from(table.name).delete().like(table.column, table.pattern);
  }
}
```

---

## Step 7: Create `playwright.config.ts` in Monorepo Root

If a `playwright.config.ts` already exists, merge the `projects` array and `use` settings. If it does not exist, create it:

```typescript
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    // PRIMARY — 95% of Neram users are on mobile
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 375, height: 812 },
      },
    },
    // SECONDARY — teachers/admins on desktop
    {
      name: 'Desktop Chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    // TERTIARY — tablet for classroom use
    {
      name: 'Tablet',
      use: {
        ...devices['iPad (gen 7)'],
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## Step 8: Append to Existing `.env.example`

DO NOT replace the file. Append these lines at the bottom:

```env
# ─── Testing Infrastructure (added by IMPLEMENT-TESTING-INFRA.md) ───
TEST_BASE_URL=http://localhost:3000
TEST_ADMIN_EMAIL=test-admin@neramclasses.com
TEST_ADMIN_PASSWORD=
TEST_TEACHER_EMAIL=test-teacher@neramclasses.com
TEST_TEACHER_PASSWORD=
TEST_STUDENT_EMAIL=test-student@neramclasses.com
TEST_STUDENT_PASSWORD=
TEST_PARENT_EMAIL=test-parent@neramclasses.com
TEST_PARENT_PASSWORD=
TEST_PHONE_NUMBER=+919876543210
TEST_FIXED_OTP=123456
TEST_GOOGLE_EMAIL=
TEST_GOOGLE_PASSWORD=
TEST_SUPABASE_URL=
TEST_SUPABASE_SERVICE_KEY=
```

---

## Step 9: Append to Existing `CLAUDE.md`

DO NOT replace the file. Find the end of the existing content and append everything below:

```markdown

---

## 🧪 Testing Requirements

> Every feature Claude implements MUST ship with tests. No exceptions.

### Testing Stack
| Layer | Tool | Purpose |
|-------|------|---------|
| Unit | Vitest | Business logic, calculations, transformations |
| Integration | Vitest + MSW | API calls, Supabase queries |
| E2E | Playwright | Full user flows in real browser |
| Accessibility | axe-playwright | WCAG compliance |

### 4 Mandatory Rules

**Rule 1: Every feature ships with tests.**
Claude writes unit tests for logic, integration tests for APIs, and E2E tests for user flows — all in the same PR as the feature.

**Rule 2: Mobile-first testing.**
All E2E tests run on 375×812 viewport (Mobile Chrome) as primary. Desktop is secondary.

**Rule 3: Role-based testing.**
Every feature is tested for all 4 roles: Admin, Teacher, Student, Parent.
If a role should NOT have access, write an `assertAccessDenied` test.

**Rule 4: Test file locations.**
- Unit tests: colocated next to source file (`Component.test.tsx`)
- E2E tests: `tests/e2e/[module]/[test-name].spec.ts`
- Test utilities: `tests/utils/`
- Test data: `tests/fixtures/`

### Test Utilities Available
- `tests/utils/credentials.ts` — Test user accounts for all 4 roles
- `tests/utils/auth-helpers.ts` — `loginAsRole()`, `loginWithPhoneOTP()`, `loginWithGoogle()`, `assertAccessDenied()`
- `tests/utils/mobile-helpers.ts` — `assertNoHorizontalOverflow()`, `assertTouchTargetSize()`, `goOffline()`, `goOnline()`, `simulateSlow3G()`, `checkAccessibility()`
- `tests/utils/test-data-factory.ts` — `seedClassroom()`, `seedQuestionBank()`, `seedTNEAData()`, `cleanupTestData()`

### E2E Test Template
Every Playwright test file MUST follow this structure:

```typescript
import { test, expect } from '@playwright/test';
import { loginAsRole, assertAccessDenied } from '../../utils/auth-helpers';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../../utils/mobile-helpers';
import { seedClassroom, cleanupTestData } from '../../utils/test-data-factory';

test.describe('[Feature Name]', () => {
  test.beforeAll(async () => { /* seed test data */ });
  test.afterAll(async () => { await cleanupTestData(); });

  // Happy path tests (all acceptance criteria)
  test('AC1: [description]', async ({ page }) => { });
  test('AC2: [description]', async ({ page }) => { });

  // Role-based access tests
  test('admin can access', async ({ page }) => { });
  test('parent sees read-only', async ({ page }) => { });
  test('unauthorized role is denied', async ({ page }) => { });

  // Mobile tests
  test('mobile: no horizontal overflow', async ({ page }) => { });
  test('mobile: touch targets >= 44px', async ({ page }) => { });

  // Edge cases
  test('empty state shows message', async ({ page }) => { });
  test('slow 3G shows loading state', async ({ page }) => { });
  test('offline shows cached data', async ({ page }) => { });

  // Boundary values
  test('handles 0 items', async ({ page }) => { });
  test('handles 100+ items', async ({ page }) => { });
});
```

### Common Bugs to Test Against
| Bug | How Claude causes it | Test to prevent it |
|-----|---------------------|-------------------|
| Desktop-only layout | Writes fixed widths | `assertNoHorizontalOverflow()` |
| Tiny tap targets | Uses small icons without padding | `assertTouchTargetSize()` |
| Missing role check | Forgets RBAC on new route | `assertAccessDenied()` for each role |
| No loading state | Renders empty during fetch | `simulateSlow3G()` + check loader |
| No empty state | Crashes with 0 records | Seed empty data + check message |
| Crash offline | No PWA cache handling | `goOffline()` + verify graceful UI |
| Wrong calculation | Logic error in marks/rank | Unit test every formula |
| English only | Misses Tamil/Hindi text | Test with bilingual fixture data |
| Token expiry | Session dies mid-use | Test with expired auth state |
| Hardcoded data | Works in dev, fails in staging | Use test-data-factory, never hardcode |

### Running Tests
```bash
npx vitest                                    # Unit tests
npx playwright test                           # All E2E (mobile + desktop + tablet)
npx playwright test --project="Mobile Chrome" # Mobile only
npx playwright test tests/e2e/attendance/     # Specific module
npx playwright test --ui                      # Visual debugging
npx playwright show-report                    # View results
```
```

---

## Step 10: Append to `.gitignore`

Append these lines to the existing `.gitignore`:

```
# Testing
tests/.auth/
test-results/
playwright-report/
blob-report/
```

---

## Step 11: Create GitHub Actions CI Pipeline

Create file `.github/workflows/test.yml`:

```yaml
name: Test Suite
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx vitest run

  e2e-tests:
    runs-on: ubuntu-latest
    needs: unit-tests
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test
        env:
          TEST_BASE_URL: ${{ vars.STAGING_URL }}
          TEST_ADMIN_EMAIL: ${{ secrets.TEST_ADMIN_EMAIL }}
          TEST_ADMIN_PASSWORD: ${{ secrets.TEST_ADMIN_PASSWORD }}
          TEST_TEACHER_EMAIL: ${{ secrets.TEST_TEACHER_EMAIL }}
          TEST_TEACHER_PASSWORD: ${{ secrets.TEST_TEACHER_PASSWORD }}
          TEST_STUDENT_EMAIL: ${{ secrets.TEST_STUDENT_EMAIL }}
          TEST_STUDENT_PASSWORD: ${{ secrets.TEST_STUDENT_PASSWORD }}
          TEST_PARENT_EMAIL: ${{ secrets.TEST_PARENT_EMAIL }}
          TEST_PARENT_PASSWORD: ${{ secrets.TEST_PARENT_PASSWORD }}
          TEST_SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
          TEST_SUPABASE_SERVICE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_KEY }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: test-traces
          path: test-results/
```

---

## Step 12: Verify Everything Works

After all changes are made, run:

```bash
# Verify Playwright is installed
npx playwright --version

# Verify test folder structure exists
ls -la tests/utils/
ls -la tests/e2e/

# Verify config loads without errors
npx playwright test --list

# Verify Vitest config loads
npx vitest --list
```

---

## ✅ Done

After executing all steps above, the testing infrastructure is in place. From now on, every feature prompt to Claude should include:

> "Read CLAUDE.md. Implement [feature] with unit tests (Vitest) and E2E tests (Playwright) per the testing requirements."

Claude will now know about the test utilities, the mobile-first requirement, the role-based access checks, and the common bug prevention patterns.
