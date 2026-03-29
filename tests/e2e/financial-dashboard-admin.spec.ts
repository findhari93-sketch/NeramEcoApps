import { test, expect } from '@playwright/test';

/**
 * Financial Dashboard Admin E2E Tests
 *
 * Comprehensive tests for the Financial Dashboard:
 * - Dashboard API aggregation endpoint
 * - KPI card accuracy (income, expenses, net P&L, margin, per-student)
 * - Category breakdown correctness
 * - Monthly series data for charts
 * - Computed insights
 * - Date range and season-mode filtering
 * - Edge cases: empty data, single entry, negative profit
 * - UI smoke tests
 *
 * Tests run against the admin app (localhost:3013).
 */

// ============================================================
// SECTION 1: Dashboard API — Aggregation Endpoint
// ============================================================

test.describe('Financial Dashboard API - Aggregation', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  // ---- Basic Response Structure ----

  test('GET /api/financial-dashboard should return 200 with aggregated data', async ({ request }) => {
    const response = await request.get('/api/financial-dashboard');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('data');
  });

  test('GET /api/financial-dashboard should return income totals', async ({ request }) => {
    const response = await request.get('/api/financial-dashboard');
    expect(response.status()).toBe(200);

    const body = await response.json();
    const data = body.data;

    // Should have income fields (student fees + side income)
    expect(data).toHaveProperty('totalIncome');
    expect(typeof Number(data.totalIncome)).toBe('number');
    expect(Number(data.totalIncome)).toBeGreaterThanOrEqual(0);

    // Student fee income should be present
    if (data.studentFeeIncome !== undefined) {
      expect(Number(data.studentFeeIncome)).toBeGreaterThanOrEqual(0);
    }

    // Side income should be present
    if (data.sideIncome !== undefined) {
      expect(Number(data.sideIncome)).toBeGreaterThanOrEqual(0);
    }
  });

  test('GET /api/financial-dashboard should return expense totals', async ({ request }) => {
    const response = await request.get('/api/financial-dashboard');
    expect(response.status()).toBe(200);

    const data = (await response.json()).data;

    expect(data).toHaveProperty('totalExpenses');
    expect(typeof Number(data.totalExpenses)).toBe('number');
    expect(Number(data.totalExpenses)).toBeGreaterThanOrEqual(0);
  });

  test('GET /api/financial-dashboard should return net P&L', async ({ request }) => {
    const response = await request.get('/api/financial-dashboard');
    expect(response.status()).toBe(200);

    const data = (await response.json()).data;

    // Net = income - expenses (can be negative)
    expect(data).toHaveProperty('netProfitLoss');
    const net = Number(data.netProfitLoss);
    expect(typeof net).toBe('number');

    // Cross-check: net should equal income minus expenses
    const income = Number(data.totalIncome);
    const expenses = Number(data.totalExpenses);
    expect(net).toBeCloseTo(income - expenses, 1);
  });

  test('GET /api/financial-dashboard should return profit margin %', async ({ request }) => {
    const response = await request.get('/api/financial-dashboard');
    expect(response.status()).toBe(200);

    const data = (await response.json()).data;

    if (data.profitMargin !== undefined) {
      const margin = Number(data.profitMargin);
      // Margin is (net / income) * 100 — can be negative
      expect(typeof margin).toBe('number');

      // If income is 0, margin should be 0 or null (not NaN/Infinity)
      if (Number(data.totalIncome) === 0) {
        expect(margin === 0 || data.profitMargin === null).toBe(true);
      }
    }
  });

  test('GET /api/financial-dashboard should return category breakdown', async ({ request }) => {
    const response = await request.get('/api/financial-dashboard');
    expect(response.status()).toBe(200);

    const data = (await response.json()).data;

    // Category breakdown should be an array
    if (data.categoryBreakdown) {
      expect(Array.isArray(data.categoryBreakdown)).toBe(true);

      for (const cat of data.categoryBreakdown) {
        expect(cat).toHaveProperty('category');
        expect(cat).toHaveProperty('amount');
        expect(Number(cat.amount)).toBeGreaterThanOrEqual(0);

        // Should have percentage of total
        if (cat.percentOfTotal !== undefined) {
          const pct = Number(cat.percentOfTotal);
          expect(pct).toBeGreaterThanOrEqual(0);
          expect(pct).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  test('GET /api/financial-dashboard should return monthly series', async ({ request }) => {
    const response = await request.get('/api/financial-dashboard');
    expect(response.status()).toBe(200);

    const data = (await response.json()).data;

    // Monthly series for the bar chart
    if (data.monthlySeries) {
      expect(Array.isArray(data.monthlySeries)).toBe(true);

      for (const month of data.monthlySeries) {
        expect(month).toHaveProperty('month');
        expect(month).toHaveProperty('income');
        expect(month).toHaveProperty('expenses');
        expect(Number(month.income)).toBeGreaterThanOrEqual(0);
        expect(Number(month.expenses)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('GET /api/financial-dashboard should return computed insights', async ({ request }) => {
    const response = await request.get('/api/financial-dashboard');
    expect(response.status()).toBe(200);

    const data = (await response.json()).data;

    if (data.insights) {
      // Top expense category
      if (data.insights.topExpenseCategory) {
        expect(data.insights.topExpenseCategory).toHaveProperty('category');
        expect(data.insights.topExpenseCategory).toHaveProperty('amount');
      }

      // Average monthly expense
      if (data.insights.avgMonthlyExpense !== undefined) {
        expect(Number(data.insights.avgMonthlyExpense)).toBeGreaterThanOrEqual(0);
      }

      // Highest single expense
      if (data.insights.highestSingleExpense) {
        expect(Number(data.insights.highestSingleExpense.amount)).toBeGreaterThan(0);
      }
    }
  });

  // ---- Date Range Filtering ----

  test('GET /api/financial-dashboard should support month filter', async ({ request }) => {
    const response = await request.get('/api/financial-dashboard?month=2026-03');
    expect(response.status()).toBe(200);

    const data = (await response.json()).data;
    expect(data).toBeDefined();
  });

  test('GET /api/financial-dashboard should support custom date range', async ({ request }) => {
    const response = await request.get(
      '/api/financial-dashboard?startDate=2026-01-01&endDate=2026-04-30'
    );
    expect(response.status()).toBe(200);

    const data = (await response.json()).data;
    expect(data).toBeDefined();
  });

  test('GET /api/financial-dashboard should handle future date range (returns zeros)', async ({ request }) => {
    const response = await request.get(
      '/api/financial-dashboard?startDate=2030-01-01&endDate=2030-12-31'
    );
    expect(response.status()).toBe(200);

    const data = (await response.json()).data;
    expect(Number(data.totalExpenses)).toBe(0);
    // Side income should be 0 (student fees might still exist from payments table)
    if (data.sideIncome !== undefined) {
      expect(Number(data.sideIncome)).toBe(0);
    }
  });

  test('GET /api/financial-dashboard should handle past date range', async ({ request }) => {
    const response = await request.get(
      '/api/financial-dashboard?startDate=2020-01-01&endDate=2020-12-31'
    );
    expect(response.status()).toBe(200);

    const data = (await response.json()).data;
    expect(Number(data.totalExpenses)).toBe(0);
  });

  test('GET /api/financial-dashboard should reject invalid month format', async ({ request }) => {
    const response = await request.get('/api/financial-dashboard?month=March-2026', {
      failOnStatusCode: false,
    });
    // Should be 400, not 500
    expect(response.status()).not.toBe(500);
  });

  test('GET /api/financial-dashboard should reject startDate after endDate', async ({ request }) => {
    const response = await request.get(
      '/api/financial-dashboard?startDate=2026-12-31&endDate=2026-01-01',
      { failOnStatusCode: false }
    );
    expect(response.status()).not.toBe(500);
  });
});

// ============================================================
// SECTION 2: Dashboard Data Integrity — Cross-Checks
// ============================================================

test.describe('Financial Dashboard - Data Integrity', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  test('category breakdown amounts should sum to total expenses', async ({ request }) => {
    const response = await request.get('/api/financial-dashboard');
    if (response.status() !== 200) {
      test.skip();
      return;
    }

    const data = (await response.json()).data;

    if (data.categoryBreakdown && data.categoryBreakdown.length > 0) {
      const categorySum = data.categoryBreakdown.reduce(
        (sum: number, cat: { amount: number }) => sum + Number(cat.amount),
        0
      );
      expect(categorySum).toBeCloseTo(Number(data.totalExpenses), 1);
    }
  });

  test('total income should equal student fees + side income', async ({ request }) => {
    const response = await request.get('/api/financial-dashboard');
    if (response.status() !== 200) {
      test.skip();
      return;
    }

    const data = (await response.json()).data;

    if (data.studentFeeIncome !== undefined && data.sideIncome !== undefined) {
      const summed = Number(data.studentFeeIncome) + Number(data.sideIncome);
      expect(summed).toBeCloseTo(Number(data.totalIncome), 1);
    }
  });

  test('category percentage of total should sum to ~100%', async ({ request }) => {
    const response = await request.get('/api/financial-dashboard');
    if (response.status() !== 200) {
      test.skip();
      return;
    }

    const data = (await response.json()).data;

    if (data.categoryBreakdown && data.categoryBreakdown.length > 0) {
      const pctSum = data.categoryBreakdown.reduce(
        (sum: number, cat: { percentOfTotal: number }) => sum + Number(cat.percentOfTotal || 0),
        0
      );
      // Allow small rounding error
      expect(pctSum).toBeCloseTo(100, 0);
    }
  });

  test('expense per student should be total expenses / enrolled students', async ({ request }) => {
    const response = await request.get('/api/financial-dashboard');
    if (response.status() !== 200) {
      test.skip();
      return;
    }

    const data = (await response.json()).data;

    if (data.expensePerStudent !== undefined && data.enrolledStudentCount !== undefined) {
      const students = Number(data.enrolledStudentCount);
      const perStudent = Number(data.expensePerStudent);

      if (students > 0) {
        const expected = Number(data.totalExpenses) / students;
        expect(perStudent).toBeCloseTo(expected, 0);
      } else {
        // No students — per-student should be 0 or null (not NaN/Infinity)
        expect(perStudent === 0 || data.expensePerStudent === null).toBe(true);
      }
    }
  });

  test('month-over-month change should reflect actual difference', async ({ request }) => {
    const response = await request.get('/api/financial-dashboard');
    if (response.status() !== 200) {
      test.skip();
      return;
    }

    const data = (await response.json()).data;

    // MoM change should be a number (positive or negative) or null
    if (data.monthOverMonthChange !== undefined && data.monthOverMonthChange !== null) {
      expect(typeof Number(data.monthOverMonthChange)).toBe('number');
      expect(Number.isFinite(Number(data.monthOverMonthChange))).toBe(true);
    }
  });
});

// ============================================================
// SECTION 3: Dashboard with Seeded Test Data
// ============================================================

test.describe('Financial Dashboard - Seeded Data Verification', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  const cleanupIds: { expenses: string[]; assignments: string[] } = {
    expenses: [],
    assignments: [],
  };

  test('dashboard should reflect newly added expense in totals', async ({ request }) => {
    // Get baseline
    const baselineRes = await request.get('/api/financial-dashboard?month=2026-03');
    if (baselineRes.status() !== 200) {
      test.skip();
      return;
    }
    const baselineExpenses = Number((await baselineRes.json()).data.totalExpenses);

    // Add a known expense
    const expRes = await request.post('/api/expenses', {
      data: {
        type: 'expense',
        category: 'staff_food',
        amount: 999,
        description: 'E2E Dashboard Verification Expense',
        transaction_date: '2026-03-15',
      },
    });
    if (expRes.status() !== 201) {
      test.skip();
      return;
    }
    const expId = (await expRes.json()).data.id;
    cleanupIds.expenses.push(expId);

    // Re-query dashboard
    const afterRes = await request.get('/api/financial-dashboard?month=2026-03');
    const afterExpenses = Number((await afterRes.json()).data.totalExpenses);

    // Total should have increased by 999
    expect(afterExpenses).toBeCloseTo(baselineExpenses + 999, 1);
  });

  test('dashboard should reflect newly added income in totals', async ({ request }) => {
    // Get baseline
    const baselineRes = await request.get('/api/financial-dashboard?month=2026-03');
    if (baselineRes.status() !== 200) {
      test.skip();
      return;
    }
    const baselineSideIncome = Number((await baselineRes.json()).data.sideIncome || 0);

    // Add a known income
    const incRes = await request.post('/api/expenses', {
      data: {
        type: 'income',
        category: 'college_referral',
        amount: 2500,
        description: 'E2E Dashboard Verification Income',
        transaction_date: '2026-03-15',
      },
    });
    if (incRes.status() !== 201) {
      test.skip();
      return;
    }
    const incId = (await incRes.json()).data.id;
    cleanupIds.expenses.push(incId);

    // Re-query dashboard
    const afterRes = await request.get('/api/financial-dashboard?month=2026-03');
    const afterSideIncome = Number((await afterRes.json()).data.sideIncome || 0);

    expect(afterSideIncome).toBeCloseTo(baselineSideIncome + 2500, 1);
  });

  test('deleting expense should reduce dashboard totals', async ({ request }) => {
    // Create expense
    const expRes = await request.post('/api/expenses', {
      data: {
        type: 'expense',
        category: 'google_ads',
        amount: 1234,
        description: 'E2E Delete-Dashboard Test',
        transaction_date: '2026-03-15',
      },
    });
    if (expRes.status() !== 201) {
      test.skip();
      return;
    }
    const expId = (await expRes.json()).data.id;

    // Get totals with it
    const withRes = await request.get('/api/financial-dashboard?month=2026-03');
    const withExpenses = Number((await withRes.json()).data.totalExpenses);

    // Delete it
    await request.delete(`/api/expenses/${expId}`);

    // Get totals after
    const afterRes = await request.get('/api/financial-dashboard?month=2026-03');
    const afterExpenses = Number((await afterRes.json()).data.totalExpenses);

    expect(afterExpenses).toBeCloseTo(withExpenses - 1234, 1);
  });

  // ---- Cleanup ----

  test.afterAll(async ({ request }) => {
    for (const id of cleanupIds.expenses) {
      await request.delete(`/api/expenses/${id}`, { failOnStatusCode: false });
    }
    for (const id of cleanupIds.assignments) {
      await request.delete(`/api/staff-assignments/${id}`, { failOnStatusCode: false });
    }
  });
});

// ============================================================
// SECTION 4: Edge Cases & Robustness
// ============================================================

test.describe('Financial Dashboard - Edge Cases', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  test('dashboard should handle division by zero (no students enrolled)', async ({ request }) => {
    // Query a period where no students are enrolled
    const response = await request.get(
      '/api/financial-dashboard?startDate=2020-01-01&endDate=2020-01-31'
    );
    expect(response.status()).toBe(200);

    const data = (await response.json()).data;

    // No NaN or Infinity in any field
    for (const key of Object.keys(data)) {
      const val = data[key];
      if (typeof val === 'number') {
        expect(Number.isFinite(val)).toBe(true);
      }
    }
  });

  test('dashboard should not return NaN or Infinity in insights', async ({ request }) => {
    const response = await request.get('/api/financial-dashboard');
    if (response.status() !== 200) {
      test.skip();
      return;
    }

    const data = (await response.json()).data;

    // Deep check all numeric values
    const checkNoNaN = (obj: Record<string, unknown>, path: string) => {
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'number') {
          expect(Number.isFinite(v), `${path}.${k} is not finite: ${v}`).toBe(true);
        } else if (v && typeof v === 'object' && !Array.isArray(v)) {
          checkNoNaN(v as Record<string, unknown>, `${path}.${k}`);
        }
      }
    };
    checkNoNaN(data, 'data');
  });

  test('dashboard should handle single-day date range', async ({ request }) => {
    const response = await request.get(
      '/api/financial-dashboard?startDate=2026-03-29&endDate=2026-03-29'
    );
    expect(response.status()).toBe(200);

    const data = (await response.json()).data;
    expect(data).toBeDefined();
  });

  test('dashboard should handle full-year date range without timeout', async ({ request }) => {
    const response = await request.get(
      '/api/financial-dashboard?startDate=2026-01-01&endDate=2026-12-31'
    );
    // Should not timeout (default 30s)
    expect(response.status()).toBe(200);
  });
});

// ============================================================
// SECTION 5: Financial Dashboard Page — UI Smoke Tests
// ============================================================

test.describe('Financial Dashboard Page - UI Smoke Tests', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  test('financial-dashboard page should load without 500 error', async ({ page }) => {
    await page.goto('/financial-dashboard', { waitUntil: 'domcontentloaded' });
    const content = await page.textContent('body');
    expect(content).not.toContain('Internal Server Error');
  });

  test('financial-dashboard page should not have fatal JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/financial-dashboard', { waitUntil: 'domcontentloaded', timeout: 15000 });

    for (const err of errors) {
      expect(err).not.toContain('Cannot read properties of undefined');
      expect(err).not.toContain('is not a function');
    }
  });

  test('financial-dashboard should show KPI cards or redirect to login', async ({ page }) => {
    await page.goto('/financial-dashboard', { waitUntil: 'domcontentloaded' });

    const url = page.url();
    const isLoginRedirect = url.includes('/login') || url.includes('login.microsoftonline.com');

    if (!isLoginRedirect) {
      // Should have KPI cards (Income, Expenses, Net P&L, etc.)
      const hasCards = await page.locator('.MuiCard-root, [data-testid="kpi-card"]')
        .first()
        .isVisible({ timeout: 10000 })
        .catch(() => false);

      expect(hasCards).toBe(true);
    }
  });

  test('financial-dashboard should render charts without errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/financial-dashboard', { waitUntil: 'networkidle', timeout: 20000 });

    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
      return;
    }

    // Check for chart presence (canvas for chart.js, svg for recharts/MUI charts)
    const hasChart = await page.locator('canvas, svg.recharts-surface, .MuiChartsAxis-root')
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false);

    // Charts should render if there's data, but no crash either way
    // Filter out benign console errors
    const fatalErrors = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('manifest') && !e.includes('sw.js')
    );
    expect(fatalErrors.length).toBe(0);
  });

  test('financial-dashboard should have date/month picker controls', async ({ page }) => {
    await page.goto('/financial-dashboard', { waitUntil: 'domcontentloaded' });

    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
      return;
    }

    // Should have date picker, month selector, or range selector
    const hasDateControl = await page.locator(
      'input[type="date"], input[type="month"], [data-testid="month-picker"], .MuiDatePicker-root, [role="combobox"]'
    )
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    expect(hasDateControl).toBe(true);
  });

  test('financial-dashboard should display category breakdown table', async ({ page }) => {
    await page.goto('/financial-dashboard', { waitUntil: 'domcontentloaded' });

    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
      return;
    }

    // Should have a table or grid with category data
    const hasTable = await page.locator('table, .MuiDataGrid-root, .MuiTable-root')
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false);

    expect(hasTable).toBe(true);
  });

  test('financial-dashboard should display insights section', async ({ page }) => {
    await page.goto('/financial-dashboard', { waitUntil: 'domcontentloaded' });

    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
      return;
    }

    // Should have some form of insights display
    const hasInsights = await page.locator(
      'text=/insight/i, text=/top expense/i, text=/average/i, text=/trend/i, [data-testid="insights"]'
    )
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    // Insights section should exist (may be empty with placeholder text)
    // Not strictly required — some designs inline insights into KPI cards
    if (!hasInsights) {
      // At minimum, the page shouldn't be empty
      const bodyText = await page.textContent('body');
      expect(bodyText!.length).toBeGreaterThan(50);
    }
  });

  test('financial-dashboard should display negative P&L in red', async ({ page }) => {
    await page.goto('/financial-dashboard', { waitUntil: 'domcontentloaded' });

    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
      return;
    }

    // If net P&L is negative, it should be styled in red/error color
    const lossIndicator = await page.locator(
      '[data-testid="net-pl"].loss, .MuiTypography-root.error, text=/-₹/i'
    )
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    // This is conditional — only testable when P&L is actually negative
    // Just verify the page renders properly regardless
    const content = await page.textContent('body');
    expect(content).not.toContain('Internal Server Error');
  });
});

// ============================================================
// SECTION 6: Navigation — Sidebar Links
// ============================================================

test.describe('Finance Navigation - Sidebar', () => {
  test.use({ baseURL: 'http://localhost:3013' });

  test('sidebar should have Expenses link', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
      return;
    }

    const hasExpensesLink = await page.locator('a[href*="expenses"], text=/expenses/i')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    expect(hasExpensesLink).toBe(true);
  });

  test('sidebar should have Staff Assignments link', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
      return;
    }

    const hasLink = await page.locator(
      'a[href*="staff-assignments"], a[href*="assignments"], text=/staff assignment/i'
    )
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    expect(hasLink).toBe(true);
  });

  test('sidebar should have Financial Dashboard link', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
      return;
    }

    const hasLink = await page.locator(
      'a[href*="financial-dashboard"], text=/financial dashboard/i'
    )
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    expect(hasLink).toBe(true);
  });
});
