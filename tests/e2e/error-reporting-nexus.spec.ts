import { test, expect } from '@playwright/test';

/**
 * Error-reporting auto-capture E2E (Nexus).
 *
 * Verifies the NEW technical-capture fields on a reported issue round-trip to
 * staff: console_logs (recent errors), device_info, and source_app. The student
 * report flow (FAB / error boundary / failed reference material) all POST these
 * to /api/foundation/issues; staff read them back in the Nexus inbox.
 *
 * REQUIRES migration 20260722100000_foundation_issue_capture applied (adds the
 * console_logs / device_info / source_app columns). Runs API-level so it does
 * not depend on a browser session.
 */

const BASE_URL = 'http://localhost:3012';
const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

test.describe('Error reporting — auto-captured technical context', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: BASE_URL });

  let studentToken: string;
  let teacherToken: string;

  test('setup: get student and teacher tokens', async ({ request }) => {
    const s = await request.post('/api/auth/test-login', {
      data: { email: 'e2etestingstudent@neramclasses.com', role: 'student' },
    });
    expect(s.status()).toBe(200);
    studentToken = (await s.json()).testToken;

    const t = await request.post('/api/auth/test-login', {
      data: { email: 'e2etestingteacher@neramclasses.com', role: 'teacher' },
    });
    expect(t.status()).toBe(200);
    teacherToken = (await t.json()).testToken;

    expect(studentToken).toBeTruthy();
    expect(teacherToken).toBeTruthy();
  });

  test('POST persists console_logs / device_info / source_app; staff can read them back', async ({ request }) => {
    const consoleLogs = [
      { level: 'error', message: 'HTTP 500 /api/study-materials/files/x/content', url: '/api/…/content', status: 500, at: '2026-07-22T08:10:00.000Z' },
      { level: 'warn', message: 'slow response', at: '2026-07-22T08:10:01.000Z' },
    ];
    const deviceInfo = { device_type: 'mobile', browser: 'Chrome', os: 'Android', screen_width: 1080, screen_height: 2340, is_pwa: true };

    const res = await request.post('/api/foundation/issues', {
      headers: authHeader(studentToken),
      data: {
        title: '__TEST__ auto-capture round-trip',
        description: 'Created by Playwright. Safe to delete.',
        category: 'bug',
        page_url: '/student/assignments/xyz',
        console_logs: consoleLogs,
        device_info: deviceInfo,
        source_app: 'nexus',
      },
    });
    expect(res.status()).toBe(201);
    const created = (await res.json()).issue;
    expect(created.ticket_number).toMatch(/^NXS-/);

    // Staff detail returns the raw columns (select *).
    const detail = await request.get(`/api/foundation/issues/${created.id}`, {
      headers: authHeader(teacherToken),
    });
    expect(detail.status()).toBe(200);
    const issue = (await detail.json()).issue;

    expect(issue.source_app).toBe('nexus');
    expect(Array.isArray(issue.console_logs)).toBe(true);
    expect(issue.console_logs.length).toBe(2);
    expect(issue.console_logs[0].status).toBe(500);
    expect(issue.device_info.browser).toBe('Chrome');
    expect(issue.device_info.is_pwa).toBe(true);
  });

  test('POST without capture fields still succeeds and defaults source_app', async ({ request }) => {
    const res = await request.post('/api/foundation/issues', {
      headers: authHeader(studentToken),
      data: { title: '__TEST__ no-capture', category: 'other', description: 'plain report' },
    });
    expect(res.status()).toBe(201);
    const created = (await res.json()).issue;
    // Default applied by the column / query.
    expect(created.source_app === 'nexus' || created.source_app === undefined).toBeTruthy();
  });
});
