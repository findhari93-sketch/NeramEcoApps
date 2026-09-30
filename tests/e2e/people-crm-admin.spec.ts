import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * The admin People page (/crm) API: exact grouped counts, exam seasons and
 * activity groups (migration 20261018090000).
 *
 * Read-only. The admin-chrome project sends an off-production staff test
 * token on every call; the anonymous check uses plain fetch so it sends none.
 * The page itself needs a Microsoft sign-in, which E2E cannot do (MFA), so
 * these tests cover the numbers the page shows.
 *
 * Run: PW_APPS=admin npx playwright test tests/e2e/people-crm-admin.spec.ts --project=admin-chrome --no-deps --workers=1
 */

const ADMIN = APP_URLS.admin;

type Row = {
  lifecycle_status: string;
  exam_year: number | null;
  exam_year_source: string | null;
  lifecycle_stage: string;
  engagement: string;
  n: number;
};

const sum = (rows: Row[], keep: (r: Row) => boolean) => rows.filter(keep).reduce((s, r) => s + r.n, 0);

test.describe('People page counts', () => {
  test('the counts refuse a caller without a staff token', async () => {
    const res = await fetch(`${ADMIN}/api/crm/users?summary=only`);
    expect(res.status).toBe(401);
  });

  test('summary returns an exact breakdown with every row given an exam year', async ({ request }) => {
    const res = await request.get(`${ADMIN}/api/crm/users?summary=only&identity=all`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.breakdown)).toBe(true);
    expect(typeof body.allAccounts).toBe('number');
    expect(typeof body.currentExamYear).toBe('number');
    expect(typeof body.archiveSuggestions).toBe('number');
    const rows = body.breakdown as Row[];
    for (const r of rows) {
      expect(r.exam_year, JSON.stringify(r)).not.toBeNull();
      expect(['batch', 'stated', 'signup']).toContain(r.exam_year_source);
    }
    // Leads and students never outnumber all accounts.
    expect(sum(rows, () => true)).toBeLessThanOrEqual(body.allAccounts);
  });

  test('the table total for a season and activity equals the card count', async ({ request }) => {
    const summary = await (await request.get(`${ADMIN}/api/crm/users?summary=only&identity=all`)).json();
    const rows = summary.breakdown as Row[];
    const year = summary.currentExamYear as number;

    const cases: Array<{ query: string; expected: number }> = [
      {
        query: 'season=current',
        expected: sum(rows, (r) => r.lifecycle_status === 'active' && r.exam_year === year),
      },
      {
        query: 'season=current&activity=gone',
        expected: sum(rows, (r) => r.lifecycle_status === 'active' && r.exam_year === year && r.engagement === 'dormant'),
      },
      {
        query: 'season=earlier&activity=recent',
        expected: sum(
          rows,
          (r) =>
            r.lifecycle_status === 'active' &&
            (r.exam_year ?? 0) < year &&
            ['new', 'engaged', 'low'].includes(r.engagement)
        ),
      },
      {
        query: 'season=all&lifecycle_stage=lead',
        expected: sum(rows, (r) => r.lifecycle_status === 'active' && r.lifecycle_stage === 'lead'),
      },
      {
        query: 'season=all&lifecycle_status=archived',
        expected: sum(rows, (r) => r.lifecycle_status === 'archived'),
      },
    ];

    for (const c of cases) {
      const res = await request.get(`${ADMIN}/api/crm/users?identity=all&limit=1&${c.query}`);
      expect(res.status(), c.query).toBe(200);
      const body = await res.json();
      expect(body.total, c.query).toBe(c.expected);
    }
  });

  test('an unknown activity or season is ignored, not an error', async ({ request }) => {
    const res = await request.get(`${ADMIN}/api/crm/users?identity=all&limit=1&activity=robot&season=junk`);
    expect(res.status()).toBe(200);
  });
});
