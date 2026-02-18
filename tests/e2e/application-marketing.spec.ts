import { test, expect } from '@playwright/test';

/**
 * Application Form E2E Tests
 *
 * Tests for the multi-step application form on the marketing site.
 * Covers form navigation, validation, field rendering, and API submission.
 */

const MARKETING_URL = 'http://localhost:3010';

test.describe('Application Form - UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${MARKETING_URL}/en/apply`);
    // Wait for the form to load
    await page.waitForSelector('form, [class*="Stepper"], [class*="stepper"]', {
      timeout: 15000,
    });
  });

  test('should load the application page', async ({ page }) => {
    await expect(page).toHaveURL(/\/apply/);
    // The form wizard should render
    await expect(page.locator('main')).toBeVisible();
  });

  test('should display Step 1 - Personal Information by default', async ({ page }) => {
    // Step 1 content should be visible
    await expect(page.getByText(/personal information/i).first()).toBeVisible();

    // Key fields should be present
    await expect(page.locator('input[name="firstName"], [data-testid="firstName"]').or(
      page.getByLabel(/first name/i)
    ).first()).toBeVisible();
  });

  test('should show step progress indicator', async ({ page }) => {
    // Either desktop stepper or mobile step counter should exist
    const stepIndicator = page.getByText(/step 1/i).or(
      page.locator('[class*="Stepper"]').first()
    );
    await expect(stepIndicator).toBeVisible();
  });

  test('should have Back button disabled on first step', async ({ page }) => {
    const backButton = page.getByRole('button', { name: /back/i });
    await expect(backButton).toBeDisabled();
  });

  test('should have Next button visible on first step', async ({ page }) => {
    const nextButton = page.getByRole('button', { name: /next/i });
    await expect(nextButton).toBeVisible();
  });

  test('should show validation warning when proceeding without filling required fields', async ({ page }) => {
    // Try to click Next without filling fields
    const nextButton = page.getByRole('button', { name: /next/i });
    await nextButton.click();

    // Should show phone verification modal or validation error
    // (phone verification is required on step 0)
    const hasVerificationModal = await page.locator('[class*="Modal"], [role="dialog"]').isVisible().catch(() => false);
    const hasValidationWarning = await page.getByText(/required|verification/i).first().isVisible().catch(() => false);

    expect(hasVerificationModal || hasValidationWarning).toBeTruthy();
  });
});

test.describe('Application Form - Field Rendering', () => {
  test('should render country selector', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/en/apply`);
    await page.waitForSelector('main', { timeout: 15000 });

    // Country field should exist - could be MUI Autocomplete, Select, or text with "Country" label
    const countryField = page.getByText(/country/i).first();
    await expect(countryField).toBeVisible();
  });

  test('should render pincode field for Indian applicants', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/en/apply`);
    await page.waitForSelector('main', { timeout: 15000 });

    // Pincode field should be visible for default country (IN)
    const pincodeField = page.getByLabel(/pin\s*code|pincode/i).or(
      page.locator('input[name="pincode"]')
    );
    await expect(pincodeField.first()).toBeVisible();
  });
});

test.describe('Application Form - API Endpoint', () => {
  test('POST /api/application should return 401 without auth', async ({ request }) => {
    const response = await request.post(`${MARKETING_URL}/api/application`, {
      data: {
        applicant_category: 'school_student',
        interest_course: 'nata',
        phone_verified: true,
        status: 'submitted',
      },
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Unauthorized');
  });

  test('POST /api/application should validate required phone verification', async ({ request }) => {
    // Even with a fake auth token, the API should validate phone_verified
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
    });

    // Should be 401 (invalid token) or 400 (phone not verified)
    expect([400, 401]).toContain(response.status());
  });

  test('GET /api/application should return 401 without auth', async ({ request }) => {
    const response = await request.get(`${MARKETING_URL}/api/application`);
    expect(response.status()).toBe(401);
  });
});

test.describe('Application Form - Mobile Responsiveness', () => {
  test.use({ viewport: { width: 375, height: 812 } }); // iPhone X

  test('should render properly on mobile', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/en/apply`);
    await page.waitForSelector('main', { timeout: 15000 });

    // Form should be visible
    await expect(page.locator('main')).toBeVisible();

    // Step content should be readable on mobile
    const stepContent = page.getByText(/personal information/i).first();
    await expect(stepContent).toBeVisible();
  });

  test('should show mobile step counter instead of stepper', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/en/apply`);
    await page.waitForSelector('main', { timeout: 15000 });

    // Mobile should show "Step X of Y" text
    const stepText = page.getByText(/step \d+ of \d+/i);
    await expect(stepText).toBeVisible();
  });

  test('navigation buttons should be accessible on mobile', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/en/apply`);
    await page.waitForSelector('main', { timeout: 15000 });

    const nextButton = page.getByRole('button', { name: /next/i });
    await expect(nextButton).toBeVisible();

    // Button should have minimum touch target height (48px)
    const box = await nextButton.boundingBox();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(44); // Material Design minimum
    }
  });
});

test.describe('Application Form - Centers Page', () => {
  test('should load centers page', async ({ page }) => {
    await page.goto(`${MARKETING_URL}/en/centers`);
    await expect(page).toHaveURL(/\/centers/);
    await expect(page.locator('main')).toBeVisible();
  });

  test('GET /api/centers should return center data', async ({ request }) => {
    const response = await request.get(`${MARKETING_URL}/api/centers`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

test.describe('Application Form - Pincode API', () => {
  test('should return location data for valid Indian pincode', async ({ request }) => {
    const response = await request.get(`${MARKETING_URL}/api/pincode/600001`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    if (body.data) {
      expect(body.data.state).toBeTruthy();
      expect(body.data.city || body.data.district).toBeTruthy();
    }
  });

  test('should handle invalid pincode gracefully', async ({ request }) => {
    const response = await request.get(`${MARKETING_URL}/api/pincode/000000`);
    // Should return 200 with no data or 404
    expect([200, 404]).toContain(response.status());
  });
});
