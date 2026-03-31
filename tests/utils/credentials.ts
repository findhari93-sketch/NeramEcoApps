/**
 * Centralized E2E Test Credentials
 *
 * All test credentials are managed here. Playwright tests should import
 * from this file instead of reading env vars directly.
 *
 * Credentials are loaded from .env.test (gitignored) with fallback to .env.local.
 * See .env.example for the full list of E2E_TEST_* variables.
 *
 * Test Accounts (Microsoft Entra ID - MFA disabled):
 * - Student: e2etestingstudent@neramclasses.com
 * - Teacher/Admin: e2etestingteacher@neramclasses.com
 *
 * Setup:
 * 1. Copy .env.example E2E_TEST_* vars to .env.test
 * 2. Fill in real passwords
 * 3. Disable MFA for test users in Entra (see .env.test comments for PowerShell instructions)
 */

// ============================================
// App URLs
// ============================================
export const APP_URLS = {
  marketing: 'http://localhost:3010',
  student: 'http://localhost:3011',
  nexus: 'http://localhost:3012',
  admin: 'http://localhost:3013',
} as const;

// ============================================
// Test Accounts
// ============================================

export interface TestAccount {
  email: string;
  password: string;
  role: 'student' | 'teacher' | 'admin';
  description: string;
}

/**
 * Student test account (Microsoft Entra ID)
 * - Used for: Nexus student features, student onboarding flow
 * - Login endpoint: Nexus /api/auth/test-login (role: 'student')
 * - Note: Students log into Nexus (port 3012), NOT admin (port 3013)
 */
export const STUDENT_ACCOUNT: TestAccount = {
  email: process.env.E2E_TEST_STUDENT_EMAIL || 'e2etestingstudent@neramclasses.com',
  password: process.env.E2E_TEST_STUDENT_PASSWORD || '',
  role: 'student',
  description: 'E2E test student account (Microsoft Entra ID, MFA disabled)',
};

/**
 * Teacher test account (Microsoft Entra ID)
 * - Used for: Nexus teacher features, classroom management
 * - Login endpoint: Nexus /api/auth/test-login (role: 'teacher')
 */
export const TEACHER_ACCOUNT: TestAccount = {
  email: process.env.E2E_TEST_TEACHER_EMAIL || 'e2etestingteacher@neramclasses.com',
  password: process.env.E2E_TEST_TEACHER_PASSWORD || '',
  role: 'teacher',
  description: 'E2E test teacher account (Microsoft Entra ID, MFA disabled)',
};

/**
 * Admin test account (Microsoft Entra ID)
 * - Used for: Admin dashboard features, student management
 * - Admin app (port 3013) uses same Microsoft auth as Nexus
 * - Login endpoint: Nexus /api/auth/test-login (role: 'teacher') — admins use teacher-level auth
 */
export const ADMIN_ACCOUNT: TestAccount = {
  email: process.env.E2E_TEST_ADMIN_EMAIL || process.env.E2E_TEST_TEACHER_EMAIL || 'e2etestingteacher@neramclasses.com',
  password: process.env.E2E_TEST_ADMIN_PASSWORD || process.env.E2E_TEST_TEACHER_PASSWORD || '',
  role: 'admin',
  description: 'E2E test admin account (Microsoft Entra ID, MFA disabled)',
};

// ============================================
// Auth Helpers
// ============================================

/**
 * Get a test auth token from the Nexus test-login endpoint.
 * This bypasses Microsoft OAuth for E2E testing.
 *
 * @param request - Playwright APIRequestContext (from page.request or test fixtures)
 * @param role - 'student' | 'teacher'
 * @returns Auth data with testToken, user, classrooms, etc.
 */
export async function getTestAuthToken(
  request: any,
  role: 'student' | 'teacher' = 'teacher'
): Promise<{
  testToken: string;
  user: any;
  nexusRole: string;
  classrooms: any[];
} | null> {
  const account = role === 'student' ? STUDENT_ACCOUNT : TEACHER_ACCOUNT;

  try {
    const response = await request.post(`${APP_URLS.nexus}/api/auth/test-login`, {
      data: { email: account.email, role },
    });

    if (response.ok()) {
      return await response.json();
    }
    console.error(`Test login failed for ${role}: ${response.status()}`);
    return null;
  } catch (err: any) {
    console.error(`Test login error for ${role}: ${err.message}`);
    return null;
  }
}

/**
 * Inject auth state into a Playwright page for Nexus/Admin.
 * Call this before navigating to authenticated pages.
 *
 * @param page - Playwright Page
 * @param role - 'student' | 'teacher'
 */
export async function injectAuthForPage(
  page: any,
  role: 'student' | 'teacher' = 'teacher'
): Promise<boolean> {
  const authData = await getTestAuthToken(page.request, role);
  if (!authData) return false;

  const { user, nexusRole, classrooms, testToken } = authData;

  // Navigate to Nexus first to set localStorage on correct origin
  await page.goto(`${APP_URLS.nexus}/login`, { waitUntil: 'domcontentloaded' });

  // Inject auth state
  await page.evaluate(
    ({ user, nexusRole, classrooms, testToken }: any) => {
      localStorage.setItem('nexus_test_token', testToken);
      if (classrooms.length > 0) {
        localStorage.setItem('nexus_active_classroom_id', classrooms[0].id);
      }
      localStorage.setItem('nexus_auth_user', JSON.stringify(user));
      localStorage.setItem('nexus_auth_role', nexusRole);
      localStorage.setItem('nexus_auth_classrooms', JSON.stringify(classrooms));
    },
    { user, nexusRole, classrooms, testToken }
  );

  // Set auth header for API calls
  await page.context().setExtraHTTPHeaders({
    Authorization: `Bearer ${testToken}`,
  });

  return true;
}

/**
 * Check if test credentials are configured.
 * Useful for skipping tests when credentials aren't available.
 */
export function hasTestCredentials(role: 'student' | 'teacher' | 'admin' = 'teacher'): boolean {
  const account = role === 'student' ? STUDENT_ACCOUNT : role === 'admin' ? ADMIN_ACCOUNT : TEACHER_ACCOUNT;
  return !!account.email && !!account.password;
}

// ============================================
// TEST_USERS — Role-based test user registry
// (Wraps existing accounts for use with auth-helpers.ts)
// ============================================

export const PARENT_ACCOUNT: TestAccount = {
  email: process.env.E2E_TEST_PARENT_EMAIL || 'test-parent@neramclasses.com',
  password: process.env.E2E_TEST_PARENT_PASSWORD || '',
  role: 'student', // Parents share student-level auth
  description: 'E2E test parent account (read-only access)',
};

export const TEST_USERS = {
  admin: {
    email: ADMIN_ACCOUNT.email,
    password: ADMIN_ACCOUNT.password,
    role: 'admin' as const,
    displayName: 'Test Admin',
  },
  teacher: {
    email: TEACHER_ACCOUNT.email,
    password: TEACHER_ACCOUNT.password,
    role: 'teacher' as const,
    displayName: 'Test Teacher',
  },
  student: {
    email: STUDENT_ACCOUNT.email,
    password: STUDENT_ACCOUNT.password,
    role: 'student' as const,
    displayName: 'Test Student',
  },
  parent: {
    email: PARENT_ACCOUNT.email,
    password: PARENT_ACCOUNT.password,
    role: 'parent' as const,
    displayName: 'Test Parent',
  },
} as const;

export type TestRole = keyof typeof TEST_USERS;
