# Expense Tracker & Financial Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an expense tracking system with staff assignment grouping, receipt uploads, settlement tracking, and a P&L financial dashboard in the admin app.

**Architecture:** Two new DB tables (`expense_assignments`, `financial_transactions`) with a unified ledger approach. Student fee income is read from the existing `payments` table at query time (not duplicated). Three new admin pages: Expenses list, Staff Assignments (with detail view), and Financial Dashboard with charts. Receipt photos stored in Supabase Storage.

**Tech Stack:** Next.js 14, MUI v5, recharts (new dep for charts), Supabase (PostgreSQL + Storage), TypeScript

**Spec:** `docs/superpowers/specs/2026-03-29-expense-tracker-financial-dashboard-design.md`

---

## File Structure

### New files to create:
```
supabase/migrations/20260330_expense_tracker.sql          # DB migration

packages/database/src/types/expenses.ts                    # TypeScript types
packages/database/src/queries/expenses.ts                  # Query functions
packages/database/src/queries/expense-assignments.ts       # Assignment queries

apps/admin/src/app/api/expenses/route.ts                   # List + Create expenses
apps/admin/src/app/api/expenses/[id]/route.ts              # Get + Update + Delete expense
apps/admin/src/app/api/expenses/bulk-settle/route.ts       # Bulk settle
apps/admin/src/app/api/expenses/upload-receipt/route.ts    # Receipt upload
apps/admin/src/app/api/staff-assignments/route.ts          # List + Create assignments
apps/admin/src/app/api/staff-assignments/[id]/route.ts     # Get + Update assignment
apps/admin/src/app/api/staff-assignments/[id]/settle/route.ts  # Settle assignment
apps/admin/src/app/api/financial-dashboard/route.ts        # Dashboard aggregations

apps/admin/src/app/(dashboard)/expenses/page.tsx           # Expenses list page
apps/admin/src/app/(dashboard)/staff-assignments/page.tsx  # Assignments list page
apps/admin/src/app/(dashboard)/staff-assignments/[id]/page.tsx  # Assignment detail
apps/admin/src/app/(dashboard)/financial-dashboard/page.tsx     # P&L dashboard

apps/admin/src/components/expenses/AddExpenseDialog.tsx     # Add/edit expense dialog
apps/admin/src/components/expenses/AddIncomeDialog.tsx      # Add/edit income dialog
apps/admin/src/components/expenses/AddAssignmentDialog.tsx  # Create assignment dialog
apps/admin/src/components/expenses/ExpenseConstants.ts      # Shared constants (categories, statuses)
```

### Files to modify:
```
packages/database/src/types/index.ts                       # Export new types
packages/database/src/queries/index.ts                     # Export new queries
apps/admin/src/components/Sidebar.tsx                       # Add 3 nav items
apps/admin/package.json                                     # Add recharts dependency
```

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260330_expense_tracker.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- ============================================
-- Expense Tracker & Financial Dashboard
-- Two tables: expense_assignments + financial_transactions
-- ============================================

-- 1. expense_assignments — staff field trips
CREATE TABLE IF NOT EXISTS expense_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  staff_name TEXT NOT NULL,
  city TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'settled')),
  settled_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expense_assignments_staff ON expense_assignments(staff_name);
CREATE INDEX idx_expense_assignments_status ON expense_assignments(status);
CREATE INDEX idx_expense_assignments_created ON expense_assignments(created_at DESC);

ALTER TABLE expense_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read assignments"
  ON expense_assignments FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role manages assignments"
  ON expense_assignments FOR ALL
  USING (auth.role() = 'service_role');

-- 2. financial_transactions — unified expense + side income ledger
CREATE TABLE IF NOT EXISTS financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  category TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  assignment_id UUID REFERENCES expense_assignments(id) ON DELETE SET NULL,
  settlement_status TEXT DEFAULT 'pending' CHECK (settlement_status IN ('pending', 'settled')),
  settled_at TIMESTAMPTZ,
  receipt_url TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fin_txn_type ON financial_transactions(type);
CREATE INDEX idx_fin_txn_category ON financial_transactions(category);
CREATE INDEX idx_fin_txn_date ON financial_transactions(transaction_date DESC);
CREATE INDEX idx_fin_txn_assignment ON financial_transactions(assignment_id);
CREATE INDEX idx_fin_txn_settlement ON financial_transactions(settlement_status);
CREATE INDEX idx_fin_txn_type_date ON financial_transactions(type, transaction_date DESC);

ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read transactions"
  ON financial_transactions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role manages transactions"
  ON financial_transactions FOR ALL
  USING (auth.role() = 'service_role');
```

- [ ] **Step 2: Apply migration to staging**

Run: `mcp__supabase-staging__apply_migration` with name `20260330_expense_tracker` and the SQL above.

- [ ] **Step 3: Verify tables exist on staging**

Run: `mcp__supabase-staging__execute_sql` with:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('expense_assignments', 'financial_transactions');
```
Expected: 2 rows returned.

- [ ] **Step 4: Apply migration to production**

Run: `mcp__supabase-prod__apply_migration` with the same SQL.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260330_expense_tracker.sql
git commit -m "feat(db): add expense_assignments and financial_transactions tables"
```

---

## Task 2: TypeScript Types & Constants

**Files:**
- Create: `packages/database/src/types/expenses.ts`
- Create: `apps/admin/src/components/expenses/ExpenseConstants.ts`
- Modify: `packages/database/src/types/index.ts`

- [ ] **Step 1: Create expense types**

Create `packages/database/src/types/expenses.ts`:

```typescript
export type ExpenseAssignmentStatus = 'active' | 'completed' | 'settled';
export type FinancialTransactionType = 'expense' | 'income';
export type SettlementStatus = 'pending' | 'settled';

export type ExpenseCategory =
  | 'staff_travel'
  | 'staff_food'
  | 'staff_accommodation'
  | 'google_ads'
  | 'staff_salary'
  | 'exam_center'
  | 'cloud_tech'
  | 'office_bills'
  | 'equipment'
  | 'misc_expense';

export type IncomeCategory =
  | 'college_referral'
  | 'website_listing'
  | 'misc_income';

export type TransactionCategory = ExpenseCategory | IncomeCategory;

export interface ExpenseAssignment {
  id: string;
  title: string;
  staff_name: string;
  city: string | null;
  start_date: string;
  end_date: string | null;
  status: ExpenseAssignmentStatus;
  settled_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface FinancialTransaction {
  id: string;
  type: FinancialTransactionType;
  category: TransactionCategory;
  amount: number;
  description: string;
  transaction_date: string;
  assignment_id: string | null;
  settlement_status: SettlementStatus;
  settled_at: string | null;
  receipt_url: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateFinancialTransactionInput {
  type: FinancialTransactionType;
  category: TransactionCategory;
  amount: number;
  description: string;
  transaction_date: string;
  assignment_id?: string | null;
  receipt_url?: string | null;
  notes?: string | null;
  created_by: string;
}

export interface CreateExpenseAssignmentInput {
  title: string;
  staff_name: string;
  city?: string | null;
  start_date: string;
  end_date?: string | null;
  notes?: string | null;
  created_by: string;
}
```

- [ ] **Step 2: Create constants file**

Create `apps/admin/src/components/expenses/ExpenseConstants.ts`:

```typescript
export const EXPENSE_CATEGORIES = [
  { value: 'staff_travel', label: 'Staff Travel', description: 'Transport, auto, bus, train, flight' },
  { value: 'staff_food', label: 'Staff Food', description: 'Food, tea, snacks, meals' },
  { value: 'staff_accommodation', label: 'Staff Accommodation', description: 'Hotel, room rent' },
  { value: 'google_ads', label: 'Google Ads', description: 'Google Ads / digital marketing' },
  { value: 'staff_salary', label: 'Staff Salary', description: 'Staff salaries' },
  { value: 'exam_center', label: 'Exam Center', description: 'Exam center visit expenses' },
  { value: 'cloud_tech', label: 'Cloud & Tech', description: 'Supabase, Vercel, domains, subscriptions' },
  { value: 'office_bills', label: 'Office & Bills', description: 'Internet, VPA, utilities' },
  { value: 'equipment', label: 'Equipment', description: 'Hardware, devices' },
  { value: 'misc_expense', label: 'Miscellaneous', description: 'Other expenses' },
] as const;

export const INCOME_CATEGORIES = [
  { value: 'college_referral', label: 'College Referral', description: 'Commission for student referrals' },
  { value: 'website_listing', label: 'Website Listing', description: 'College website listing fees' },
  { value: 'misc_income', label: 'Miscellaneous', description: 'Other side income' },
] as const;

export const ASSIGNMENT_STATUSES = [
  { value: 'active', label: 'Active', color: 'info' as const },
  { value: 'completed', label: 'Completed', color: 'warning' as const },
  { value: 'settled', label: 'Settled', color: 'success' as const },
] as const;

export function getCategoryLabel(category: string): string {
  const all = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
  return all.find(c => c.value === category)?.label || category;
}

export function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    staff_travel: '#1976D2',
    staff_food: '#E64A19',
    staff_accommodation: '#7B1FA2',
    google_ads: '#0097A7',
    staff_salary: '#388E3C',
    exam_center: '#F57C00',
    cloud_tech: '#5C6BC0',
    office_bills: '#455A64',
    equipment: '#795548',
    misc_expense: '#9E9E9E',
    college_referral: '#2E7D32',
    website_listing: '#1565C0',
    misc_income: '#43A047',
  };
  return colors[category] || '#9E9E9E';
}

export function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}
```

- [ ] **Step 3: Export types from index**

Add to end of `packages/database/src/types/index.ts`:

```typescript
export * from './expenses';
```

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/types/expenses.ts packages/database/src/types/index.ts apps/admin/src/components/expenses/ExpenseConstants.ts
git commit -m "feat(db): add expense tracker TypeScript types and constants"
```

---

## Task 3: Database Query Functions

**Files:**
- Create: `packages/database/src/queries/expenses.ts`
- Create: `packages/database/src/queries/expense-assignments.ts`
- Modify: `packages/database/src/queries/index.ts`

- [ ] **Step 1: Create expense-assignments query file**

Create `packages/database/src/queries/expense-assignments.ts`:

```typescript
// @ts-nocheck
import { getSupabaseAdminClient } from '../client';
import type { ExpenseAssignment, CreateExpenseAssignmentInput, ExpenseAssignmentStatus } from '../types';

export interface ListAssignmentsOptions {
  status?: ExpenseAssignmentStatus;
  staffName?: string;
  city?: string;
  limit?: number;
  offset?: number;
}

export async function listExpenseAssignments(options: ListAssignmentsOptions = {}) {
  const supabase = getSupabaseAdminClient();
  const { status, staffName, city, limit = 25, offset = 0 } = options;

  let query = supabase
    .from('expense_assignments')
    .select('*', { count: 'exact' });

  if (status) query = query.eq('status', status);
  if (staffName) query = query.ilike('staff_name', `%${staffName}%`);
  if (city) query = query.ilike('city', `%${city}%`);

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { assignments: data || [], count: count || 0 };
}

export async function getExpenseAssignmentById(id: string) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('expense_assignments')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as ExpenseAssignment;
}

export async function createExpenseAssignment(input: CreateExpenseAssignmentInput) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('expense_assignments')
    .insert(input)
    .select()
    .single();

  if (error) throw error;
  return data as ExpenseAssignment;
}

export async function updateExpenseAssignment(id: string, updates: Partial<ExpenseAssignment>) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('expense_assignments')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as ExpenseAssignment;
}

export async function settleAssignment(id: string) {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();

  // Update assignment status
  const { data: assignment, error: assignmentError } = await supabase
    .from('expense_assignments')
    .update({ status: 'settled', settled_at: now, updated_at: now })
    .eq('id', id)
    .select()
    .single();

  if (assignmentError) throw assignmentError;

  // Settle all linked transactions
  const { error: txnError } = await supabase
    .from('financial_transactions')
    .update({ settlement_status: 'settled', settled_at: now, updated_at: now })
    .eq('assignment_id', id)
    .eq('settlement_status', 'pending');

  if (txnError) throw txnError;

  return assignment as ExpenseAssignment;
}

export async function getAssignmentExpenseSummary(id: string) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('financial_transactions')
    .select('category, amount, settlement_status')
    .eq('assignment_id', id);

  if (error) throw error;

  const summary = {
    total: 0,
    by_category: {} as Record<string, number>,
    pending_count: 0,
    settled_count: 0,
    expense_count: data?.length || 0,
  };

  for (const txn of data || []) {
    summary.total += Number(txn.amount);
    summary.by_category[txn.category] = (summary.by_category[txn.category] || 0) + Number(txn.amount);
    if (txn.settlement_status === 'pending') summary.pending_count++;
    else summary.settled_count++;
  }

  return summary;
}
```

- [ ] **Step 2: Create financial transactions query file**

Create `packages/database/src/queries/expenses.ts`:

```typescript
// @ts-nocheck
import { getSupabaseAdminClient } from '../client';
import type { FinancialTransaction, CreateFinancialTransactionInput, FinancialTransactionType, SettlementStatus } from '../types';

export interface ListTransactionsOptions {
  type?: FinancialTransactionType;
  category?: string;
  assignmentId?: string;
  settlementStatus?: SettlementStatus;
  startDate?: string;
  endDate?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listFinancialTransactions(options: ListTransactionsOptions = {}) {
  const supabase = getSupabaseAdminClient();
  const {
    type, category, assignmentId, settlementStatus,
    startDate, endDate, search,
    limit = 25, offset = 0,
  } = options;

  let query = supabase
    .from('financial_transactions')
    .select(`
      *,
      assignment:expense_assignments(id, title, staff_name)
    `, { count: 'exact' });

  if (type) query = query.eq('type', type);
  if (category) query = query.eq('category', category);
  if (assignmentId) query = query.eq('assignment_id', assignmentId);
  if (settlementStatus) query = query.eq('settlement_status', settlementStatus);
  if (startDate) query = query.gte('transaction_date', startDate);
  if (endDate) query = query.lte('transaction_date', endDate);
  if (search) query = query.ilike('description', `%${search}%`);

  query = query.order('transaction_date', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { transactions: data || [], count: count || 0 };
}

export async function getTransactionById(id: string) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('financial_transactions')
    .select(`
      *,
      assignment:expense_assignments(id, title, staff_name, city, status)
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

export async function createFinancialTransaction(input: CreateFinancialTransactionInput) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('financial_transactions')
    .insert(input)
    .select()
    .single();

  if (error) throw error;
  return data as FinancialTransaction;
}

export async function updateFinancialTransaction(id: string, updates: Partial<FinancialTransaction>) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('financial_transactions')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as FinancialTransaction;
}

export async function deleteFinancialTransaction(id: string) {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from('financial_transactions')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function bulkSettleTransactions(ids: string[]) {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('financial_transactions')
    .update({ settlement_status: 'settled', settled_at: now, updated_at: now })
    .in('id', ids)
    .select();

  if (error) throw error;
  return data;
}

export async function getTransactionStats(startDate?: string, endDate?: string) {
  const supabase = getSupabaseAdminClient();

  let query = supabase.from('financial_transactions').select('type, category, amount, settlement_status');
  if (startDate) query = query.gte('transaction_date', startDate);
  if (endDate) query = query.lte('transaction_date', endDate);

  const { data, error } = await query;
  if (error) throw error;

  const stats = {
    total_expenses: 0,
    total_side_income: 0,
    unsettled_count: 0,
    unsettled_amount: 0,
    by_category: {} as Record<string, number>,
    top_category: '',
    top_category_amount: 0,
  };

  for (const txn of data || []) {
    const amount = Number(txn.amount);
    if (txn.type === 'expense') {
      stats.total_expenses += amount;
      stats.by_category[txn.category] = (stats.by_category[txn.category] || 0) + amount;
    } else {
      stats.total_side_income += amount;
    }
    if (txn.settlement_status === 'pending' && txn.type === 'expense') {
      stats.unsettled_count++;
      stats.unsettled_amount += amount;
    }
  }

  // Find top category
  for (const [cat, amt] of Object.entries(stats.by_category)) {
    if (amt > stats.top_category_amount) {
      stats.top_category = cat;
      stats.top_category_amount = amt;
    }
  }

  return stats;
}
```

- [ ] **Step 3: Export from queries index**

Add to end of `packages/database/src/queries/index.ts`:

```typescript
export * from './expenses';
export * from './expense-assignments';
```

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/queries/expenses.ts packages/database/src/queries/expense-assignments.ts packages/database/src/queries/index.ts
git commit -m "feat(db): add expense and assignment query functions"
```

---

## Task 4: API Routes — Expenses CRUD

**Files:**
- Create: `apps/admin/src/app/api/expenses/route.ts`
- Create: `apps/admin/src/app/api/expenses/[id]/route.ts`
- Create: `apps/admin/src/app/api/expenses/bulk-settle/route.ts`
- Create: `apps/admin/src/app/api/expenses/upload-receipt/route.ts`

- [ ] **Step 1: Create expenses list + create route**

Create `apps/admin/src/app/api/expenses/route.ts`:

```typescript
// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || undefined;
    const category = searchParams.get('category') || undefined;
    const assignmentId = searchParams.get('assignmentId') || undefined;
    const settlementStatus = searchParams.get('settlementStatus') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const search = searchParams.get('search') || undefined;
    const limit = parseInt(searchParams.get('limit') || '25', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const supabase = getSupabaseAdminClient();

    // Main query with assignment join
    let query = supabase
      .from('financial_transactions')
      .select(`
        *,
        assignment:expense_assignments(id, title, staff_name)
      `, { count: 'exact' });

    if (type) query = query.eq('type', type);
    if (category) query = query.eq('category', category);
    if (assignmentId) query = query.eq('assignment_id', assignmentId);
    if (settlementStatus) query = query.eq('settlement_status', settlementStatus);
    if (startDate) query = query.gte('transaction_date', startDate);
    if (endDate) query = query.lte('transaction_date', endDate);
    if (search) query = query.ilike('description', `%${search}%`);

    query = query.order('transaction_date', { ascending: false }).range(offset, offset + limit - 1);

    const { data: transactions, error, count } = await query;

    if (error) {
      console.error('Expenses query error:', error);
      return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 });
    }

    // Stats for current month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const { data: monthData } = await supabase
      .from('financial_transactions')
      .select('type, category, amount, settlement_status')
      .gte('transaction_date', monthStart)
      .lte('transaction_date', monthEnd);

    const stats = {
      total_expenses: 0,
      total_side_income: 0,
      unsettled_count: 0,
      unsettled_amount: 0,
      top_category: '' as string,
      top_category_amount: 0,
    };

    const catTotals: Record<string, number> = {};
    for (const txn of monthData || []) {
      const amt = Number(txn.amount);
      if (txn.type === 'expense') {
        stats.total_expenses += amt;
        catTotals[txn.category] = (catTotals[txn.category] || 0) + amt;
      } else {
        stats.total_side_income += amt;
      }
      if (txn.settlement_status === 'pending' && txn.type === 'expense') {
        stats.unsettled_count++;
        stats.unsettled_amount += amt;
      }
    }
    for (const [cat, amt] of Object.entries(catTotals)) {
      if (amt > stats.top_category_amount) {
        stats.top_category = cat;
        stats.top_category_amount = amt;
      }
    }

    return NextResponse.json({ transactions: transactions || [], total: count || 0, stats });
  } catch (error: any) {
    console.error('Error fetching expenses:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch expenses' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, category, amount, description, transaction_date, assignment_id, receipt_url, notes, created_by } = body;

    if (!type || !category || !amount || !description || !transaction_date || !created_by) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('financial_transactions')
      .insert({
        type,
        category,
        amount: parseFloat(amount),
        description,
        transaction_date,
        assignment_id: assignment_id || null,
        receipt_url: receipt_url || null,
        notes: notes || null,
        created_by,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error('Error creating expense:', error);
    return NextResponse.json({ error: error.message || 'Failed to create expense' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create single expense route (GET, PATCH, DELETE)**

Create `apps/admin/src/app/api/expenses/[id]/route.ts`:

```typescript
// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('financial_transactions')
      .select(`
        *,
        assignment:expense_assignments(id, title, staff_name, city, status)
      `)
      .eq('id', params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 });
      throw error;
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('financial_transactions')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdminClient();

    const { error } = await supabase
      .from('financial_transactions')
      .delete()
      .eq('id', params.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create bulk settle route**

Create `apps/admin/src/app/api/expenses/bulk-settle/route.ts`:

```typescript
// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export async function POST(request: NextRequest) {
  try {
    const { ids } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('financial_transactions')
      .update({ settlement_status: 'settled', settled_at: now, updated_at: now })
      .in('id', ids)
      .select();

    if (error) throw error;

    return NextResponse.json({ settled: data?.length || 0 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Create receipt upload route**

Create `apps/admin/src/app/api/expenses/upload-receipt/route.ts`:

```typescript
// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const transactionId = formData.get('transactionId') as string;

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const fileExt = file.name.split('.').pop();
    const fileName = `${transactionId || Date.now()}_${Date.now()}.${fileExt}`;
    const filePath = `receipts/${fileName}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from('expense-receipts')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('expense-receipts')
      .getPublicUrl(filePath);

    // Update transaction with receipt URL if transactionId provided
    if (transactionId) {
      await supabase
        .from('financial_transactions')
        .update({ receipt_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', transactionId);
    }

    return NextResponse.json({ url: publicUrl });
  } catch (error: any) {
    console.error('Receipt upload error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/api/expenses/
git commit -m "feat(admin): add expense CRUD, bulk settle, and receipt upload API routes"
```

---

## Task 5: API Routes — Staff Assignments + Financial Dashboard

**Files:**
- Create: `apps/admin/src/app/api/staff-assignments/route.ts`
- Create: `apps/admin/src/app/api/staff-assignments/[id]/route.ts`
- Create: `apps/admin/src/app/api/staff-assignments/[id]/settle/route.ts`
- Create: `apps/admin/src/app/api/financial-dashboard/route.ts`

- [ ] **Step 1: Create assignments list + create route**

Create `apps/admin/src/app/api/staff-assignments/route.ts`:

```typescript
// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const staffName = searchParams.get('staffName') || undefined;
    const city = searchParams.get('city') || undefined;
    const limit = parseInt(searchParams.get('limit') || '25', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const supabase = getSupabaseAdminClient();

    let query = supabase
      .from('expense_assignments')
      .select('*', { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (staffName) query = query.ilike('staff_name', `%${staffName}%`);
    if (city) query = query.ilike('city', `%${city}%`);

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data: assignments, error, count } = await query;
    if (error) throw error;

    // Get expense totals for each assignment
    const assignmentIds = (assignments || []).map(a => a.id);
    let expenseSummaries: Record<string, { total: number; count: number }> = {};

    if (assignmentIds.length > 0) {
      const { data: txns } = await supabase
        .from('financial_transactions')
        .select('assignment_id, amount')
        .in('assignment_id', assignmentIds);

      for (const txn of txns || []) {
        if (!expenseSummaries[txn.assignment_id]) {
          expenseSummaries[txn.assignment_id] = { total: 0, count: 0 };
        }
        expenseSummaries[txn.assignment_id].total += Number(txn.amount);
        expenseSummaries[txn.assignment_id].count++;
      }
    }

    const enriched = (assignments || []).map(a => ({
      ...a,
      total_spent: expenseSummaries[a.id]?.total || 0,
      expense_count: expenseSummaries[a.id]?.count || 0,
    }));

    return NextResponse.json({ assignments: enriched, total: count || 0 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, staff_name, city, start_date, end_date, notes, created_by } = body;

    if (!title || !staff_name || !start_date || !created_by) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('expense_assignments')
      .insert({ title, staff_name, city: city || null, start_date, end_date: end_date || null, notes: notes || null, created_by })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create single assignment route**

Create `apps/admin/src/app/api/staff-assignments/[id]/route.ts`:

```typescript
// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdminClient();

    // Get assignment
    const { data: assignment, error } = await supabase
      .from('expense_assignments')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 });
      throw error;
    }

    // Get all expenses linked to this assignment
    const { data: expenses } = await supabase
      .from('financial_transactions')
      .select('*')
      .eq('assignment_id', params.id)
      .order('transaction_date', { ascending: false });

    // Calculate summary
    const summary = { total: 0, by_category: {} as Record<string, number>, pending_count: 0, settled_count: 0 };
    for (const exp of expenses || []) {
      const amt = Number(exp.amount);
      summary.total += amt;
      summary.by_category[exp.category] = (summary.by_category[exp.category] || 0) + amt;
      if (exp.settlement_status === 'pending') summary.pending_count++;
      else summary.settled_count++;
    }

    return NextResponse.json({ assignment, expenses: expenses || [], summary });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('expense_assignments')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create settle assignment route**

Create `apps/admin/src/app/api/staff-assignments/[id]/settle/route.ts`:

```typescript
// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdminClient();
    const now = new Date().toISOString();

    // Settle the assignment
    const { data: assignment, error: aErr } = await supabase
      .from('expense_assignments')
      .update({ status: 'settled', settled_at: now, updated_at: now })
      .eq('id', params.id)
      .select()
      .single();

    if (aErr) throw aErr;

    // Settle all linked expenses
    const { error: tErr } = await supabase
      .from('financial_transactions')
      .update({ settlement_status: 'settled', settled_at: now, updated_at: now })
      .eq('assignment_id', params.id)
      .eq('settlement_status', 'pending');

    if (tErr) throw tErr;

    return NextResponse.json({ assignment, message: 'Assignment settled successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Create financial dashboard route**

Create `apps/admin/src/app/api/financial-dashboard/route.ts`:

```typescript
// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // 1. Get all financial transactions in date range
    const { data: transactions } = await supabase
      .from('financial_transactions')
      .select('type, category, amount, transaction_date')
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate);

    // 2. Get student fee income from payments table
    const { data: payments } = await supabase
      .from('payments')
      .select('amount, created_at')
      .eq('status', 'paid')
      .gte('created_at', startDate + 'T00:00:00Z')
      .lte('created_at', endDate + 'T23:59:59Z');

    const studentFeeIncome = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);

    // 3. Calculate totals
    let totalExpenses = 0;
    let totalSideIncome = 0;
    const categoryBreakdown: Record<string, number> = {};
    let highestSingleExpense = 0;

    for (const txn of transactions || []) {
      const amt = Number(txn.amount);
      if (txn.type === 'expense') {
        totalExpenses += amt;
        categoryBreakdown[txn.category] = (categoryBreakdown[txn.category] || 0) + amt;
        if (amt > highestSingleExpense) highestSingleExpense = amt;
      } else {
        totalSideIncome += amt;
      }
    }

    const totalIncome = studentFeeIncome + totalSideIncome;
    const netProfit = totalIncome - totalExpenses;
    const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

    // 4. Get student count for per-student metrics
    const { count: studentCount } = await supabase
      .from('student_profiles')
      .select('id', { count: 'exact', head: true });

    const expensePerStudent = (studentCount && studentCount > 0) ? totalExpenses / studentCount : 0;
    const incomePerStudent = (studentCount && studentCount > 0) ? totalIncome / studentCount : 0;

    // 5. Monthly series (last 6 months)
    const monthlySeries: Array<{ month: string; income: number; expenses: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const mStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
      const monthLabel = d.toLocaleString('en-IN', { month: 'short', year: '2-digit' });

      // Expenses from financial_transactions
      const { data: mTxns } = await supabase
        .from('financial_transactions')
        .select('type, amount')
        .gte('transaction_date', mStart)
        .lte('transaction_date', mEnd);

      let mExpenses = 0;
      let mSideIncome = 0;
      for (const t of mTxns || []) {
        if (t.type === 'expense') mExpenses += Number(t.amount);
        else mSideIncome += Number(t.amount);
      }

      // Student fee income from payments
      const { data: mPayments } = await supabase
        .from('payments')
        .select('amount')
        .eq('status', 'paid')
        .gte('created_at', mStart + 'T00:00:00Z')
        .lte('created_at', mEnd + 'T23:59:59Z');

      const mFeeIncome = (mPayments || []).reduce((sum, p) => sum + Number(p.amount), 0);

      monthlySeries.push({ month: monthLabel, income: mFeeIncome + mSideIncome, expenses: mExpenses });
    }

    // 6. Previous period for comparison
    const start = new Date(startDate);
    const end = new Date(endDate);
    const periodDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const prevStart = new Date(start.getTime() - periodDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: prevTxns } = await supabase
      .from('financial_transactions')
      .select('type, category, amount')
      .gte('transaction_date', prevStart)
      .lte('transaction_date', prevEnd);

    let prevExpenses = 0;
    let prevSideIncome = 0;
    const prevCategoryBreakdown: Record<string, number> = {};
    for (const txn of prevTxns || []) {
      const amt = Number(txn.amount);
      if (txn.type === 'expense') {
        prevExpenses += amt;
        prevCategoryBreakdown[txn.category] = (prevCategoryBreakdown[txn.category] || 0) + amt;
      } else {
        prevSideIncome += amt;
      }
    }

    const { data: prevPayments } = await supabase
      .from('payments')
      .select('amount')
      .eq('status', 'paid')
      .gte('created_at', prevStart + 'T00:00:00Z')
      .lte('created_at', prevEnd + 'T23:59:59Z');

    const prevFeeIncome = (prevPayments || []).reduce((sum, p) => sum + Number(p.amount), 0);
    const prevTotalIncome = prevFeeIncome + prevSideIncome;
    const momChange = prevTotalIncome > 0 ? ((totalIncome - prevTotalIncome) / prevTotalIncome) * 100 : 0;

    // 7. Top assignment by spend
    const { data: topAssignment } = await supabase
      .from('financial_transactions')
      .select('assignment_id, amount')
      .not('assignment_id', 'is', null)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate);

    const assignmentTotals: Record<string, number> = {};
    for (const t of topAssignment || []) {
      assignmentTotals[t.assignment_id] = (assignmentTotals[t.assignment_id] || 0) + Number(t.amount);
    }
    let topAssignmentId = '';
    let topAssignmentAmount = 0;
    for (const [id, amt] of Object.entries(assignmentTotals)) {
      if (amt > topAssignmentAmount) { topAssignmentId = id; topAssignmentAmount = amt; }
    }

    let topAssignmentInfo = null;
    if (topAssignmentId) {
      const { data: aInfo } = await supabase
        .from('expense_assignments')
        .select('title, staff_name')
        .eq('id', topAssignmentId)
        .single();
      topAssignmentInfo = aInfo ? { ...aInfo, total: topAssignmentAmount } : null;
    }

    return NextResponse.json({
      summary: {
        total_income: totalIncome,
        student_fee_income: studentFeeIncome,
        side_income: totalSideIncome,
        total_expenses: totalExpenses,
        net_profit: netProfit,
        profit_margin: Math.round(profitMargin * 10) / 10,
        expense_per_student: Math.round(expensePerStudent),
        income_per_student: Math.round(incomePerStudent),
        mom_change: Math.round(momChange * 10) / 10,
        student_count: studentCount || 0,
      },
      category_breakdown: categoryBreakdown,
      prev_category_breakdown: prevCategoryBreakdown,
      monthly_series: monthlySeries,
      insights: {
        highest_single_expense: highestSingleExpense,
        top_assignment: topAssignmentInfo,
      },
    });
  } catch (error: any) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/api/staff-assignments/ apps/admin/src/app/api/financial-dashboard/
git commit -m "feat(admin): add staff assignment and financial dashboard API routes"
```

---

## Task 6: Install recharts + Update Sidebar

**Files:**
- Modify: `apps/admin/package.json` (add recharts)
- Modify: `apps/admin/src/components/Sidebar.tsx` (add 3 nav items)

- [ ] **Step 1: Install recharts**

```bash
cd c:/Users/Haribabu/Documents/AppsCopilot/2026/NeramEcosystem && pnpm add recharts --filter @neram/admin
```

- [ ] **Step 2: Add icons and nav items to Sidebar**

In `apps/admin/src/components/Sidebar.tsx`, add icon imports after existing imports (around line 48):

```typescript
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import AnalyticsIcon from '@mui/icons-material/Analytics';
```

Then update the Finance group (lines 96-102) from:

```typescript
  {
    label: 'Finance',
    items: [
      { text: 'Payments', icon: PaymentIcon, path: '/payments' },
      { text: 'Fee Structures', icon: AttachMoneyIcon, path: '/fee-structures' },
    ],
  },
```

To:

```typescript
  {
    label: 'Finance',
    items: [
      { text: 'Payments', icon: PaymentIcon, path: '/payments' },
      { text: 'Fee Structures', icon: AttachMoneyIcon, path: '/fee-structures' },
      { text: 'Expenses', icon: ReceiptLongIcon, path: '/expenses' },
      { text: 'Staff Assignments', icon: BusinessCenterIcon, path: '/staff-assignments' },
      { text: 'Financial Dashboard', icon: AnalyticsIcon, path: '/financial-dashboard' },
    ],
  },
```

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/components/Sidebar.tsx apps/admin/package.json pnpm-lock.yaml
git commit -m "feat(admin): add expense tracker navigation items and recharts dependency"
```

---

## Task 7: Expenses List Page

**Files:**
- Create: `apps/admin/src/app/(dashboard)/expenses/page.tsx`
- Create: `apps/admin/src/components/expenses/AddExpenseDialog.tsx`
- Create: `apps/admin/src/components/expenses/AddIncomeDialog.tsx`

- [ ] **Step 1: Create the AddExpenseDialog**

Create `apps/admin/src/components/expenses/AddExpenseDialog.tsx`:

```typescript
// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, MenuItem, Alert, Box, Typography, IconButton,
} from '@neram/ui';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import { EXPENSE_CATEGORIES } from './ExpenseConstants';

interface AddExpenseDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  adminId: string;
  editData?: any;
  preSelectedAssignment?: { id: string; title: string } | null;
  assignments: Array<{ id: string; title: string; staff_name: string }>;
}

export default function AddExpenseDialog({
  open, onClose, onSaved, adminId, editData, preSelectedAssignment, assignments,
}: AddExpenseDialogProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split('T')[0]);
  const [assignmentId, setAssignmentId] = useState('');
  const [notes, setNotes] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState('');

  useEffect(() => {
    if (editData) {
      setCategory(editData.category || '');
      setAmount(String(editData.amount || ''));
      setDescription(editData.description || '');
      setTransactionDate(editData.transaction_date || new Date().toISOString().split('T')[0]);
      setAssignmentId(editData.assignment_id || '');
      setNotes(editData.notes || '');
      setReceiptPreview(editData.receipt_url || '');
    } else {
      setCategory('');
      setAmount('');
      setDescription('');
      setTransactionDate(new Date().toISOString().split('T')[0]);
      setAssignmentId(preSelectedAssignment?.id || '');
      setNotes('');
      setReceiptFile(null);
      setReceiptPreview('');
    }
  }, [editData, preSelectedAssignment, open]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptFile(file);
      setReceiptPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async () => {
    if (!category || !amount || !description || !transactionDate) {
      setError('Please fill all required fields');
      return;
    }

    setSaving(true);
    setError('');

    try {
      let receiptUrl = editData?.receipt_url || null;

      // Upload receipt if new file selected
      if (receiptFile) {
        const formData = new FormData();
        formData.append('file', receiptFile);
        const uploadRes = await fetch('/api/expenses/upload-receipt', { method: 'POST', body: formData });
        if (!uploadRes.ok) throw new Error('Failed to upload receipt');
        const uploadData = await uploadRes.json();
        receiptUrl = uploadData.url;
      }

      const payload = {
        type: 'expense',
        category,
        amount: parseFloat(amount),
        description,
        transaction_date: transactionDate,
        assignment_id: assignmentId || null,
        receipt_url: receiptUrl,
        notes: notes || null,
        created_by: adminId,
      };

      const method = editData ? 'PATCH' : 'POST';
      const url = editData ? `/api/expenses/${editData.id}` : '/api/expenses';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

      if (!res.ok) throw new Error('Failed to save expense');

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{editData ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <TextField select fullWidth label="Category *" value={category} onChange={e => setCategory(e.target.value)} margin="normal" size="small">
          {EXPENSE_CATEGORIES.map(c => (
            <MenuItem key={c.value} value={c.value}>{c.label} — {c.description}</MenuItem>
          ))}
        </TextField>

        <TextField fullWidth label="Amount (₹) *" type="number" value={amount} onChange={e => setAmount(e.target.value)} margin="normal" size="small" inputProps={{ step: '0.01', min: '0' }} />

        <TextField fullWidth label="Description *" value={description} onChange={e => setDescription(e.target.value)} margin="normal" size="small" />

        <TextField fullWidth label="Date *" type="date" value={transactionDate} onChange={e => setTransactionDate(e.target.value)} margin="normal" size="small" InputLabelProps={{ shrink: true }} />

        <TextField select fullWidth label="Staff Assignment (optional)" value={assignmentId} onChange={e => setAssignmentId(e.target.value)} margin="normal" size="small">
          <MenuItem value="">None</MenuItem>
          {assignments.map(a => (
            <MenuItem key={a.id} value={a.id}>{a.staff_name} — {a.title}</MenuItem>
          ))}
        </TextField>

        <TextField fullWidth label="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} margin="normal" size="small" multiline rows={2} />

        {/* Receipt upload */}
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Receipt (optional)</Typography>
          {receiptPreview ? (
            <Box sx={{ position: 'relative', display: 'inline-block' }}>
              <img src={receiptPreview} alt="Receipt" style={{ maxWidth: 200, maxHeight: 150, borderRadius: 8 }} />
              <IconButton size="small" sx={{ position: 'absolute', top: -8, right: -8, bgcolor: 'background.paper' }} onClick={() => { setReceiptFile(null); setReceiptPreview(''); }}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          ) : (
            <Button variant="outlined" component="label" startIcon={<CloudUploadIcon />} size="small">
              Upload Receipt
              <input type="file" hidden accept="image/*" onChange={handleFileChange} />
            </Button>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create the AddIncomeDialog**

Create `apps/admin/src/components/expenses/AddIncomeDialog.tsx`:

```typescript
// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, MenuItem, Alert,
} from '@neram/ui';
import { INCOME_CATEGORIES } from './ExpenseConstants';

interface AddIncomeDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  adminId: string;
  editData?: any;
}

export default function AddIncomeDialog({ open, onClose, onSaved, adminId, editData }: AddIncomeDialogProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (editData) {
      setCategory(editData.category || '');
      setAmount(String(editData.amount || ''));
      setDescription(editData.description || '');
      setTransactionDate(editData.transaction_date || new Date().toISOString().split('T')[0]);
      setNotes(editData.notes || '');
    } else {
      setCategory('');
      setAmount('');
      setDescription('');
      setTransactionDate(new Date().toISOString().split('T')[0]);
      setNotes('');
    }
  }, [editData, open]);

  const handleSubmit = async () => {
    if (!category || !amount || !description || !transactionDate) {
      setError('Please fill all required fields');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = {
        type: 'income',
        category,
        amount: parseFloat(amount),
        description,
        transaction_date: transactionDate,
        notes: notes || null,
        created_by: adminId,
      };

      const method = editData ? 'PATCH' : 'POST';
      const url = editData ? `/api/expenses/${editData.id}` : '/api/expenses';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

      if (!res.ok) throw new Error('Failed to save income entry');

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{editData ? 'Edit Income' : 'Add Side Income'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <TextField select fullWidth label="Category *" value={category} onChange={e => setCategory(e.target.value)} margin="normal" size="small">
          {INCOME_CATEGORIES.map(c => (
            <MenuItem key={c.value} value={c.value}>{c.label} — {c.description}</MenuItem>
          ))}
        </TextField>

        <TextField fullWidth label="Amount (₹) *" type="number" value={amount} onChange={e => setAmount(e.target.value)} margin="normal" size="small" inputProps={{ step: '0.01', min: '0' }} />

        <TextField fullWidth label="Description *" value={description} onChange={e => setDescription(e.target.value)} margin="normal" size="small" />

        <TextField fullWidth label="Date *" type="date" value={transactionDate} onChange={e => setTransactionDate(e.target.value)} margin="normal" size="small" InputLabelProps={{ shrink: true }} />

        <TextField fullWidth label="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} margin="normal" size="small" multiline rows={2} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 3: Create the Expenses list page**

Create `apps/admin/src/app/(dashboard)/expenses/page.tsx`:

```typescript
// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, TextField, MenuItem, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  Alert, CircularProgress, Chip, Checkbox, Skeleton, IconButton, Tooltip,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import ReceiptIcon from '@mui/icons-material/Receipt';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PendingIcon from '@mui/icons-material/Pending';
import { useAdminProfile } from '@/contexts/AdminProfileContext';
import AddExpenseDialog from '@/components/expenses/AddExpenseDialog';
import AddIncomeDialog from '@/components/expenses/AddIncomeDialog';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getCategoryLabel, formatCurrency } from '@/components/expenses/ExpenseConstants';

const ALL_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

function StatCard({ title, value, icon, color, loading }: { title: string; value: string; icon: React.ReactNode; color: string; loading: boolean }) {
  return (
    <Paper elevation={0} sx={{ p: 1.5, borderRadius: 1, border: '1px solid', borderColor: 'grey.200', flex: 1, minWidth: 180 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>{title}</Typography>
          {loading ? <Skeleton width={100} height={32} /> : <Typography variant="h6" fontWeight={700} sx={{ color }}>{value}</Typography>}
        </Box>
        <Box sx={{ width: 32, height: 32, borderRadius: 1, bgcolor: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </Box>
      </Box>
    </Paper>
  );
}

export default function ExpensesPage() {
  const { adminProfile } = useAdminProfile();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [typeFilter, setTypeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [settlementFilter, setSettlementFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('limit', String(rowsPerPage));
      params.set('offset', String(page * rowsPerPage));
      if (typeFilter) params.set('type', typeFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (settlementFilter) params.set('settlementStatus', settlementFilter);
      if (search) params.set('search', search);

      const res = await fetch(`/api/expenses?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setTransactions(data.transactions || []);
      setTotalCount(data.total || 0);
      setStats(data.stats || null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, categoryFilter, settlementFilter, search, page, rowsPerPage]);

  const fetchAssignments = useCallback(async () => {
    try {
      const res = await fetch('/api/staff-assignments?limit=100&status=active');
      if (res.ok) {
        const data = await res.json();
        setAssignments(data.assignments || []);
      }
    } catch {}
  }, []);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);
  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  const handleBulkSettle = async () => {
    if (selected.length === 0) return;
    try {
      const res = await fetch('/api/expenses/bulk-settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selected }),
      });
      if (!res.ok) throw new Error('Failed to settle');
      setSelected([]);
      fetchTransactions();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const pendingIds = transactions.filter(t => t.type === 'expense' && t.settlement_status === 'pending').map(t => t.id);
      setSelected(pendingIds);
    } else {
      setSelected([]);
    }
  };

  const handleSelectOne = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const handleRowClick = (txn: any) => {
    setEditData(txn);
    if (txn.type === 'income') setIncomeDialogOpen(true);
    else setExpenseDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this entry?')) return;
    try {
      await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      fetchTransactions();
    } catch {}
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ReceiptLongIcon sx={{ fontSize: 28 }} />
          <Typography variant="h4" fontWeight={700}>Expenses & Income</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" size="small" onClick={fetchTransactions} startIcon={<RefreshIcon />}>Refresh</Button>
          <Button variant="outlined" size="small" color="success" onClick={() => { setEditData(null); setIncomeDialogOpen(true); }} startIcon={<AddIcon />}>Add Income</Button>
          <Button variant="contained" size="small" onClick={() => { setEditData(null); setExpenseDialogOpen(true); }} startIcon={<AddIcon />}>Add Expense</Button>
        </Box>
      </Box>

      {/* Stats */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, overflowX: 'auto', pb: 1 }}>
        <StatCard title="Expenses (This Month)" value={formatCurrency(stats?.total_expenses || 0)} icon={<TrendingDownIcon sx={{ color: '#D32F2F', fontSize: 20 }} />} color="#D32F2F" loading={loading} />
        <StatCard title="Side Income (This Month)" value={formatCurrency(stats?.total_side_income || 0)} icon={<TrendingUpIcon sx={{ color: '#388E3C', fontSize: 20 }} />} color="#388E3C" loading={loading} />
        <StatCard title="Unsettled" value={`${stats?.unsettled_count || 0} (${formatCurrency(stats?.unsettled_amount || 0)})`} icon={<PendingIcon sx={{ color: '#F57C00', fontSize: 20 }} />} color="#F57C00" loading={loading} />
        <StatCard title="Top Category" value={getCategoryLabel(stats?.top_category || '')} icon={<ReceiptIcon sx={{ color: '#1976D2', fontSize: 20 }} />} color="#1976D2" loading={loading} />
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <TextField placeholder="Search..." size="small" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
          sx={{ flex: 1, minWidth: 200 }} />
        <TextField select size="small" label="Type" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(0); }} sx={{ minWidth: 130 }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="expense">Expense</MenuItem>
          <MenuItem value="income">Income</MenuItem>
        </TextField>
        <TextField select size="small" label="Category" value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(0); }} sx={{ minWidth: 150 }}>
          <MenuItem value="">All</MenuItem>
          {ALL_CATEGORIES.map(c => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Settlement" value={settlementFilter} onChange={e => { setSettlementFilter(e.target.value); setPage(0); }} sx={{ minWidth: 130 }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="pending">Pending</MenuItem>
          <MenuItem value="settled">Settled</MenuItem>
        </TextField>
        {selected.length > 0 && (
          <Button variant="contained" color="warning" size="small" onClick={handleBulkSettle} startIcon={<DoneAllIcon />}>
            Settle {selected.length} Selected
          </Button>
        )}
      </Box>

      {/* Table */}
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        {loading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
        ) : transactions.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">No transactions found</Typography></Box>
        ) : (
          <>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell padding="checkbox"><Checkbox checked={selected.length > 0} onChange={(_, c) => handleSelectAll(c)} /></TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Assignment</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Settlement</TableCell>
                  <TableCell>Receipt</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.map(txn => (
                  <TableRow key={txn.id} hover sx={{ cursor: 'pointer' }} onClick={() => handleRowClick(txn)}>
                    <TableCell padding="checkbox" onClick={e => e.stopPropagation()}>
                      {txn.type === 'expense' && txn.settlement_status === 'pending' && (
                        <Checkbox checked={selected.includes(txn.id)} onChange={() => handleSelectOne(txn.id)} />
                      )}
                    </TableCell>
                    <TableCell>{new Date(txn.transaction_date).toLocaleDateString('en-IN')}</TableCell>
                    <TableCell><Chip label={txn.type} size="small" color={txn.type === 'income' ? 'success' : 'default'} variant="outlined" /></TableCell>
                    <TableCell>{getCategoryLabel(txn.category)}</TableCell>
                    <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txn.description}</TableCell>
                    <TableCell>{txn.assignment ? `${txn.assignment.staff_name} — ${txn.assignment.title}` : '—'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, color: txn.type === 'income' ? 'success.main' : 'text.primary' }}>{formatCurrency(txn.amount)}</TableCell>
                    <TableCell>
                      {txn.type === 'expense' && (
                        <Chip label={txn.settlement_status} size="small" color={txn.settlement_status === 'settled' ? 'success' : 'warning'} variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>{txn.receipt_url ? <Tooltip title="View receipt"><ReceiptIcon fontSize="small" color="primary" /></Tooltip> : '—'}</TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Button size="small" color="error" onClick={() => handleDelete(txn.id)}>Delete</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              rowsPerPageOptions={[10, 25, 50]}
              component="div"
              count={totalCount}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            />
          </>
        )}
      </TableContainer>

      {/* Dialogs */}
      <AddExpenseDialog
        open={expenseDialogOpen}
        onClose={() => { setExpenseDialogOpen(false); setEditData(null); }}
        onSaved={fetchTransactions}
        adminId={adminProfile?.id || ''}
        editData={editData}
        assignments={assignments}
      />
      <AddIncomeDialog
        open={incomeDialogOpen}
        onClose={() => { setIncomeDialogOpen(false); setEditData(null); }}
        onSaved={fetchTransactions}
        adminId={adminProfile?.id || ''}
        editData={editData}
      />
    </Box>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/(dashboard)/expenses/ apps/admin/src/components/expenses/
git commit -m "feat(admin): add expenses list page with add/edit dialogs and bulk settle"
```

---

## Task 8: Staff Assignments Pages

**Files:**
- Create: `apps/admin/src/app/(dashboard)/staff-assignments/page.tsx`
- Create: `apps/admin/src/app/(dashboard)/staff-assignments/[id]/page.tsx`
- Create: `apps/admin/src/components/expenses/AddAssignmentDialog.tsx`

- [ ] **Step 1: Create AddAssignmentDialog**

Create `apps/admin/src/components/expenses/AddAssignmentDialog.tsx`:

```typescript
// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Alert } from '@neram/ui';

interface AddAssignmentDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  adminId: string;
  editData?: any;
}

export default function AddAssignmentDialog({ open, onClose, onSaved, adminId, editData }: AddAssignmentDialogProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [staffName, setStaffName] = useState('');
  const [city, setCity] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (editData) {
      setTitle(editData.title || '');
      setStaffName(editData.staff_name || '');
      setCity(editData.city || '');
      setStartDate(editData.start_date || new Date().toISOString().split('T')[0]);
      setEndDate(editData.end_date || '');
      setNotes(editData.notes || '');
    } else {
      setTitle(''); setStaffName(''); setCity('');
      setStartDate(new Date().toISOString().split('T')[0]);
      setEndDate(''); setNotes('');
    }
  }, [editData, open]);

  const handleSubmit = async () => {
    if (!title || !staffName || !startDate) {
      setError('Title, Staff Name, and Start Date are required');
      return;
    }
    setSaving(true); setError('');
    try {
      const payload = { title, staff_name: staffName, city: city || null, start_date: startDate, end_date: endDate || null, notes: notes || null, created_by: adminId };
      const method = editData ? 'PATCH' : 'POST';
      const url = editData ? `/api/staff-assignments/${editData.id}` : '/api/staff-assignments';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('Failed to save assignment');
      onSaved(); onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{editData ? 'Edit Assignment' : 'New Assignment'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <TextField fullWidth label="Title *" value={title} onChange={e => setTitle(e.target.value)} margin="normal" size="small" placeholder="e.g., Coimbatore Offline Center" />
        <TextField fullWidth label="Staff Name *" value={staffName} onChange={e => setStaffName(e.target.value)} margin="normal" size="small" placeholder="e.g., Tamil Children" />
        <TextField fullWidth label="City" value={city} onChange={e => setCity(e.target.value)} margin="normal" size="small" placeholder="e.g., Coimbatore" />
        <TextField fullWidth label="Start Date *" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} margin="normal" size="small" InputLabelProps={{ shrink: true }} />
        <TextField fullWidth label="End Date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} margin="normal" size="small" InputLabelProps={{ shrink: true }} />
        <TextField fullWidth label="Notes" value={notes} onChange={e => setNotes(e.target.value)} margin="normal" size="small" multiline rows={2} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create Staff Assignments list page**

Create `apps/admin/src/app/(dashboard)/staff-assignments/page.tsx`:

```typescript
// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Typography, Paper, Button, TextField, MenuItem, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  Alert, CircularProgress, Chip,
} from '@neram/ui';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import { useAdminProfile } from '@/contexts/AdminProfileContext';
import AddAssignmentDialog from '@/components/expenses/AddAssignmentDialog';
import { formatCurrency } from '@/components/expenses/ExpenseConstants';

const STATUS_COLORS: Record<string, 'info' | 'warning' | 'success'> = {
  active: 'info',
  completed: 'warning',
  settled: 'success',
};

export default function StaffAssignmentsPage() {
  const router = useRouter();
  const { adminProfile } = useAdminProfile();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchAssignments = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      params.set('limit', String(rowsPerPage));
      params.set('offset', String(page * rowsPerPage));
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('staffName', search);

      const res = await fetch(`/api/staff-assignments?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setAssignments(data.assignments || []);
      setTotalCount(data.total || 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, page, rowsPerPage]);

  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BusinessCenterIcon sx={{ fontSize: 28 }} />
          <Typography variant="h4" fontWeight={700}>Staff Assignments</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" size="small" onClick={fetchAssignments} startIcon={<RefreshIcon />}>Refresh</Button>
          <Button variant="contained" size="small" onClick={() => setDialogOpen(true)} startIcon={<AddIcon />}>New Assignment</Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <TextField placeholder="Search by staff name..." size="small" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }} sx={{ flex: 1, minWidth: 200 }} />
        <TextField select size="small" label="Status" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }} sx={{ minWidth: 130 }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="active">Active</MenuItem>
          <MenuItem value="completed">Completed</MenuItem>
          <MenuItem value="settled">Settled</MenuItem>
        </TextField>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        {loading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
        ) : assignments.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">No assignments found</Typography></Box>
        ) : (
          <>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell>Staff</TableCell>
                  <TableCell>Title</TableCell>
                  <TableCell>City</TableCell>
                  <TableCell>Date Range</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Total Spent</TableCell>
                  <TableCell align="right"># Expenses</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {assignments.map(a => (
                  <TableRow key={a.id} hover sx={{ cursor: 'pointer' }} onClick={() => router.push(`/staff-assignments/${a.id}`)}>
                    <TableCell sx={{ fontWeight: 600 }}>{a.staff_name}</TableCell>
                    <TableCell>{a.title}</TableCell>
                    <TableCell>{a.city || '—'}</TableCell>
                    <TableCell>
                      {new Date(a.start_date).toLocaleDateString('en-IN')}
                      {a.end_date ? ` — ${new Date(a.end_date).toLocaleDateString('en-IN')}` : ' — Ongoing'}
                    </TableCell>
                    <TableCell><Chip label={a.status} size="small" color={STATUS_COLORS[a.status] || 'default'} variant="outlined" /></TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(a.total_spent)}</TableCell>
                    <TableCell align="right">{a.expense_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination rowsPerPageOptions={[10, 25, 50]} component="div" count={totalCount} rowsPerPage={rowsPerPage} page={page}
              onPageChange={(_, p) => setPage(p)} onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }} />
          </>
        )}
      </TableContainer>

      <AddAssignmentDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSaved={fetchAssignments} adminId={adminProfile?.id || ''} />
    </Box>
  );
}
```

- [ ] **Step 3: Create Assignment Detail page**

Create `apps/admin/src/app/(dashboard)/staff-assignments/[id]/page.tsx`:

```typescript
// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Typography, Paper, Button, Alert, CircularProgress, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReceiptIcon from '@mui/icons-material/Receipt';
import { useAdminProfile } from '@/contexts/AdminProfileContext';
import AddExpenseDialog from '@/components/expenses/AddExpenseDialog';
import { getCategoryLabel, getCategoryColor, formatCurrency } from '@/components/expenses/ExpenseConstants';

export default function AssignmentDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { adminProfile } = useAdminProfile();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [settling, setSettling] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/staff-assignments/${params.id}`);
      if (!res.ok) throw new Error('Failed to fetch');
      setData(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSettle = async () => {
    if (!confirm('Settle this assignment and all linked expenses?')) return;
    setSettling(true);
    try {
      const res = await fetch(`/api/staff-assignments/${params.id}/settle`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to settle');
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSettling(false);
    }
  };

  const handleMarkComplete = async () => {
    try {
      const res = await fetch(`/api/staff-assignments/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      if (!res.ok) throw new Error('Failed to update');
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) return <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>;
  if (error) return <Box sx={{ p: 3 }}><Alert severity="error">{error}</Alert></Box>;

  const { assignment, expenses, summary } = data || {};
  const statusColors: Record<string, 'info' | 'warning' | 'success'> = { active: 'info', completed: 'warning', settled: 'success' };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => router.push('/staff-assignments')} sx={{ mb: 1 }}>Back</Button>
          <Typography variant="h4" fontWeight={700}>{assignment?.staff_name} — {assignment?.title}</Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'center' }}>
            <Chip label={assignment?.status} color={statusColors[assignment?.status] || 'default'} size="small" />
            {assignment?.city && <Typography variant="body2" color="text.secondary">📍 {assignment.city}</Typography>}
            <Typography variant="body2" color="text.secondary">
              {new Date(assignment?.start_date).toLocaleDateString('en-IN')}
              {assignment?.end_date ? ` — ${new Date(assignment.end_date).toLocaleDateString('en-IN')}` : ' — Ongoing'}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" size="small" onClick={() => setExpenseDialogOpen(true)} startIcon={<AddIcon />}>Add Expense</Button>
          {assignment?.status === 'active' && (
            <Button variant="outlined" color="warning" size="small" onClick={handleMarkComplete} startIcon={<CheckCircleIcon />}>Mark Complete</Button>
          )}
          {assignment?.status !== 'settled' && (
            <Button variant="contained" color="success" size="small" onClick={handleSettle} disabled={settling} startIcon={<DoneAllIcon />}>
              {settling ? 'Settling...' : 'Settle All'}
            </Button>
          )}
        </Box>
      </Box>

      {/* Summary cards */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', minWidth: 140 }}>
          <Typography variant="body2" color="text.secondary">Total Spent</Typography>
          <Typography variant="h5" fontWeight={700}>{formatCurrency(summary?.total || 0)}</Typography>
        </Paper>
        {Object.entries(summary?.by_category || {}).map(([cat, amt]) => (
          <Paper key={cat} elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', minWidth: 130 }}>
            <Typography variant="body2" color="text.secondary">{getCategoryLabel(cat)}</Typography>
            <Typography variant="h6" fontWeight={600} sx={{ color: getCategoryColor(cat) }}>{formatCurrency(amt as number)}</Typography>
          </Paper>
        ))}
      </Box>

      {/* Settlement info */}
      {assignment?.status === 'settled' && assignment?.settled_at && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Settled on {new Date(assignment.settled_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} — Total: {formatCurrency(summary?.total || 0)}
        </Alert>
      )}

      {/* Expenses table */}
      <Typography variant="h6" sx={{ mb: 2 }}>Expenses ({expenses?.length || 0})</Typography>
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        {!expenses?.length ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">No expenses yet</Typography></Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell>Date</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Settlement</TableCell>
                <TableCell>Receipt</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {expenses.map((exp: any) => (
                <TableRow key={exp.id} hover>
                  <TableCell>{new Date(exp.transaction_date).toLocaleDateString('en-IN')}</TableCell>
                  <TableCell><Chip label={getCategoryLabel(exp.category)} size="small" sx={{ bgcolor: `${getCategoryColor(exp.category)}14`, color: getCategoryColor(exp.category) }} /></TableCell>
                  <TableCell>{exp.description}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(exp.amount)}</TableCell>
                  <TableCell><Chip label={exp.settlement_status} size="small" color={exp.settlement_status === 'settled' ? 'success' : 'warning'} variant="outlined" /></TableCell>
                  <TableCell>{exp.receipt_url ? <Tooltip title="View receipt"><ReceiptIcon fontSize="small" color="primary" /></Tooltip> : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      <AddExpenseDialog
        open={expenseDialogOpen}
        onClose={() => setExpenseDialogOpen(false)}
        onSaved={fetchData}
        adminId={adminProfile?.id || ''}
        preSelectedAssignment={{ id: params.id, title: assignment?.title }}
        assignments={[{ id: params.id, title: assignment?.title, staff_name: assignment?.staff_name }]}
      />
    </Box>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/(dashboard)/staff-assignments/ apps/admin/src/components/expenses/AddAssignmentDialog.tsx
git commit -m "feat(admin): add staff assignments list and detail pages"
```

---

## Task 9: Financial Dashboard Page

**Files:**
- Create: `apps/admin/src/app/(dashboard)/financial-dashboard/page.tsx`

- [ ] **Step 1: Create Financial Dashboard page**

Create `apps/admin/src/app/(dashboard)/financial-dashboard/page.tsx`:

```typescript
// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Alert, CircularProgress, TextField,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@neram/ui';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import PercentIcon from '@mui/icons-material/Percent';
import PeopleIcon from '@mui/icons-material/People';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer } from 'recharts';
import { getCategoryLabel, getCategoryColor, formatCurrency } from '@/components/expenses/ExpenseConstants';

function KPICard({ title, value, subtitle, icon, color, loading }: {
  title: string; value: string; subtitle?: string; icon: React.ReactNode; color: string; loading: boolean;
}) {
  return (
    <Paper elevation={0} sx={{ p: 2, borderRadius: 1, border: '1px solid', borderColor: 'grey.200', flex: 1, minWidth: 170 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="body2" color="text.secondary">{title}</Typography>
          <Typography variant="h5" fontWeight={700} sx={{ color, mt: 0.5 }}>{loading ? '...' : value}</Typography>
          {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
        </Box>
        <Box sx={{ width: 36, height: 36, borderRadius: 1, bgcolor: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </Box>
      </Box>
    </Paper>
  );
}

const CHART_COLORS = ['#1976D2', '#E64A19', '#7B1FA2', '#0097A7', '#388E3C', '#F57C00', '#5C6BC0', '#455A64', '#795548', '#9E9E9E'];

export default function FinancialDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Default: current month
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  const fetchDashboard = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/financial-dashboard?startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) throw new Error('Failed to fetch');
      setData(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const s = data?.summary || {};
  const profitColor = s.net_profit >= 0 ? '#388E3C' : '#D32F2F';
  const momArrow = s.mom_change >= 0 ? '↑' : '↓';

  // Pie chart data
  const pieData = Object.entries(data?.category_breakdown || {}).map(([key, value]) => ({
    name: getCategoryLabel(key),
    value: value as number,
    color: getCategoryColor(key),
  }));

  // Category table with comparison
  const categoryRows = Object.entries(data?.category_breakdown || {}).map(([cat, amt]) => {
    const prevAmt = (data?.prev_category_breakdown || {})[cat] || 0;
    const change = prevAmt > 0 ? (((amt as number) - prevAmt) / prevAmt) * 100 : 0;
    const pctOfTotal = s.total_expenses > 0 ? ((amt as number) / s.total_expenses) * 100 : 0;
    return { category: cat, amount: amt as number, prevAmount: prevAmt, change, pctOfTotal };
  }).sort((a, b) => b.amount - a.amount);

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AnalyticsIcon sx={{ fontSize: 28 }} />
          <Typography variant="h4" fontWeight={700}>Financial Dashboard</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField type="date" label="From" size="small" value={startDate} onChange={e => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField type="date" label="To" size="small" value={endDate} onChange={e => setEndDate(e.target.value)} InputLabelProps={{ shrink: true }} />
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* KPI Cards */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, overflowX: 'auto', pb: 1 }}>
        <KPICard title="Total Income" value={formatCurrency(s.total_income || 0)}
          subtitle={`Fees: ${formatCurrency(s.student_fee_income || 0)} | Side: ${formatCurrency(s.side_income || 0)}`}
          icon={<TrendingUpIcon sx={{ color: '#388E3C', fontSize: 20 }} />} color="#388E3C" loading={loading} />
        <KPICard title="Total Expenses" value={formatCurrency(s.total_expenses || 0)}
          icon={<TrendingDownIcon sx={{ color: '#D32F2F', fontSize: 20 }} />} color="#D32F2F" loading={loading} />
        <KPICard title="Net Profit/Loss" value={formatCurrency(s.net_profit || 0)}
          icon={<AccountBalanceIcon sx={{ color: profitColor, fontSize: 20 }} />} color={profitColor} loading={loading} />
        <KPICard title="Profit Margin" value={`${s.profit_margin || 0}%`}
          icon={<PercentIcon sx={{ color: '#1976D2', fontSize: 20 }} />} color="#1976D2" loading={loading} />
        <KPICard title="Expense / Student" value={formatCurrency(s.expense_per_student || 0)}
          subtitle={`${s.student_count || 0} students`}
          icon={<PeopleIcon sx={{ color: '#7B1FA2', fontSize: 20 }} />} color="#7B1FA2" loading={loading} />
        <KPICard title="MoM Change" value={`${momArrow} ${Math.abs(s.mom_change || 0)}%`}
          icon={<CompareArrowsIcon sx={{ color: s.mom_change >= 0 ? '#388E3C' : '#D32F2F', fontSize: 20 }} />}
          color={s.mom_change >= 0 ? '#388E3C' : '#D32F2F'} loading={loading} />
      </Box>

      {/* Charts */}
      {!loading && (
        <Box sx={{ display: 'flex', gap: 3, mb: 3, flexWrap: 'wrap' }}>
          {/* Pie chart */}
          <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', flex: 1, minWidth: 350 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Expense Breakdown by Category</Typography>
            {pieData.length === 0 ? (
              <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>No expense data</Typography>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color || CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <RTooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Paper>

          {/* Bar chart */}
          <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', flex: 1, minWidth: 350 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Income vs Expenses (Last 6 Months)</Typography>
            {!data?.monthly_series?.length ? (
              <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>No monthly data</Typography>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.monthly_series}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                  <RTooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="income" name="Income" fill="#388E3C" />
                  <Bar dataKey="expenses" name="Expenses" fill="#D32F2F" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </Box>
      )}

      {/* Category breakdown table */}
      {!loading && categoryRows.length > 0 && (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
          <Box sx={{ p: 2 }}>
            <Typography variant="h6">Category Breakdown</Typography>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell>Category</TableCell>
                  <TableCell align="right">This Period</TableCell>
                  <TableCell align="right">Previous Period</TableCell>
                  <TableCell align="right">Change %</TableCell>
                  <TableCell align="right">% of Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {categoryRows.map(row => (
                  <TableRow key={row.category} hover>
                    <TableCell sx={{ fontWeight: 500 }}>{getCategoryLabel(row.category)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(row.amount)}</TableCell>
                    <TableCell align="right">{formatCurrency(row.prevAmount)}</TableCell>
                    <TableCell align="right" sx={{ color: row.change > 0 ? '#D32F2F' : row.change < 0 ? '#388E3C' : 'text.secondary' }}>
                      {row.change !== 0 ? `${row.change > 0 ? '+' : ''}${row.change.toFixed(1)}%` : '—'}
                    </TableCell>
                    <TableCell align="right">{row.pctOfTotal.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Insights */}
      {!loading && data?.insights && (
        <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Insights</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {data.insights.highest_single_expense > 0 && (
              <Typography variant="body2">Highest single expense this period: <strong>{formatCurrency(data.insights.highest_single_expense)}</strong></Typography>
            )}
            {s.income_per_student > 0 && (
              <Typography variant="body2">Average income per student: <strong>{formatCurrency(s.income_per_student)}</strong></Typography>
            )}
            {data.insights.top_assignment && (
              <Typography variant="body2">
                Top staff assignment: <strong>{data.insights.top_assignment.staff_name} — {data.insights.top_assignment.title}</strong> ({formatCurrency(data.insights.top_assignment.total)})
              </Typography>
            )}
            {s.mom_change !== 0 && (
              <Typography variant="body2">
                Income trend: <strong style={{ color: s.mom_change >= 0 ? '#388E3C' : '#D32F2F' }}>{s.mom_change >= 0 ? 'Improving' : 'Declining'} ({momArrow}{Math.abs(s.mom_change)}%)</strong> compared to previous period
              </Typography>
            )}
          </Box>
        </Paper>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/app/(dashboard)/financial-dashboard/
git commit -m "feat(admin): add financial dashboard with P&L, charts, and insights"
```

---

## Task 10: Create Supabase Storage Bucket

- [ ] **Step 1: Create expense-receipts bucket on staging**

Run via `mcp__supabase-staging__execute_sql`:
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-receipts', 'expense-receipts', true)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Create bucket on production**

Run via `mcp__supabase-prod__execute_sql`:
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-receipts', 'expense-receipts', true)
ON CONFLICT (id) DO NOTHING;
```

---

## Task 11: Verify End-to-End

- [ ] **Step 1: Build the admin app**

```bash
cd c:/Users/Haribabu/Documents/AppsCopilot/2026/NeramEcosystem && pnpm build --filter @neram/admin
```

Fix any TypeScript or build errors.

- [ ] **Step 2: Run dev server and test manually**

```bash
pnpm dev:admin
```

Test the following flows:
1. Navigate to `/expenses` — page loads, empty state shows
2. Click "Add Expense" — dialog opens, fill form, submit
3. Click "Add Income" — dialog opens, fill form, submit
4. Verify stats cards update
5. Filter by type, category, settlement status
6. Select expenses and bulk settle
7. Navigate to `/staff-assignments` — create a new assignment
8. Click into assignment detail — add expenses linked to it
9. Verify summary cards show correct category totals
10. Settle the assignment — verify all linked expenses settle
11. Navigate to `/financial-dashboard` — verify KPIs, charts, category table
12. Change date range — data updates

- [ ] **Step 3: Final commit if any fixes**

```bash
git add -A
git commit -m "fix(admin): address build and runtime issues in expense tracker"
```
