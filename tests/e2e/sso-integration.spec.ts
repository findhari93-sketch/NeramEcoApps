import { test, expect } from '@playwright/test';

/**
 * SSO Integration Tests
 *
 * Tests the Single Sign-On flow between Marketing (localhost:3010)
 * and the Tools App (localhost:3011).
 *
 * Run: pnpm test:e2e --project=integration
 */

// SSO tests don't need pre-authenticated state
test.use({ storageState: { cookies: [], origins: [] } });

const MARKETING_URL = 'http://localhost:3010';
const APP_URL = 'http://localhost:3011';

test.describe('SSO - Firebase Admin Health', () => {
  test('exchange-token health endpoint should return ok', async ({ request }) => {
    const response = await request.get(`${APP_URL}/api/auth/health`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.projectId).toBeTruthy();
    expect(data.clientEmail).toBeTruthy();
  });
});

test.describe('SSO - Exchange Token API', () => {
  test('should return CORS headers for marketing origin', async ({ request }) => {
    const response = await request.fetch(`${APP_URL}/api/auth/exchange-token`, {
      method: 'OPTIONS',
      headers: {
        'Origin': MARKETING_URL,
        'Access-Control-Request-Method': 'POST',
      },
    });

    const headers = response.headers();
    expect(headers['access-control-allow-origin']).toBe(MARKETING_URL);
    expect(headers['access-control-allow-methods']).toContain('POST');
  });

  test('should reject request without idToken', async ({ request }) => {
    const response = await request.post(`${APP_URL}/api/auth/exchange-token`, {
      data: {},
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('ID token is required');
  });

  test('should reject invalid idToken', async ({ request }) => {
    const response = await request.post(`${APP_URL}/api/auth/exchange-token`, {
      data: { idToken: 'invalid-token' },
      headers: { 'Content-Type': 'application/json' },
    });

    // Should return 401 or 500, not 200
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe('SSO - Error Handling (no auth)', () => {
  // Firebase SDK can take 30-40s to reject invalid tokens (network request + timeout)
  test.setTimeout(90000);

  test('app should handle invalid authToken gracefully', async ({ page }) => {
    await page.goto(`${APP_URL}/?authToken=invalid-custom-token`, {
      waitUntil: 'domcontentloaded',
    });

    // Firebase SDK takes ~30-40s to reject invalid tokens
    await expect(page.getByText('Sign-in Failed')).toBeVisible({ timeout: 60000 });

    // Should have Login (renders as <a> via Link) and Retry buttons
    await expect(page.getByRole('link', { name: /login/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();

    // URL should have sso=error and no authToken
    await expect(page).toHaveURL(/sso=error/);
    expect(page.url()).not.toContain('authToken');
  });

  test('app should NOT produce infinite console errors with invalid token', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto(`${APP_URL}/?authToken=invalid-custom-token`, {
      waitUntil: 'domcontentloaded',
    });

    // Wait for the error UI (Firebase SDK takes ~30-40s)
    await expect(page.getByText('Sign-in Failed')).toBeVisible({ timeout: 60000 });

    // Wait a bit to see if more errors accumulate (they shouldn't)
    await page.waitForTimeout(3000);

    // Should have at most a few errors (the initial failure + Firebase SDK),
    // NOT 100+ errors from an infinite loop
    const ssoErrors = errors.filter(e =>
      e.includes('SSO sign-in error') || e.includes('invalid-custom-token')
    );
    expect(ssoErrors.length).toBeLessThanOrEqual(3);
  });

  test('auth layout should handle invalid authToken gracefully', async ({ page }) => {
    await page.goto(`${APP_URL}/login?authToken=invalid-custom-token`, {
      waitUntil: 'domcontentloaded',
    });

    // Should show the alert banner
    await expect(page.getByText(/automatic sign-in failed/i)).toBeVisible({ timeout: 60000 });

    // Retry button should be accessible
    await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
  });

  test('protected route should handle invalid authToken gracefully', async ({ page }) => {
    await page.goto(`${APP_URL}/dashboard?authToken=invalid-custom-token`, {
      waitUntil: 'domcontentloaded',
    });

    // Should show error UI (either Sign-in Failed or redirect to login with alert)
    const signInFailed = page.getByText('Sign-in Failed');
    const autoSignInFailed = page.getByText(/automatic sign-in failed/i);
    const loading = page.getByText('Loading...');

    // Wait for loading to disappear and error to show
    await expect(signInFailed.or(autoSignInFailed)).toBeVisible({ timeout: 60000 });
  });
});

test.describe('SSO - Marketing to App redirect', () => {
  test.setTimeout(90000);

  test('marketing SSO page should redirect unauthenticated users back', async ({ page }) => {
    const redirectUrl = `${APP_URL}/dashboard`;
    await page.goto(`${MARKETING_URL}/sso?redirect=${encodeURIComponent(redirectUrl)}`, {
      waitUntil: 'commit',
    }).catch(() => {
      // goto may throw ERR_ABORTED due to redirect
    });

    // Should redirect back to the app with sso=none (waitUntil commit to handle redirects)
    await page.waitForURL(url => {
      try {
        return url.toString().includes('sso=none');
      } catch {
        return false;
      }
    }, { timeout: 45000, waitUntil: 'domcontentloaded' });

    expect(page.url()).toContain('sso=none');
  });

  test('app should not redirect to SSO more than once per session', async ({ page }) => {
    // First visit: app will redirect to marketing SSO, then back with sso=none
    await page.goto(`${APP_URL}/`, { waitUntil: 'commit' }).catch(() => {});

    // Wait for the SSO round-trip (app → marketing → app with sso=none)
    await page.waitForURL(url => url.toString().includes('localhost:3011'), {
      timeout: 45000,
      waitUntil: 'domcontentloaded',
    });

    // Reload: sessionStorage flag should prevent re-redirect to marketing
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(5000);

    // Should stay on the app domain
    expect(page.url()).toContain('localhost:3011');
  });
});

test.describe('SSO - Signout coordination', () => {
  test('app signout page should load without errors', async ({ request }) => {
    // Test as an HTTP request (simulates iframe loading)
    const response = await request.get(`${APP_URL}/auth/signout`);
    expect(response.status()).toBe(200);
  });
});
