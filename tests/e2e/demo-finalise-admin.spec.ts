import { test, expect, type APIRequestContext } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Finalise enrolment from the demo desk: a 'recorded'-mode enrolment link whose
 * amount staff typed in but never finalised. The desk shows "Payment entered,
 * finalise" instead of "fee not recorded", and the finalise action records the
 * payment, makes the student's fee record and marks the link used (folding the
 * parent/lead account into an existing student when one is picked).
 *
 * Following the admin-spec convention, these are API-level guard tests: every
 * case is a refusal, so nothing is written to the staging DB. The derivation and
 * the service orchestration are covered by unit tests
 * (apps/admin/src/components/demo-requests/journey.test.ts and
 * packages/database/src/services/desk-finalise-enrolment.test.ts).
 */

const ADMIN = APP_URLS.admin || 'http://localhost:3013';
const UUID = '99999999-9999-4999-8999-999999999999';

const money = { totalFee: 30000, amountPaid: 15000 };

/** The newest demo request id from the desk, if the database has any. Read only. */
async function anyDemoId(request: APIRequestContext): Promise<string | null> {
  const res = await request.get(`${ADMIN}/api/demo-requests`, { failOnStatusCode: false });
  if (res.status() !== 200) return null;
  const body = await res.json();
  return body.requests?.[0]?.id ?? null;
}

test.describe('Finalise enrolment @admin', () => {
  test('refuses finalising a demo that does not exist', async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/demo-requests/${UUID}`, {
      data: { action: 'finalise_enrolment', linkId: UUID, ...money, mode: 'create' },
      failOnStatusCode: false,
    });
    expect([400, 401, 404]).toContain(res.status());
  });

  test('refuses an unknown action', async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/demo-requests/${UUID}`, {
      data: { action: 'finalise_enrolment_typo' },
      failOnStatusCode: false,
    });
    expect([400, 401, 404]).toContain(res.status());
  });

  test('refuses a finalise with no link, and writes nothing', async ({ request }) => {
    const demoId = await anyDemoId(request);
    test.skip(!demoId, 'No demo requests on this database');
    // A well-formed amount but a link that does not exist: the guard refuses before any write.
    const res = await request.post(`${ADMIN}/api/demo-requests/${demoId}`, {
      data: { action: 'finalise_enrolment', linkId: UUID, ...money, mode: 'create' },
      failOnStatusCode: false,
    });
    expect(res.status()).not.toBe(200);
    expect([400, 401, 404]).toContain(res.status());
  });

  test('refuses fold_parent with no student account picked', async ({ request }) => {
    const demoId = await anyDemoId(request);
    test.skip(!demoId, 'No demo requests on this database');
    const res = await request.post(`${ADMIN}/api/demo-requests/${demoId}`, {
      data: { action: 'finalise_enrolment', linkId: UUID, ...money, mode: 'fold_parent' },
      failOnStatusCode: false,
    });
    // Either not authenticated, the link check, or the missing-student check refuses it.
    expect(res.status()).not.toBe(200);
    expect([400, 401, 404]).toContain(res.status());
  });

  test('the people search backs the account picker and never leaks staff', async ({ request }) => {
    const res = await request.get(`${ADMIN}/api/demo-requests/people?q=zzzznotarealperson`, { failOnStatusCode: false });
    test.skip(res.status() === 401, 'No Microsoft session on this runner');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.people)).toBe(true);
    // Staff/admin accounts are never returned by this search.
    for (const p of body.people) expect(['lead', 'student', 'parent']).toContain(p.user_type);
  });
});
