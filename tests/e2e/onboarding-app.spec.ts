import { test, expect } from '@playwright/test';

/**
 * Onboarding Flow E2E Tests (Student App)
 *
 * Tests for the post-login onboarding wizard at app.neramclasses.com
 * Covers: API routes, wizard UI, skip flow, question display
 */

test.describe('Onboarding API Routes', () => {
  test.use({ baseURL: 'http://localhost:3011' });

  test('GET /api/onboarding/questions should return questions', async ({ request }) => {
    const response = await request.get('/api/onboarding/questions');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('questions');
    expect(Array.isArray(data.questions)).toBe(true);

    // Should have seeded questions
    if (data.questions.length > 0) {
      const q = data.questions[0];
      expect(q).toHaveProperty('id');
      expect(q).toHaveProperty('question_key');
      expect(q).toHaveProperty('question_text');
      expect(q).toHaveProperty('question_type');
      expect(q).toHaveProperty('options');
      expect(q).toHaveProperty('display_order');
    }
  });

  test('questions should be ordered by display_order', async ({ request }) => {
    const response = await request.get('/api/onboarding/questions');
    const data = await response.json();
    const questions = data.questions;

    if (questions.length > 1) {
      for (let i = 1; i < questions.length; i++) {
        expect(questions[i].display_order).toBeGreaterThanOrEqual(
          questions[i - 1].display_order
        );
      }
    }
  });

  test('questions should include expected question keys', async ({ request }) => {
    const response = await request.get('/api/onboarding/questions');
    const data = await response.json();
    const keys = data.questions.map((q: any) => q.question_key);

    // Check for seeded questions
    const expectedKeys = [
      'architect_motivation',
      'exam_focus',
      'education_stage',
      'referral_source',
      'school_type',
      'caste_category',
    ];

    for (const key of expectedKeys) {
      expect(keys).toContain(key);
    }
  });

  test('POST /api/onboarding/skip should require auth', async ({ request }) => {
    const response = await request.post('/api/onboarding/skip', {
      data: { source_app: 'app' },
      headers: { 'Content-Type': 'application/json' },
    });

    // Should fail without auth token
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('POST /api/onboarding/responses should require auth', async ({ request }) => {
    const response = await request.post('/api/onboarding/responses', {
      data: {
        responses: [{ question_id: 'fake-id', response: { value: 'test' } }],
        source_app: 'app',
      },
      headers: { 'Content-Type': 'application/json' },
    });

    // Should fail without auth token
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe('Onboarding Prefill API', () => {
  test.use({ baseURL: 'http://localhost:3011' });

  test('GET /api/onboarding/prefill should require auth', async ({ request }) => {
    const response = await request.get('/api/onboarding/prefill', {
      failOnStatusCode: false,
    });

    // Should fail without auth
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe('Onboarding Wizard UI', () => {
  test.use({ baseURL: 'http://localhost:3011' });

  test('should show login page when accessing protected routes', async ({ page }) => {
    // Without auth, accessing dashboard should redirect to login or SSO
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login|\/sso/);
  });

  test('login page should have Google sign-in button', async ({ page }) => {
    await page.goto('/login');

    // Should have the Google sign-in button specifically
    const googleButton = page.getByRole('button', { name: /continue with google/i });
    await expect(googleButton).toBeVisible();
  });
});

test.describe('Onboarding Mobile Responsiveness', () => {
  test.use({
    baseURL: 'http://localhost:3011',
    viewport: { width: 375, height: 667 },
  });

  test('login page should work on mobile viewport', async ({ page }) => {
    await page.goto('/login');

    // Page should render without horizontal scroll
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5); // 5px tolerance

    // Google login button should be visible and tappable (min 44px)
    const googleButton = page.getByRole('button', { name: /continue with google/i });
    if (await googleButton.isVisible()) {
      const box = await googleButton.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });
});
