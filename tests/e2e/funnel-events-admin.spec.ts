import { test, expect } from '@playwright/test';

/**
 * Funnel Events Admin E2E Tests
 *
 * Tests for admin funnel analytics APIs.
 */

test.describe('Admin Funnel APIs', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  test('GET /api/crm/funnel-summary should return funnel totals', async ({ request }) => {
    const response = await request.get('/api/crm/funnel-summary?days=30', {
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('weekly');
    expect(body).toHaveProperty('totals');
    expect(body.totals).toHaveProperty('auth_started');
    expect(body.totals).toHaveProperty('auth_completed');
    expect(body.totals).toHaveProperty('user_registered');
    expect(body.totals).toHaveProperty('phone_shown');
    expect(body.totals).toHaveProperty('otp_verified');
  });

  test('GET /api/crm/funnel-summary should accept days parameter', async ({ request }) => {
    const response = await request.get('/api/crm/funnel-summary?days=7', {
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('totals');
    expect(typeof body.totals.auth_started).toBe('number');
  });

  test('GET /api/crm/funnel-summary should accept source_app filter', async ({ request }) => {
    const response = await request.get('/api/crm/funnel-summary?days=30&source_app=app', {
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('totals');
  });

  test('GET /api/crm/funnel-events/:userId should return events for a user', async ({ request }) => {
    const response = await request.get(
      '/api/crm/funnel-events/00000000-0000-0000-0000-000000000000',
      { failOnStatusCode: false }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('events');
    expect(body).toHaveProperty('errorLogs');
    expect(Array.isArray(body.events)).toBe(true);
    expect(Array.isArray(body.errorLogs)).toBe(true);
  });

  test('GET /api/crm/funnel-events/:userId should include diagnostics field', async ({ request }) => {
    const response = await request.get(
      '/api/crm/funnel-events/00000000-0000-0000-0000-000000000000',
      { failOnStatusCode: false }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    // diagnostics is null for non-existent user (no events)
    expect(body).toHaveProperty('diagnostics');
  });
});
