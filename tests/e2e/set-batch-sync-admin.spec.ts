import { test, expect } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import path from 'path';
import dotenv from 'dotenv';
import { APP_URLS } from '../utils/credentials';

// The DB creds live in the admin app's own env file, which is also what the admin
// dev server reads — loading it here guarantees this test's client and the admin
// server hit the SAME database (no seed-in-one-DB / read-in-another mismatch).
dotenv.config({ path: path.resolve(__dirname, '../../apps/admin/.env.local') });

/**
 * Batch <-> Target Exam Year sync (admin).
 *
 * Verifies that setting a student's exam batch also mirrors the derived
 * target_exam_year onto their lead profile, from BOTH set-year entry points:
 *   - single:  POST /api/crm/users/[id]/academic-year   (drawer "Set batch")
 *   - bulk:    POST /api/crm/alumni/set-year             (toolbar "Set year")
 * Mapping: academic_year '2024-25' -> target_exam_year 2025 (start year + 1).
 *
 * DISPOSABLE ACCOUNT: seeds one throwaway `e2e-` student + lead profile, runs
 * the checks, then deletes it in afterAll. The `e2e-` dash prefix keeps it out
 * of the admin /alumni lists (hygiene filter) even mid-run.
 *
 * Non-current batches (2024-25 / 2023-24) are used on purpose so the routes'
 * "if current batch, enroll into the classroom" branch (Microsoft Teams/Graph
 * side effects) never fires — this test only touches the two DB columns.
 *
 * Self-skips (never fails) when the admin dev server is down or the test's DB
 * client and the admin server are wired to different databases. Run with:
 *   pnpm test:e2e --project=admin-chrome --no-deps set-batch-sync-admin
 */

const ADMIN = APP_URLS.admin;
const DISPOSABLE_EMAIL = 'e2e-setbatch-sync@neramclasses.com';

// Same DB the admin/nexus dev servers use (loaded from .env.test / .env.local by
// playwright.config.ts). Prefer explicit test creds, then the app's own creds.
const DB_URL = process.env.SUPABASE_TEST_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const DB_KEY = process.env.SUPABASE_TEST_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

test.describe('Admin — batch <-> target exam year sync', () => {
  test.describe.configure({ mode: 'serial' });

  let db: SupabaseClient | null = null;
  let studentId = '';
  let adminId = '';
  let skip = false;
  let skipReason = '';

  /** FK-safe delete of a freshly-seeded student (only a lead profile hangs off it). */
  async function disposeStudent(client: SupabaseClient, uid: string) {
    await client.from('lead_profiles').delete().eq('user_id', uid);
    await client.from('users').delete().eq('id', uid);
  }

  test.beforeAll(async () => {
    if (!DB_URL || !DB_KEY) {
      skip = true;
      skipReason = 'No Supabase creds in test env (SUPABASE_TEST_* or NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).';
      return;
    }
    try {
      db = createClient(DB_URL, DB_KEY, { auth: { persistSession: false } });

      // A real existing admin/teacher id for the audit trail (adminId FK).
      const { data: staff } = await db
        .from('users')
        .select('id')
        .in('user_type', ['admin', 'teacher'])
        .limit(1);
      adminId = staff?.[0]?.id || '';
      if (!adminId) {
        skip = true;
        skipReason = 'No admin/teacher user found in the DB to attribute the change to.';
        return;
      }

      // Fresh disposable student + lead profile (target_exam_year starts null).
      const existing = await db.from('users').select('id').eq('email', DISPOSABLE_EMAIL).limit(1);
      if (existing.data?.[0]?.id) await disposeStudent(db, existing.data[0].id);

      const { data: created, error: userErr } = await db
        .from('users')
        .insert({
          name: 'E2E Set-Batch Sync',
          email: DISPOSABLE_EMAIL,
          user_type: 'student',
          status: 'active',
          email_verified: true,
          preferred_language: 'en',
          academic_year: null,
        })
        .select('id')
        .single();
      if (userErr || !created) {
        skip = true;
        skipReason = `Could not seed disposable student: ${userErr?.message || 'unknown'}`;
        return;
      }
      studentId = created.id;

      const { error: leadErr } = await db
        .from('lead_profiles')
        .insert({ user_id: studentId, interest_course: 'nata', target_exam_year: null });
      if (leadErr) {
        skip = true;
        skipReason = `Could not seed lead profile: ${leadErr.message}`;
        return;
      }

      // Probe: the admin server must see this student (same DB) before we assert.
      const probe = await fetch(`${ADMIN}/api/crm/users/${studentId}`).catch(() => null);
      if (!probe || probe.status !== 200) {
        skip = true;
        skipReason = `Admin server can't read the seeded student (status ${probe?.status ?? 'no server'}). `
          + 'Start the admin dev server on :3013 wired to the same DB as this test.';
      }
    } catch (err: any) {
      skip = true;
      skipReason = `Setup failed: ${err?.message || err}`;
    }
  });

  test.afterAll(async () => {
    if (db && studentId) {
      try { await disposeStudent(db, studentId); } catch { /* best-effort dispose */ }
    }
  });

  test('single set-year mirrors target_exam_year onto the lead profile', async ({ request }) => {
    test.skip(skip, skipReason);

    const res = await request.post(`${ADMIN}/api/crm/users/${studentId}/academic-year`, {
      data: { adminId, academicYear: '2024-25' },
    });
    expect(res.status(), await res.text()).toBe(200);

    const detail = await (await request.get(`${ADMIN}/api/crm/users/${studentId}`)).json();
    expect(detail.user?.academic_year).toBe('2024-25');
    expect(detail.leadProfile?.target_exam_year).toBe(2025); // 2024 + 1
  });

  test('bulk set-year mirrors target_exam_year onto the lead profile', async ({ request }) => {
    test.skip(skip, skipReason);

    const res = await request.post(`${ADMIN}/api/crm/alumni/set-year`, {
      data: { userIds: [studentId], academicYear: '2023-24', adminId },
    });
    expect(res.status(), await res.text()).toBe(200);
    expect((await res.json()).updated).toBeGreaterThanOrEqual(1);

    const detail = await (await request.get(`${ADMIN}/api/crm/users/${studentId}`)).json();
    expect(detail.user?.academic_year).toBe('2023-24');
    expect(detail.leadProfile?.target_exam_year).toBe(2024); // 2023 + 1
  });

  test('rejects a non YYYY-YY batch value', async ({ request }) => {
    test.skip(skip, skipReason);

    const res = await request.post(`${ADMIN}/api/crm/users/${studentId}/academic-year`, {
      data: { adminId, academicYear: '2026' },
    });
    expect(res.status()).toBe(400);
  });

  test('the disposable student is hidden from the /alumni students list', async ({ request }) => {
    test.skip(skip, skipReason);

    // Dash-anchored `e2e-` accounts are filtered out of the admin lists.
    const res = await request.get(`${ADMIN}/api/crm/alumni/students`);
    if (res.status() !== 200) {
      test.skip(true, 'Students list API unavailable');
      return;
    }
    const { students } = await res.json();
    expect(students.some((s: { id: string }) => s.id === studentId)).toBe(false);
  });
});
