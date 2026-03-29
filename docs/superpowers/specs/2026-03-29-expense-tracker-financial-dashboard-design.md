# Expense Tracker & Financial Dashboard — Design Spec

## Context

Neram Classes conducts offline classes in multiple cities. Staff like Tamil Children travel to cities (Coimbatore, etc.) and incur daily expenses (food, travel, accommodation) that the office reimburses. Additionally, the business has recurring operational expenses (Google Ads, salaries, cloud subscriptions, equipment) and side income (college referrals, website listings) beyond student fees.

Currently there is no way to track these expenses or see overall financial health. The goal is to give admins a clear picture of:
- Where money is being spent, by whom, and on what
- Total income (student fees + side income) vs total expenses
- Monthly and seasonal P&L with trends
- Staff field assignment tracking with settlement

## Scope

**In scope:**
- Expense & side income entry (admin-only)
- Staff assignment/trip grouping for field expenses
- Receipt photo uploads (Supabase Storage)
- Settlement tracking (assignment-level and individual)
- Financial dashboard with P&L, charts, category breakdown
- Computed insights (no AI/LLM — pure calculation)
- Auto-pull student fee income from existing `payments` table

**Out of scope (future):**
- Staff self-service expense submission
- AI-powered financial suggestions
- Budget planning / forecasting
- Expense approval workflows
- Integration with accounting software

## Data Model

### Table: `expense_assignments`

Represents a staff field trip or assignment (e.g., "Tamil — Coimbatore Offline Center").

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `title` | TEXT | NOT NULL | e.g., "Coimbatore Offline Center" |
| `staff_name` | TEXT | NOT NULL | e.g., "Tamil Children" |
| `city` | TEXT | | nullable — city name |
| `start_date` | DATE | NOT NULL | trip start |
| `end_date` | DATE | | nullable — ongoing if null |
| `status` | TEXT | NOT NULL DEFAULT 'active', CHECK IN ('active','completed','settled') | |
| `settled_at` | TIMESTAMPTZ | | when settlement was done |
| `notes` | TEXT | | |
| `created_by` | UUID | NOT NULL, FK → users(id) | admin who created |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `staff_name`, `status`, `created_at DESC`

### Table: `financial_transactions`

Unified ledger for all expenses and side income entries.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `type` | TEXT | NOT NULL, CHECK IN ('expense','income') | |
| `category` | TEXT | NOT NULL | from predefined list |
| `amount` | NUMERIC(10,2) | NOT NULL, CHECK > 0 | always positive |
| `description` | TEXT | NOT NULL | what it's for |
| `transaction_date` | DATE | NOT NULL | when it happened |
| `assignment_id` | UUID | FK → expense_assignments(id) ON DELETE SET NULL | nullable — links field expenses to a trip |
| `settlement_status` | TEXT | DEFAULT 'pending', CHECK IN ('pending','settled') | for standalone expenses |
| `settled_at` | TIMESTAMPTZ | | |
| `receipt_url` | TEXT | | Supabase Storage URL |
| `notes` | TEXT | | |
| `created_by` | UUID | NOT NULL, FK → users(id) | |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Indexes:** `type`, `category`, `transaction_date DESC`, `assignment_id`, `settlement_status`, compound `(type, transaction_date DESC)`

### Categories

**Expense categories:**

| Key | Display Name | Used for |
|-----|-------------|----------|
| `staff_travel` | Staff Travel | Transport, auto, bus, train, flight |
| `staff_food` | Staff Food | Food, tea, snacks, meals |
| `staff_accommodation` | Staff Accommodation | Hotel, room rent |
| `google_ads` | Google Ads | Google Ads / digital marketing |
| `staff_salary` | Staff Salary | Staff salaries |
| `exam_center` | Exam Center | Exam center visit expenses |
| `cloud_tech` | Cloud & Tech | Supabase, Vercel, domains, subscriptions |
| `office_bills` | Office & Bills | Internet, VPA, utilities |
| `equipment` | Equipment | Hardware, devices |
| `misc_expense` | Miscellaneous | Other expenses |

**Income categories:**

| Key | Display Name | Used for |
|-----|-------------|----------|
| `college_referral` | College Referral | Commission for student referrals |
| `website_listing` | Website Listing | College website listing fees |
| `misc_income` | Miscellaneous | Other side income |

### Student Fee Income (read-only from existing data)

Student fee payments are pulled from the existing `payments` table:
```sql
SELECT SUM(amount) FROM payments WHERE status = 'paid' AND ...date filters...
```
This data is NOT duplicated into `financial_transactions`. The dashboard queries join/union this at read time.

### RLS Policies

Both tables:
- `SELECT`: authenticated users (all admins can view)
- `INSERT/UPDATE/DELETE`: service_role only (admin API routes use `createAdminClient()`)

### Supabase Storage

- **Bucket:** `expense-receipts`
- **Path pattern:** `receipts/{transaction_id}/{filename}`
- **Policy:** service_role upload, authenticated read

## UI Design

### Navigation (Sidebar)

Under the existing **Finance** group:

```
Finance
├── Payments              (existing)
├── Fee Structures        (existing)
├── Expenses              (NEW)
├── Staff Assignments     (NEW)
└── Financial Dashboard   (NEW)
```

Icons: Expenses → ReceiptLong, Staff Assignments → BusinessCenter, Financial Dashboard → Analytics

### Page 1: Expenses (`/expenses`)

**Purpose:** List, add, edit, and settle all expenses and side income.

**Layout:**

1. **Header row:** Page title + "Add Expense" button + "Add Income" button
2. **Filter bar:** Date range picker | Category dropdown | Type (All/Expense/Income) | Assignment dropdown | Settlement (All/Pending/Settled)
3. **Stats cards (4):**
   - Total Expenses (this month)
   - Total Side Income (this month)
   - Unsettled Expenses (count + amount)
   - Top Expense Category
4. **Table** (Material React Table):
   - Columns: Date | Type (chip) | Category (chip) | Description | Assignment (link) | Amount | Settlement (chip) | Receipt (icon) | Actions (edit/delete)
   - Row click → opens Edit dialog
   - Bulk select → "Mark as Settled" action
   - Pagination, sorting, search

**Add/Edit Expense Dialog:**
- Type toggle: Expense / Income
- Category dropdown (filtered by type)
- Amount (numeric input)
- Description (text)
- Date picker
- Assignment dropdown (only for expenses, optional)
- Receipt upload (drag & drop or click, image preview)
- Notes (optional textarea)

### Page 2: Staff Assignments (`/staff-assignments`)

**Purpose:** Manage staff field trips and view their expenses.

**Layout:**

1. **Header:** Title + "New Assignment" button
2. **Filter bar:** Staff name | Status (All/Active/Completed/Settled) | City
3. **Table:**
   - Columns: Staff | Title | City | Date Range | Status (chip) | Total Spent | # Expenses | Actions

**Assignment Detail (`/staff-assignments/[id]`):**

1. **Header:** Back button + "Tamil Children — Coimbatore Offline Center" + Status badge
2. **Action buttons:** Add Expense | Mark Complete | Settle All
3. **Summary cards (4-5):**
   - Total Spent
   - Food subtotal
   - Travel subtotal
   - Accommodation subtotal
   - Other subtotal
4. **Expenses table:** All transactions linked to this assignment
   - Columns: Date | Category | Description | Amount | Receipt | Settlement
5. **Settlement section** (when settled): Settlement date, total settled amount

### Page 3: Financial Dashboard (`/financial-dashboard`)

**Purpose:** P&L overview with charts and computed insights.

**Layout:**

1. **Date controls:** Month picker (default: current month) + Custom date range ("Season" mode, e.g., Jan-Apr 2026)

2. **KPI cards row (6):**
   - Total Income (student fees + side income)
   - Total Expenses
   - Net Profit/Loss (green/red)
   - Profit Margin %
   - Expense per Student
   - Month-over-Month change (% arrow up/down)

3. **Charts row (2 side-by-side on desktop, stacked on tablet):**
   - **Pie/Donut chart:** Expense breakdown by category
   - **Bar chart:** Monthly income vs expenses (last 6 months)

4. **Category breakdown table:**
   - Columns: Category | This Month | Last Month | Change % | % of Total Expenses
   - Sorted by amount descending

5. **Insights section (computed, not AI):**
   - Top expense category and its % of total
   - Average monthly expense (trailing 3 months)
   - Average income per enrolled student
   - Month-over-month trend direction
   - Highest single expense this period
   - Staff assignment with highest total spend

**Chart library:** Use lightweight charts — either MUI X Charts (already in MUI ecosystem) or recharts. Check which is already in the project; prefer what's already available.

## API Routes

All routes under `apps/admin/src/app/api/`:

### Expenses
- `GET /api/expenses` — list transactions with filters (type, category, date range, assignment, settlement)
- `POST /api/expenses` — create transaction
- `PUT /api/expenses/[id]` — update transaction
- `DELETE /api/expenses/[id]` — delete transaction
- `POST /api/expenses/bulk-settle` — mark multiple as settled
- `POST /api/expenses/upload-receipt` — upload receipt to Supabase Storage

### Assignments
- `GET /api/staff-assignments` — list assignments with filters
- `POST /api/staff-assignments` — create assignment
- `PUT /api/staff-assignments/[id]` — update assignment (status, details)
- `GET /api/staff-assignments/[id]` — get assignment with summary stats
- `POST /api/staff-assignments/[id]/settle` — settle assignment + all linked expenses

### Dashboard
- `GET /api/financial-dashboard` — aggregated P&L data for a date range
  - Returns: income totals (fees + side), expense totals, category breakdown, monthly series, insights

## Verification Plan

1. **Database:** Apply migration to staging via MCP, verify tables exist with correct columns
2. **API:** Test each endpoint via curl/browser — create expense, create assignment, link expense to assignment, settle, upload receipt
3. **UI - Expenses page:** Add expense, add income, filter by category/type/date, bulk settle, view receipt
4. **UI - Assignments page:** Create assignment, add expenses to it, view detail page with summary, settle all
5. **UI - Dashboard:** Verify KPI cards show correct totals, charts render, category table is accurate, insights compute correctly
6. **Cross-check:** Verify student fee income on dashboard matches the Payments page totals for the same period
7. **Edge cases:** Empty state (no data), single expense, negative profit display, long descriptions
