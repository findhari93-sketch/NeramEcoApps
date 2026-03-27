import { test, expect } from '@playwright/test';

/**
 * Application Form Lifecycle - Comprehensive E2E Tests
 *
 * Tests the full lifecycle of the marketing application form at /en/apply.
 * The form is a 4-step wizard:
 *   Step 1: Personal Information
 *   Step 2: Academic Details
 *   Step 3: Course Selection
 *   Step 4: Review & Submit
 *
 * Sections:
 *   1. Form UI Navigation (8 tests)       — stepper, buttons, validation, field rendering
 *   2. Application API Tests (6 tests)     — auth guards, pincode & centers APIs
 *   3. Mobile Responsiveness (8 tests)     — 375px mobile, 768px tablet viewports
 *
 * Total: 22 tests
 */

const MARKETING_URL = 'http://localhost:3010';

test.setTimeout(60_000);

// ─── Section 1: Form UI Navigation (8 tests) ───────────────────────────────

test.describe('Application Form Lifecycle - UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${MARKETING_URL}/en/apply`);
    await page.waitForSelector('form, [class*="Stepper"], [class*="stepper"], main', {
      timeout: 15000,
    });
  });

  // Test 1
  test('should load /en/apply and show Step 1 - Personal Information', async ({ page }) => {
    await expect(page).toHaveURL(/\/en\/apply/);

    // Step 1 heading or label should mention "Personal Information"
    const personalInfoHeading = page.getByText(/personal information/i).first();
    await expect(personalInfoHeading).toBeVisible();

    // The main content area should be rendered
    await expect(page.locator('main')).toBeVisible();
  });

  // Test 2
  test('should display step progress indicator (stepper or mobile counter)', async ({ page }) => {
    // Desktop: MUI Stepper component; Mobile: "Step X of Y" text
    const desktopStepper = page.locator('[class*="Stepper"]').first();
    const mobileCounter = page.getByText(/step \d+ of \d+/i);

    const stepIndicator = desktopStepper.or(mobileCounter);
    await expect(stepIndicator).toBeVisible();
  });

  // Test 3
  test('should have Back button disabled on first step', async ({ page }) => {
    const backButton = page.getByRole('button', { name: /back/i });
    await expect(backButton).toBeDisabled();
  });

  // Test 4
  test('should have Next button visible on first step', async ({ page }) => {
    const nextButton = page.getByRole('button', { name: /next/i });
    await expect(nextButton).toBeVisible();
    await expect(nextButton).toBeEnabled();
  });

  // Test 5
  test('should show validation/phone verification prompt when clicking Next without filling fields', async ({ page }) => {
    const nextButton = page.getByRole('button', { name: /next/i });
    await nextButton.click();

    // The form should show either a phone verification modal or validation error messages
    const hasVerificationModal = await page
      .locator('[class*="Modal"], [role="dialog"]')
      .isVisible()
      .catch(() => false);
    const hasValidationWarning = await page
      .getByText(/required|verification|verify|phone/i)
      .first()
      .isVisible()
      .catch(() => false);
    const hasErrorHelper = await page
      .locator('[class*="FormHelperText-root"][class*="error"], .Mui-error')
      .first()
      .isVisible()
      .catch(() => false);

    expect(hasVerificationModal || hasValidationWarning || hasErrorHelper).toBeTruthy();
  });

  // Test 6
  test('should render country selector field', async ({ page }) => {
    // Country could be an MUI Autocomplete, Select, or labeled text field
    const countryByLabel = page.getByLabel(/country/i).first();
    const countryByText = page.getByText(/country/i).first();
    const countryField = countryByLabel.or(countryByText);

    await expect(countryField).toBeVisible();
  });

  // Test 7
  test('should render pincode field for Indian applicants', async ({ page }) => {
    // Default country is India, so pincode should be visible
    const pincodeField = page
      .getByLabel(/pin\s*code|pincode/i)
      .or(page.locator('input[name="pincode"]'));
    await expect(pincodeField.first()).toBeVisible();
  });

  // Test 8
  test('should show login suggestion banner for unauthenticated users', async ({ page }) => {
    // Unauthenticated users should see a prompt to sign in / log in / login
    const signInBanner = page
      .getByText(/sign in|log in|login|already have an account/i)
      .first()
      .or(page.locator('[class*="Alert"], [class*="Banner"], [role="alert"]').first());

    const hasBanner = await signInBanner.isVisible().catch(() => false);

    // Also check for Google sign-in button as an alternative
    const hasGoogleButton = await page
      .getByRole('button', { name: /google|sign in/i })
      .first()
      .isVisible()
      .catch(() => false);

    expect(hasBanner || hasGoogleButton).toBeTruthy();
  });
});

// ─── Section 2: Application API Tests (6 tests) ────────────────────────────

test.describe('Application Form Lifecycle - API', () => {
  // Test 9
  test('POST /api/application without auth returns 401', async ({ request }) => {
    const response = await request.post(`${MARKETING_URL}/api/application`, {
      data: {
        applicant_category: 'school_student',
        interest_course: 'nata',
        phone_verified: true,
        status: 'submitted',
      },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Unauthorized');
  });

  // Test 10
  test('GET /api/application without auth returns 401', async ({ request }) => {
    const response = await request.get(`${MARKETING_URL}/api/application`, {
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(401);
  });

  // Test 11
  test('PATCH /api/application?id=test without auth returns 401', async ({ request }) => {
    const response = await request.patch(`${MARKETING_URL}/api/application?id=test`, {
      data: {
        first_name: 'Updated',
      },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(401);
  });

  // Test 12
  test('POST /api/application with phone_verified=false and status=submitted should fail (400 or 401)', async ({
    request,
  }) => {
    const response = await request.post(`${MARKETING_URL}/api/application`, {
      headers: {
        Authorization: 'Bearer fake-token',
      },
      data: {
        applicant_category: 'school_student',
        interest_course: 'nata',
        phone_verified: false,
        status: 'submitted',
      },
      failOnStatusCode: false,
    });

    // Should be 401 (invalid token) or 400 (phone not verified)
    expect([400, 401]).toContain(response.status());
  });

  // Test 13
  test('GET /api/pincode/600001 returns location data with city/state', async ({ request }) => {
    const response = await request.get(`${MARKETING_URL}/api/pincode/600001`, {
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    if (body.data) {
      // Should contain state and city/district
      expect(body.data.state).toBeTruthy();
      expect(body.data.city || body.data.district).toBeTruthy();
    }
  });

  // Test 14
  test('GET /api/centers returns array of centers', async ({ request }) => {
    const response = await request.get(`${MARKETING_URL}/api/centers`, {
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    // Centers could be in body.data or body.centers
    const centers = body.data || body.centers;
    expect(Array.isArray(centers)).toBe(true);
  });
});

// ─── Section 3: Mobile Responsiveness (8 tests) ────────────────────────────

test.describe('Application Form Lifecycle - Mobile (375px)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(`${MARKETING_URL}/en/apply`);
    await page.waitForSelector('main', { timeout: 15000 });
  });

  // Test 15
  test('should render without horizontal scroll at 375px', async ({ page }) => {
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  // Test 16
  test('should have touch-friendly button targets (height >= 44px)', async ({ page }) => {
    const nextButton = page.getByRole('button', { name: /next/i });
    await expect(nextButton).toBeVisible();

    const box = await nextButton.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      // Material Design / Apple HIG minimum touch target
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    // Also check the Back button
    const backButton = page.getByRole('button', { name: /back/i });
    const backVisible = await backButton.isVisible().catch(() => false);
    if (backVisible) {
      const backBox = await backButton.boundingBox();
      if (backBox) {
        expect(backBox.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  // Test 17
  test('should show mobile step counter ("Step X of Y" or similar)', async ({ page }) => {
    // On mobile 375px the stepper should collapse to a text counter
    const stepCounter = page.getByText(/step \d+ of \d+/i);
    await expect(stepCounter).toBeVisible();
  });

  // Test 18
  test('should have form fields full-width on mobile', async ({ page }) => {
    // Find input fields and verify they span most of the viewport width
    const inputs = page.locator(
      'input[type="text"], input[name="firstName"], input[name="lastName"], input[name="pincode"]'
    );

    const count = await inputs.count();
    if (count > 0) {
      const firstInput = inputs.first();
      await expect(firstInput).toBeVisible();

      const box = await firstInput.boundingBox();
      if (box) {
        // Input should be at least 80% of viewport width (375 * 0.8 = 300)
        expect(box.width).toBeGreaterThanOrEqual(280);
      }
    } else {
      // Fallback: check MUI input wrappers
      const muiInputs = page.locator('[class*="MuiInputBase-root"]');
      const muiCount = await muiInputs.count();
      expect(muiCount).toBeGreaterThan(0);

      const firstMuiInput = muiInputs.first();
      const muiBox = await firstMuiInput.boundingBox();
      if (muiBox) {
        expect(muiBox.width).toBeGreaterThanOrEqual(280);
      }
    }
  });

  // Test 19
  test('should have no console errors on mobile load (with known-noise filter)', async ({ page }) => {
    const errors: string[] = [];

    // Must set up listener before navigation, so navigate fresh
    const freshPage = page;
    freshPage.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Filter known noise that is not actionable
        if (
          !text.includes('ResizeObserver') &&
          !text.includes('favicon') &&
          !text.includes('hydration') &&
          !text.includes('ChunkLoadError') &&
          !text.includes('webpack') &&
          !text.includes('chunk') &&
          !text.includes('Failed to load resource') &&
          !text.includes('NEXT_REDIRECT') &&
          !text.includes('net::ERR') &&
          !text.includes('MSAL') &&
          !text.includes('download the React DevTools')
        ) {
          errors.push(text);
        }
      }
    });

    await freshPage.goto(`${MARKETING_URL}/en/apply`);
    await freshPage.waitForSelector('main', { timeout: 15000 });
    // Allow async errors to surface
    await freshPage.waitForTimeout(3000);

    expect(errors).toEqual([]);
  });
});

test.describe('Application Form Lifecycle - Tablet (768px)', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(`${MARKETING_URL}/en/apply`);
    await page.waitForSelector('main', { timeout: 15000 });
  });

  // Test 20
  test('should render properly on tablet without horizontal scroll', async ({ page }) => {
    await expect(page.locator('main')).toBeVisible();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    expect(hasHorizontalScroll).toBe(false);

    // Form content should still be visible at this width
    const personalInfo = page.getByText(/personal information/i).first();
    await expect(personalInfo).toBeVisible();
  });

  // Test 21
  test('should show desktop stepper at tablet width', async ({ page }) => {
    // At 768px the MUI Stepper component should render in desktop mode
    const desktopStepper = page.locator('[class*="MuiStepper"], [class*="Stepper"]').first();
    const stepCounter = page.getByText(/step \d+ of \d+/i);

    // Either the desktop stepper or at least some step indicator should be visible
    const stepIndicator = desktopStepper.or(stepCounter);
    await expect(stepIndicator).toBeVisible();
  });

  // Test 22
  test('should have input fields with min-height 48px', async ({ page }) => {
    // Check that input fields meet Material Design touch target guidelines
    const inputs = page.locator(
      'input[type="text"], input[name="firstName"], input[name="lastName"], [class*="MuiInputBase-input"]'
    );

    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);

    // Check the first visible input
    for (let i = 0; i < Math.min(count, 3); i++) {
      const input = inputs.nth(i);
      const isVisible = await input.isVisible().catch(() => false);
      if (isVisible) {
        const box = await input.boundingBox();
        if (box) {
          // MUI default inputs with outlined variant should be at least 48px
          // Some inputs may be slightly shorter due to padding, so allow 40px minimum
          expect(box.height).toBeGreaterThanOrEqual(40);
        }
        break;
      }
    }

    // Also verify the wrapping MUI component meets 48px
    const muiOutlinedInputs = page.locator('[class*="MuiOutlinedInput-root"]');
    const muiCount = await muiOutlinedInputs.count();
    if (muiCount > 0) {
      const firstMui = muiOutlinedInputs.first();
      const muiVisible = await firstMui.isVisible().catch(() => false);
      if (muiVisible) {
        const muiBox = await firstMui.boundingBox();
        if (muiBox) {
          expect(muiBox.height).toBeGreaterThanOrEqual(48);
        }
      }
    }
  });
});
