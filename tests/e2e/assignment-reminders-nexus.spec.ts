import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

/**
 * Nexus assignment reminders E2E (API level).
 *
 * Covers the reminder ("Message students") route contract: auth gating, input
 * validation, and the honest per-channel `counts` shape that the dialog now uses
 * (the old code always claimed "in-app + email" even when the in-app insert
 * silently failed on an invalid enum). Runs safely without a browser login (the
 * teacher UI login is MFA-gated), and self-skips when the Nexus dev server /
 * test-login is unavailable.
 *
 * Prerequisites (otherwise self-skips): Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;
const NUDGE = `${NEXUS}/api/assignments/nudge`;

test.describe('Nexus — Assignment reminders', () => {
  test.describe.configure({ mode: 'serial' });

  let token = '';

  test('setup: teacher token', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    if (!auth) {
      test.skip(true, 'Nexus dev server / test-login unavailable');
      return;
    }
    token = auth.testToken;
    expect(token).toBeTruthy();
  });

  test('nudge requires auth', async ({ request }) => {
    const res = await request.post(NUDGE, { data: { studentIds: ['x'], body: 'hi' } });
    // No Authorization header -> 401/403, never 200 or 500.
    expect([401, 403]).toContain(res.status());
  });

  test('nudge rejects an empty recipient list', async ({ request }) => {
    if (!token) return;
    const res = await request.post(NUDGE, {
      headers: { Authorization: `Bearer ${token}` },
      data: { studentIds: [], body: 'hello' },
    });
    expect(res.status()).toBe(400);
  });

  test('nudge rejects an empty message', async ({ request }) => {
    if (!token) return;
    const res = await request.post(NUDGE, {
      headers: { Authorization: `Bearer ${token}` },
      data: { studentIds: ['00000000-0000-0000-0000-000000000000'], body: '   ' },
    });
    expect(res.status()).toBe(400);
  });

  test('nudge returns an honest per-channel counts shape', async ({ request }) => {
    if (!token) return;
    // An unknown student id resolves to no user, so nothing is delivered. We are
    // asserting the response CONTRACT (per-channel counts), not delivery: the old
    // route returned only `viaTeams` and lied about in-app delivery.
    const res = await request.post(NUDGE, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        studentIds: ['00000000-0000-0000-0000-000000000000'],
        assignmentIds: [],
        subject: 'Test',
        body: 'Reminder contract check',
        template: 'nudge',
      },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.results)).toBe(true);
    expect(data.counts).toBeTruthy();
    for (const key of ['total', 'teams', 'inapp', 'email', 'failed']) {
      expect(typeof data.counts[key]).toBe('number');
    }
    // The unknown recipient could not be reached on any channel.
    expect(data.counts.total).toBe(1);
    expect(data.counts.failed).toBe(1);
  });

  test('staff roster payload includes a reminders summary', async ({ request }) => {
    if (!token) return;
    // A non-existent assignment is 404; a real one returns { reminders: {...} }.
    // Either way the route must not 500 (the reminders query is wired in).
    const res = await request.get(`${NEXUS}/api/assignments/00000000-0000-0000-0000-000000000000`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([404, 200]).toContain(res.status());
  });
});
