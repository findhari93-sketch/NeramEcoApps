import { test, expect } from '@playwright/test';

/**
 * Nexus Auth API E2E Tests
 *
 * Tests the authentication endpoints including:
 * - /api/auth/me (token verification)
 * - /api/auth/test-login (E2E test helper)
 */

test.describe('Nexus Auth API', () => {
  test.use({ baseURL: 'http://localhost:3012' });

  test('GET /api/auth/me without token should return 401', async ({ request }) => {
    const response = await request.get('/api/auth/me', {
      headers: { Authorization: '' },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(401);
  });

  test('GET /api/auth/me with invalid token should return 401', async ({ request }) => {
    const response = await request.get('/api/auth/me', {
      headers: { Authorization: 'Bearer invalid-token-12345' },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(401);
  });

  test('GET /api/auth/me with valid test token should return user data', async ({ request }) => {
    // First get a test token
    const loginRes = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-auth-test@neramclasses.com', role: 'teacher' },
    });
    expect(loginRes.status()).toBe(200);
    const { testToken } = await loginRes.json();

    // Use the test token to call /api/auth/me
    const response = await request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe('e2e-auth-test@neramclasses.com');
    expect(body.nexusRole).toBeDefined();
    expect(body.classrooms).toBeDefined();
    expect(Array.isArray(body.classrooms)).toBe(true);
  });

  test('POST /api/auth/test-login should return user, role, classrooms, and testToken', async ({ request }) => {
    const response = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-teacher-full@neramclasses.com', role: 'teacher' },
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.user).toBeDefined();
    expect(body.user.id).toBeDefined();
    expect(body.user.name).toBeDefined();
    expect(body.user.email).toBe('e2e-teacher-full@neramclasses.com');
    expect(body.nexusRole).toBeDefined();
    expect(['admin', 'teacher', 'student']).toContain(body.nexusRole);
    expect(body.classrooms).toBeDefined();
    expect(body.classrooms.length).toBeGreaterThanOrEqual(1);
    expect(body.testToken).toBeDefined();
    expect(body.testToken).toMatch(/^test_/);
  });

  test('POST /api/auth/test-login without email should return 400', async ({ request }) => {
    const response = await request.post('/api/auth/test-login', {
      data: {},
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('email');
  });

  test('POST /api/auth/test-login should auto-create classroom for new user', async ({ request }) => {
    const uniqueEmail = `e2e-new-${Date.now()}@neramclasses.com`;
    const response = await request.post('/api/auth/test-login', {
      data: { email: uniqueEmail, role: 'teacher' },
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.classrooms.length).toBeGreaterThanOrEqual(1);
    expect(body.classrooms[0].enrollmentRole).toBe('teacher');
  });
});
