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
/**
 * Where the specs point.
 *
 * Overridable so a suite can be run against a server wired to a different
 * database. Local dev normally points at the production Supabase through
 * db.neramclasses.com, so anything that writes (creating a registry tag, say)
 * wants a staging-backed server on another port instead:
 *
 *   E2E_NEXUS_URL=http://localhost:3022 pnpm test:e2e --project=nexus-chrome
 */
export const APP_URLS = {
  marketing: process.env.E2E_MARKETING_URL || 'http://localhost:3010',
  student: process.env.E2E_APP_URL || 'http://localhost:3011',
  nexus: process.env.E2E_NEXUS_URL || 'http://localhost:3012',
  admin: process.env.E2E_ADMIN_URL || 'http://localhost:3013',
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
  /** Staff tier and per-person teaching flag, both consumed by injectAuthForPage. */
  staffRole?: string | null;
  canTeach?: boolean | null;
} | null> {
  const account = role === 'student' ? STUDENT_ACCOUNT : TEACHER_ACCOUNT;

  // Retried, because a Next dev server serves /_not-found (404) for anything
  // that arrives while it is compiling a route. A cold first run would otherwise
  // fail login and skip a whole suite for a reason that has nothing to do with
  // the code under test. A route that is genuinely missing 404s every attempt.
  const attempts = 3;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await request.post(`${APP_URLS.nexus}/api/auth/test-login`, {
        data: { email: account.email, role },
        timeout: 90_000,
      });

      if (response.ok()) {
        return await response.json();
      }
      if (response.status() !== 404 || i === attempts - 1) {
        console.error(`Test login failed for ${role}: ${response.status()}`);
        return null;
      }
    } catch (err: any) {
      if (i === attempts - 1) {
        console.error(`Test login error for ${role}: ${err.message}`);
        return null;
      }
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  return null;
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

  const { user, nexusRole, classrooms, testToken, staffRole, canTeach } = authData;

  // Navigate to Nexus first to set localStorage on correct origin
  await page.goto(`${APP_URLS.nexus}/login`, { waitUntil: 'domcontentloaded' });

  // Inject auth state
  await page.evaluate(
    ({ user, nexusRole, classrooms, testToken, staffRole, canTeach }: any) => {
      localStorage.setItem('nexus_test_token', testToken);
      if (classrooms.length > 0) {
        localStorage.setItem('nexus_active_classroom_id', classrooms[0].id);
      }
      localStorage.setItem('nexus_auth_user', JSON.stringify(user));
      localStorage.setItem('nexus_auth_role', nexusRole);
      localStorage.setItem('nexus_auth_classrooms', JSON.stringify(classrooms));
      // Staff tier + tutor eligibility, so test mode (which never calls
      // /api/auth/me) resolves the same capability map a real session would.
      // Omitted values make useNexusAuth fall back to deriving the tier from
      // nexusRole, which keeps pre-tier specs working unchanged.
      if (staffRole) localStorage.setItem('nexus_auth_staff_role', staffRole);
      if (canTeach === false) localStorage.setItem('nexus_auth_can_teach', 'false');
    },
    { user, nexusRole, classrooms, testToken, staffRole, canTeach }
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

/**
 * The E2E parent account.
 *
 * `role` used to say 'student' with the note "parents share student-level auth".
 * That was never true, and it made loginAsRole(page, 'parent') silently sign in
 * as the STUDENT account, so every parent assertion in the suite was exercising
 * a student session and passing for the wrong reason. Parents now have their own
 * credential-based login; see injectParentAuthForPage below.
 *
 * Note this is a login ID and password, not an email: parents have no Microsoft
 * account and may have no email address at all.
 */
export const PARENT_ACCOUNT = {
  loginId: process.env.E2E_TEST_PARENT_LOGIN_ID || 'e2e.parent',
  password: process.env.E2E_TEST_PARENT_PASSWORD || 'e2e-parent-pass1',
  role: 'parent' as const,
  description: 'E2E test parent account (read-only, linked to the student account)',
};

/**
 * Provision a real parent (user + credential + link to the E2E student) and
 * inject the resulting session into the page.
 *
 * Deliberately goes through /api/auth/parent/test-login, which takes the genuine
 * provisioning path and returns a real `par_` token, rather than faking one.
 * A spec that passes with this therefore proves the parent path actually works.
 * The password form itself is covered separately in parent-portal-nexus.spec.ts.
 */
export async function injectParentAuthForPage(
  page: any,
  opts: { studentEmail?: string; mustChangePassword?: boolean } = {}
): Promise<boolean> {
  const res = await page.request.post(`${APP_URLS.nexus}/api/auth/parent/test-login`, {
    data: {
      studentEmail: opts.studentEmail || STUDENT_ACCOUNT.email,
      loginId: PARENT_ACCOUNT.loginId,
      password: PARENT_ACCOUNT.password,
      mustChangePassword: opts.mustChangePassword ?? false,
      reset: true,
    },
  });

  if (!res.ok()) return false;
  const data = await res.json();
  if (!data?.token) return false;

  // localStorage must be written on the Nexus origin, so land there first.
  await page.goto(`${APP_URLS.nexus}/parent/login`, { waitUntil: 'domcontentloaded' });

  await page.evaluate((session: any) => {
    localStorage.setItem('nexus_parent_session', JSON.stringify(session));
  }, {
    token: data.token,
    expiresAt: data.expiresAt,
    parent: data.parent,
    mustChangePassword: data.mustChangePassword,
  });

  await page.context().setExtraHTTPHeaders({ Authorization: `Bearer ${data.token}` });

  return true;
}

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
    // Parents sign in with a login ID, not an email. The key stays `email` so
    // the TEST_USERS shape is uniform for callers that only read it for display.
    email: PARENT_ACCOUNT.loginId,
    password: PARENT_ACCOUNT.password,
    role: 'parent' as const,
    displayName: 'Test Parent',
  },
} as const;

export type TestRole = keyof typeof TEST_USERS;
