import { test, expect, type APIRequestContext } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Record enrolment from the demo desk: for a historical demo (or one held outside
 * the desk) with no enrolment link yet, staff type the fee and the payment they
 * already took. The action makes a recorded link tied to the demo, runs the same
 * finalise engine, and moves the student to the Enrolled tab.
 *
 * Following the admin-spec convention, these are API-level guard tests: every case
 * is a refusal, so nothing is written to the staging DB. The engine orchestration
 * is covered by unit tests (packages/database/src/services/desk-finalise-enrolment.test.ts)
 * and the stage derivation by apps/admin/src/components/demo-requests/journey.test.ts.
 */

const ADMIN = APP_URLS.admin || 'http://localhost:3013';
const UUID = '99999999-9999-4999-8999-999999999999';

/** The newest demo request id from the desk, if the database has any. Read only. */
async function anyDemoId(request: APIRequestContext): Promise<string | null> {
  const res = await request.get(`${ADMIN}/api/demo-requests`, { failOnStatusCode: false });
  if (res.status() !== 200) return null;
  const body = await res.json();
  return body.requests?.[0]?.id ?? null;
}

test.describe('Record enrolment @admin', () => {
  test('refuses recording enrolment on a demo that does not exist', async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/demo-requests/${UUID}`, {
      data: { action: 'record_enrolment', totalFee: 30000, amountPaid: 15000 },
      failOnStatusCode: false,
    });
    expect([400, 401, 404]).toContain(res.status());
  });

  test('refuses an amount paid greater than the total fee, and writes nothing', async ({ request }) => {
    const demoId = await anyDemoId(request);
    test.skip(!demoId, 'No demo requests on this database');
    const res = await request.post(`${ADMIN}/api/demo-requests/${demoId}`, {
      data: { action: 'record_enrolment', totalFee: 10000, amountPaid: 20000 },
      failOnStatusCode: false,
    });
    expect(res.status()).not.toBe(200);
    expect([400, 401, 404]).toContain(res.status());
  });

  test('refuses a record with no fee entered', async ({ request }) => {
    const demoId = await anyDemoId(request);
    test.skip(!demoId, 'No demo requests on this database');
    const res = await request.post(`${ADMIN}/api/demo-requests/${demoId}`, {
      data: { action: 'record_enrolment' },
      failOnStatusCode: false,
    });
    expect(res.status()).not.toBe(200);
    expect([400, 401, 404]).toContain(res.status());
  });

  test('refuses fold_parent with no student account picked', async ({ request }) => {
    const demoId = await anyDemoId(request);
    test.skip(!demoId, 'No demo requests on this database');
    const res = await request.post(`${ADMIN}/api/demo-requests/${demoId}`, {
      data: { action: 'record_enrolment', totalFee: 30000, amountPaid: 15000, mode: 'fold_parent' },
      failOnStatusCode: false,
    });
    expect(res.status()).not.toBe(200);
    expect([400, 401, 404]).toContain(res.status());
  });
});
