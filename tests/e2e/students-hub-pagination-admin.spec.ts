import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Admin students hub: server-side paging, sorting, filtering and search (API level).
 *
 * The grid now sends its state to /api/students and receives one page plus the
 * total. Invariants checked against live data:
 *  - without paging params the route still returns every row (old callers);
 *  - pages of 50 cover the same students as the unpaged list, with no repeats;
 *  - a filter narrows `total`, while `stats` keep describing the whole batch;
 *  - the badge route answers every sidebar count and the bell count in one call.
 * Self-skips without the Admin dev server on :3013.
 */

const ADMIN = APP_URLS.admin;

test.describe('Admin: Students hub server paging', () => {
  test('pages of 50 add up to the unpaged list', async ({ request }) => {
    const allRes = await request.get(`${ADMIN}/api/students?year=all`);
    if (!allRes.ok()) {
      test.skip(true, 'Admin students route unavailable');
      return;
    }
    const all = await allRes.json();
    const allIds: string[] = (all.students || []).map((s: { id: string }) => s.id);
    expect(all.total).toBe(allIds.length);

    const seen = new Set<string>();
    const pages = Math.ceil(allIds.length / 50) || 1;
    for (let page = 0; page < pages; page++) {
      const res = await request.get(`${ADMIN}/api/students?year=all&page=${page}&pageSize=50`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.total).toBe(allIds.length);
      expect(body.students.length).toBeLessThanOrEqual(50);
      for (const s of body.students) {
        expect(seen.has(s.id)).toBe(false);
        seen.add(s.id);
      }
    }
    expect(seen.size).toBe(allIds.length);
  });

  test('a column filter narrows total but not the batch stats', async ({ request }) => {
    const base = await request.get(`${ADMIN}/api/students?year=all&page=0&pageSize=50`);
    if (!base.ok()) {
      test.skip(true, 'Admin students route unavailable');
      return;
    }
    const baseBody = await base.json();
    const filters = encodeURIComponent(JSON.stringify([{ id: 'application', value: 'Not started' }]));
    const res = await request.get(`${ADMIN}/api/students?year=all&page=0&pageSize=50&filters=${filters}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.total).toBeLessThanOrEqual(baseBody.total);
    expect(body.stats.totalStudents).toBe(baseBody.stats.totalStudents);
    for (const s of body.students) expect(s.application_state).toBe('missing');
    expect(Array.isArray(body.yearOptions)).toBe(true);
  });

  test('sorting by fee due puts the largest first', async ({ request }) => {
    const sorting = encodeURIComponent(JSON.stringify([{ id: 'fee_due', desc: true }]));
    const res = await request.get(`${ADMIN}/api/students?year=all&page=0&pageSize=50&sorting=${sorting}`);
    if (!res.ok()) {
      test.skip(true, 'Admin students route unavailable');
      return;
    }
    const dues: number[] = ((await res.json()).students || []).map((s: { fee_due: number }) => Number(s.fee_due) || 0);
    for (let i = 1; i < dues.length; i++) expect(dues[i - 1]).toBeGreaterThanOrEqual(dues[i]);
  });

  test('one badge call carries every sidebar count and the bell count', async ({ request }) => {
    const res = await request.get(`${ADMIN}/api/admin-badges`);
    if (!res.ok()) {
      test.skip(true, 'Admin badge route unavailable');
      return;
    }
    const body = await res.json();
    for (const key of [
      'leads', 'students', 'demo_classes', 'support_tickets', 'app_feedback', 'qa_moderation', 'payments',
      'chat_history', 'duplicates', 'follow_ups', 'lifecycle', 'careers', 'messages_unread', 'notifications_unread',
    ]) {
      expect(typeof body[key], key).toBe('number');
    }
  });
});
