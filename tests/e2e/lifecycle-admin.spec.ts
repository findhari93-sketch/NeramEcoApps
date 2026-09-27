import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';
import { resolveAdminId } from '../utils/admin-api';

/**
 * Lifecycle architecture: the admin API behind Duplicates, User 360,
 * Follow-ups, Lifecycle suggestions and the CRM lifecycle filters.
 *
 * Read-only against the environment the admin dev server points at (staging).
 * The admin-chrome project sends an off-production test token on every call
 * (playwright.config.ts); `anonymous` below sends none, to prove the door.
 *
 * Run: PW_APPS=admin npx playwright test tests/e2e/lifecycle-admin.spec.ts --project=admin-chrome --no-deps --workers=1
 */

const ADMIN = APP_URLS.admin;

test.describe('Lifecycle admin API', () => {
  test('every lifecycle endpoint refuses a caller without a staff token', async () => {
    // Plain fetch on purpose: a Playwright request context inherits the
    // project's default Authorization header, so it would not be anonymous.
    const paths = [
      '/api/duplicates',
      '/api/crm/follow-ups',
      '/api/crm/conversion',
      '/api/crm/owners',
      '/api/lifecycle/suggestions',
      '/api/settings/lifecycle-rules',
      '/api/testimonials/moderation',
      '/api/crm/users?identity=microsoft',
    ];
    for (const path of paths) {
      const res = await fetch(`${ADMIN}${path}`);
      expect(res.status, path).toBe(401);
    }
    const merge = await fetch(`${ADMIN}/api/duplicates/00000000-0000-0000-0000-000000000000/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(merge.status).toBe(401);
    const badToken = await fetch(`${ADMIN}/api/duplicates`, { headers: { Authorization: 'Bearer not-a-real-token' } });
    expect(badToken.status).toBe(401);
  });

  test('duplicates queue lists pairs with both people attached', async ({ request }) => {
    const res = await request.get(`${ADMIN}/api/duplicates?status=open`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.candidates)).toBe(true);
    expect(typeof body.openCount).toBe('number');
    for (const c of body.candidates) {
      expect(c.a?.id).toBeTruthy();
      expect(c.b?.id).toBeTruthy();
      expect(['strong', 'likely']).toContain(c.confidence);
    }
  });

  test('a merge for a pair that does not exist is refused without changing anything', async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/duplicates/00000000-0000-0000-0000-000000000000/merge`, {
      data: {},
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(404);
  });

  test('dismiss requires a reason', async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/duplicates/00000000-0000-0000-0000-000000000000/dismiss`, {
      data: { note: '' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('User 360 and the timeline load for a real user', async ({ request }) => {
    const adminId = await resolveAdminId(request);
    const res = await request.get(`${ADMIN}/api/users/${adminId}/360`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.person?.id).toBe(adminId);
    for (const key of ['identities', 'enrollments', 'crm', 'payments', 'feedback', 'outcomes', 'merges', 'suggestions']) {
      expect(body, key).toHaveProperty(key);
    }

    const timeline = await request.get(`${ADMIN}/api/users/${adminId}/timeline?limit=5`);
    expect(timeline.status()).toBe(200);
    const page = await timeline.json();
    expect(Array.isArray(page.entries)).toBe(true);
    expect(page.entries.length).toBeLessThanOrEqual(5);

    const badBefore = await request.get(`${ADMIN}/api/users/${adminId}/timeline?before=not-a-date`, {
      failOnStatusCode: false,
    });
    expect(badBefore.status()).toBe(400);

    const missing = await request.get(`${ADMIN}/api/users/00000000-0000-0000-0000-000000000000/360`, {
      failOnStatusCode: false,
    });
    expect(missing.status()).toBe(404);
  });

  test('the CRM can list Microsoft-only people and filter by lifecycle stage', async ({ request }) => {
    const ms = await request.get(`${ADMIN}/api/crm/users?identity=microsoft&limit=10&include_archived=true`);
    expect(ms.status()).toBe(200);
    for (const u of (await ms.json()).users) {
      expect(u.has_microsoft).toBe(true);
      expect(u.has_firebase).toBe(false);
    }

    const stage = await request.get(`${ADMIN}/api/crm/users?lifecycle_stage=lead&limit=5`);
    expect(stage.status()).toBe(200);
    for (const u of (await stage.json()).users) expect(u.lifecycle_stage).toBe('lead');

    // Unknown values are ignored, not passed to the database.
    const junk = await request.get(`${ADMIN}/api/crm/users?lifecycle_stage=robot&limit=1`);
    expect(junk.status()).toBe(200);
  });

  test('follow-ups, conversion and owners answer with the documented shapes', async ({ request }) => {
    const follow = await request.get(`${ADMIN}/api/crm/follow-ups?range=week`);
    expect(follow.status()).toBe(200);
    const f = await follow.json();
    expect(Array.isArray(f.followUps)).toBe(true);
    expect(typeof f.dueCount).toBe('number');

    const conv = await request.get(`${ADMIN}/api/crm/conversion?months=3`);
    expect(conv.status()).toBe(200);
    const months = (await conv.json()).months;
    expect(months.length).toBeLessThanOrEqual(3);
    for (const m of months) expect(m.signed_up).toBeGreaterThanOrEqual(m.enrolled);

    const owners = await request.get(`${ADMIN}/api/crm/owners`);
    expect(owners.status()).toBe(200);
    expect(Array.isArray((await owners.json()).owners)).toBe(true);
  });

  test('lifecycle suggestions and rules: invalid rules are refused, never clamped', async ({ request }) => {
    const s = await request.get(`${ADMIN}/api/lifecycle/suggestions`);
    expect(s.status()).toBe(200);
    const { counts } = await s.json();
    for (const k of ['check_in_student', 'archive_lead', 'deactivate_account', 'graduate_student']) {
      expect(typeof counts[k]).toBe('number');
    }

    const rules = await request.get(`${ADMIN}/api/settings/lifecycle-rules`);
    expect(rules.status()).toBe(200);
    expect((await rules.json()).rules.student_quiet_days).toBeGreaterThan(0);

    const bad = await request.put(`${ADMIN}/api/settings/lifecycle-rules`, {
      data: { rules: { lead_archive_days: 400, archived_deactivate_days: 100 } },
      failOnStatusCode: false,
    });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error).toMatch(/later than archiving/);
  });

  test('testimonial moderation refuses to reject without a reason', async ({ request }) => {
    const list = await request.get(`${ADMIN}/api/testimonials/moderation?status=all`);
    expect(list.status()).toBe(200);
    const res = await request.post(`${ADMIN}/api/testimonials/00000000-0000-0000-0000-000000000000/moderate`, {
      data: { action: 'reject' },
      failOnStatusCode: false,
    });
    expect([400, 404]).toContain(res.status());
  });
});
