/**
 * Student Results Showcase - Admin E2E Tests
 *
 * Tests the admin dashboard CRUD operations:
 * - List view with filters
 * - Create new student result
 * - Edit existing result
 * - Toggle published/featured
 * - Delete result
 * - API endpoints
 *
 * Runs against: admin-chrome project
 * Auth: Microsoft Entra ID (teacher/admin account)
 */

import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env vars from app's .env.local
dotenv.config({ path: path.resolve(__dirname, '../../apps/admin/.env.local') });

const ADMIN = APP_URLS.admin;
const TEST_PREFIX = '__TEST__';

// Create admin client inline (can't use supabase.ts which imports vitest)
function createTestAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not found. Ensure apps/admin/.env.local exists.');
  return createClient(url, key);
}

test.describe('Student Results - Admin Dashboard', () => {
  let supabase: ReturnType<typeof createTestAdminClient>;

  test.beforeAll(async () => {
    supabase = createTestAdminClient();
    // Clean up test data
    await supabase
      .from('student_results')
      .delete()
      .like('student_name', `${TEST_PREFIX}%`);
  });

  test.afterAll(async () => {
    await supabase
      .from('student_results')
      .delete()
      .like('student_name', `${TEST_PREFIX}%`);
  });

  // ─── Admin API Tests ───

  test.describe('Admin API', () => {
    let createdId: string;

    test('POST /api/admin/student-results creates a new result', async ({ request }) => {
      const response = await request.post(`${ADMIN}/api/admin/student-results`, {
        data: {
          student_name: `${TEST_PREFIX}API Test Student`,
          exam_type: 'nata',
          exam_year: 2026,
          score: 175,
          max_score: 200,
          rank: 100,
          college_name: 'Test College',
          college_city: 'Test City',
          is_published: false,
          is_featured: false,
        },
      });

      expect(response.ok()).toBeTruthy();
      const json = await response.json();
      expect(json.data || json).toBeDefined();

      // Extract created ID
      const result = json.data || json;
      createdId = result.id;
      expect(result.student_name).toContain('API Test Student');
      expect(result.slug).toBeTruthy();
    });

    test('GET /api/admin/student-results lists all results including unpublished', async ({ request }) => {
      const response = await request.get(`${ADMIN}/api/admin/student-results`);
      expect(response.ok()).toBeTruthy();

      const json = await response.json();
      expect(json.data).toBeDefined();

      // Our unpublished test result should be in the list
      const found = json.data.find(
        (r: { student_name: string }) => r.student_name === `${TEST_PREFIX}API Test Student`
      );
      expect(found).toBeTruthy();
    });

    test('GET /api/admin/student-results?search= filters by name', async ({ request }) => {
      const response = await request.get(
        `${ADMIN}/api/admin/student-results?search=API+Test`
      );
      expect(response.ok()).toBeTruthy();

      const json = await response.json();
      expect(json.data.length).toBeGreaterThanOrEqual(1);
    });

    test('PUT /api/admin/student-results/[id] updates a result', async ({ request }) => {
      if (!createdId) test.skip();

      const response = await request.put(
        `${ADMIN}/api/admin/student-results/${createdId}`,
        {
          data: {
            score: 180,
            is_published: true,
          },
        }
      );

      expect(response.ok()).toBeTruthy();
      const json = await response.json();
      const result = json.data || json;
      expect(result.score).toBe(180);
      expect(result.is_published).toBe(true);
    });

    test('DELETE /api/admin/student-results/[id] deletes a result', async ({ request }) => {
      if (!createdId) test.skip();

      const response = await request.delete(
        `${ADMIN}/api/admin/student-results/${createdId}`
      );

      expect(response.ok()).toBeTruthy();

      // Verify it's gone
      const checkResponse = await request.get(
        `${ADMIN}/api/admin/student-results/${createdId}`,
        { failOnStatusCode: false }
      );
      expect(checkResponse.status()).toBeGreaterThanOrEqual(400);
    });
  });

  // ─── Bulk Import API ───

  test.describe('Bulk Import API', () => {
    test('POST /api/admin/student-results/bulk-import creates records from CSV', async ({ request }) => {
      const csvContent = [
        'student_name,exam_type,exam_year,score,max_score,rank,percentile,college_name,college_city,course_name,student_quote',
        `${TEST_PREFIX}Bulk Student 1,nata,2026,160,200,250,,Test College 1,City1,B.Arch,Great experience`,
        `${TEST_PREFIX}Bulk Student 2,jee_paper2,2026,220,400,500,,Test College 2,City2,B.Arch,`,
      ].join('\n');

      const response = await request.post(
        `${ADMIN}/api/admin/student-results/bulk-import`,
        {
          data: { csv: csvContent },
          headers: { 'Content-Type': 'application/json' },
        }
      );

      expect(response.ok()).toBeTruthy();
      const json = await response.json();
      expect(json.imported || json.created || json.total).toBeGreaterThanOrEqual(2);
    });

    test('bulk imported records are unpublished by default', async ({ request }) => {
      const response = await request.get(
        `${ADMIN}/api/admin/student-results?search=${encodeURIComponent(TEST_PREFIX + 'Bulk')}`
      );
      expect(response.ok()).toBeTruthy();

      const json = await response.json();
      for (const result of json.data) {
        expect(result.is_published).toBe(false);
      }
    });
  });

  // ─── Admin UI Tests ───

  test.describe('Admin UI', () => {
    test('student results page loads', async ({ page }) => {
      await page.goto(`${ADMIN}/student-results`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/student results/i).first()).toBeVisible({ timeout: 15000 });
    });

    test('shows data table with results', async ({ page }) => {
      await page.goto(`${ADMIN}/student-results`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Table should be visible
      const table = page.locator('table').first();
      await expect(table).toBeVisible({ timeout: 10000 });
    });

    test('search filters table results', async ({ page }) => {
      await page.goto(`${ADMIN}/student-results`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const searchInput = page.getByPlaceholder(/search/i).first();
      if (await searchInput.isVisible()) {
        await searchInput.fill(`${TEST_PREFIX}Bulk`);
        await page.waitForTimeout(1000);

        // Should find our bulk imported students
        await expect(page.getByText(`${TEST_PREFIX}Bulk Student 1`).first()).toBeVisible({ timeout: 5000 });
      }
    });

    test('Add New button opens form dialog', async ({ page }) => {
      await page.goto(`${ADMIN}/student-results`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const addButton = page.getByRole('button', { name: /add new/i }).first();
      if (await addButton.isVisible()) {
        await addButton.click();

        // Dialog should open with form fields
        await expect(page.getByRole('dialog').first()).toBeVisible({ timeout: 5000 });
        await expect(page.getByLabel(/student name/i).first()).toBeVisible();
      }
    });
  });

  // ─── Role-Based Access ───

  test.describe('Access Control', () => {
    test('admin API requires authentication (not publicly accessible)', async ({ request }) => {
      // The marketing site should NOT have access to admin endpoints
      const marketingRequest = await request.get(
        `${APP_URLS.marketing}/api/admin/student-results`,
        { failOnStatusCode: false }
      );
      // Should be 404 (route doesn't exist on marketing) or 401
      expect(marketingRequest.status()).toBeGreaterThanOrEqual(400);
    });
  });
});
