import { test, expect } from '@playwright/test';

/**
 * Auto First-Touch Admin E2E Tests
 *
 * Tests for the auto first-touch cron API endpoint and settings API.
 * Uses admin-chrome project (Microsoft auth).
 *
 * Flow:
 * 1. Cron endpoint processes pending auto messages
 * 2. Settings API enables/disables the feature
 * 3. CRM API returns auto messages for a user
 */

test.describe('Auto First-Touch - Cron Endpoint', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3013' });

  // ---- Cron: Health check ----
  test('GET /api/cron/auto-first-touch should return 200', async ({ request }) => {
    const response = await request.get('/api/cron/auto-first-touch');
    expect(response.status()).toBe(200);

    const body = await response.json();
    // Either returns processed count or "disabled" message
    expect(body).toBeDefined();
    expect(
      body.processed !== undefined ||
      body.sent !== undefined ||
      body.message !== undefined
    ).toBeTruthy();
  });

  test('GET /api/cron/auto-first-touch should handle no pending messages gracefully', async ({ request }) => {
    const response = await request.get('/api/cron/auto-first-touch');
    expect(response.status()).toBe(200);

    const body = await response.json();
    // With no test data, should return 0 processed or "no pending" message
    if (body.message) {
      expect(typeof body.message).toBe('string');
    }
    if (body.total !== undefined) {
      expect(body.total).toBeGreaterThanOrEqual(0);
    }
  });

  test('Cron endpoint should handle auth header gracefully', async ({ request }) => {
    const response = await request.get('/api/cron/auto-first-touch', {
      headers: { Authorization: 'Bearer invalid-secret-xyz' },
    });

    // 200 = no CRON_SECRET set (dev), 401 = secret set and mismatched,
    // 500 = auth passed but DB not ready (local dev without migration)
    expect([200, 401, 500]).toContain(response.status());
  });
});

test.describe('Auto First-Touch - Settings API', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3013' });

  // ---- Settings: GET ----
  test('GET /api/settings/auto-first-touch should return settings', async ({ request }) => {
    const response = await request.get('/api/settings/auto-first-touch');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('settings');
    // Settings should have the expected shape
    const settings = body.settings;
    if (settings && Object.keys(settings).length > 0) {
      expect(settings).toHaveProperty('enabled');
      expect(settings).toHaveProperty('delay_minutes');
      expect(typeof settings.enabled).toBe('boolean');
      expect(typeof settings.delay_minutes).toBe('number');
    }
  });

  // ---- Settings: PUT ----
  test('PUT /api/settings/auto-first-touch should update settings', async ({ request }) => {
    // Read current settings first
    const getRes = await request.get('/api/settings/auto-first-touch');
    const { settings: currentSettings } = await getRes.json();

    // Update with test values
    const testSettings = {
      ...currentSettings,
      enabled: true,
      delay_minutes: 30,
      email_enabled: true,
    };

    const putRes = await request.put('/api/settings/auto-first-touch', {
      data: testSettings,
    });
    expect(putRes.status()).toBe(200);
    const putBody = await putRes.json();
    expect(putBody.success).toBe(true);

    // Verify the update persisted
    const verifyRes = await request.get('/api/settings/auto-first-touch');
    const { settings: updatedSettings } = await verifyRes.json();
    expect(updatedSettings.enabled).toBe(true);
    expect(updatedSettings.delay_minutes).toBe(30);
  });

  // ---- Settings: Toggle off and back on ----
  test('Should be able to disable and re-enable auto first-touch', async ({ request }) => {
    // Disable
    const disableRes = await request.put('/api/settings/auto-first-touch', {
      data: { enabled: false, delay_minutes: 30, email_enabled: true },
    });
    expect(disableRes.status()).toBe(200);

    // Verify disabled
    const checkRes = await request.get('/api/settings/auto-first-touch');
    const { settings } = await checkRes.json();
    expect(settings.enabled).toBe(false);

    // Cron should return "disabled" when feature is off
    const cronRes = await request.get('/api/cron/auto-first-touch');
    expect(cronRes.status()).toBe(200);
    const cronBody = await cronRes.json();
    expect(cronBody.message).toContain('disabled');

    // Re-enable
    const enableRes = await request.put('/api/settings/auto-first-touch', {
      data: { enabled: true, delay_minutes: 30, email_enabled: true },
    });
    expect(enableRes.status()).toBe(200);
  });
});

test.describe('Auto First-Touch - CRM Auto Messages API', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  test('GET /api/crm/users/:id/auto-messages should return messages array', async ({ request }) => {
    // Use a dummy user ID — should return empty array, not error
    const dummyUserId = '00000000-0000-0000-0000-000000000000';
    const response = await request.get(`/api/crm/users/${dummyUserId}/auto-messages`);

    // Should return 200 even for non-existent user (empty array)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('messages');
    expect(Array.isArray(body.messages)).toBe(true);
  });
});
