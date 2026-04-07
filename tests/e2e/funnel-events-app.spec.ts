import { test, expect } from '@playwright/test';

/**
 * Funnel Events App E2E Tests
 *
 * Tests for the app funnel events API at app.neramclasses.com.
 */

test.describe('App Funnel Events API', () => {
  test.use({ baseURL: 'http://localhost:3011' });

  test('POST /api/funnel-events should accept valid events batch', async ({ request }) => {
    const response = await request.post('/api/funnel-events', {
      data: {
        events: [
          {
            funnel: 'auth',
            event: 'google_auth_started',
            status: 'started',
            anonymous_id: 'test-fingerprint-123',
            device_type: 'desktop',
            browser: 'Chrome',
            os: 'Windows',
            source_app: 'app',
            page_url: '/login',
          },
        ],
      },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.inserted).toBe(1);
  });

  test('POST /api/funnel-events should accept multiple events', async ({ request }) => {
    const response = await request.post('/api/funnel-events', {
      data: {
        events: [
          { funnel: 'auth', event: 'google_auth_started', status: 'started', source_app: 'app' },
          { funnel: 'auth', event: 'google_auth_completed', status: 'completed', source_app: 'app' },
          { funnel: 'auth', event: 'register_user_completed', status: 'completed', source_app: 'app' },
        ],
      },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.inserted).toBe(3);
  });

  test('POST /api/funnel-events should reject empty events array', async ({ request }) => {
    const response = await request.post('/api/funnel-events', {
      data: { events: [] },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('No events');
  });

  test('POST /api/funnel-events should reject more than 50 events', async ({ request }) => {
    const events = Array.from({ length: 51 }, (_, i) => ({
      funnel: 'auth',
      event: `test_event_${i}`,
      status: 'started',
      source_app: 'app',
    }));

    const response = await request.post('/api/funnel-events', {
      data: { events },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Too many events');
  });

  test('POST /api/funnel-events should accept events with error details', async ({ request }) => {
    const response = await request.post('/api/funnel-events', {
      data: {
        events: [
          {
            funnel: 'auth',
            event: 'google_auth_failed',
            status: 'failed',
            error_message: 'Popup was closed by user',
            error_code: 'auth/popup-closed-by-user',
            source_app: 'app',
            page_url: '/login',
          },
        ],
      },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.inserted).toBe(1);
  });

  test('POST /api/funnel-events should accept onboarding events', async ({ request }) => {
    const response = await request.post('/api/funnel-events', {
      data: {
        events: [
          {
            funnel: 'onboarding',
            event: 'onboarding_started',
            status: 'started',
            source_app: 'app',
          },
          {
            funnel: 'onboarding',
            event: 'onboarding_question_answered',
            status: 'completed',
            metadata: { question_id: 'q1', step: 1 },
            source_app: 'app',
          },
        ],
      },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.inserted).toBe(2);
  });

  test('POST /api/funnel-events should accept application funnel events', async ({ request }) => {
    const response = await request.post('/api/funnel-events', {
      data: {
        events: [
          {
            funnel: 'application',
            event: 'application_step_started',
            status: 'started',
            metadata: { step: 1 },
            source_app: 'app',
          },
        ],
      },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.inserted).toBe(1);
  });
});
